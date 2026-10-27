import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from habi_worker.shared_ai import SharedAICancelled, generate, validate_service


class SharedAIHandler(BaseHTTPRequestHandler):
    requests = []

    def log_message(self, *_args):
        pass

    def _send(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        self.requests.append(("GET", self.path, self.headers.get("Authorization")))
        if self.path == "/v1/job-types":
            return self._send(200, {"job_types": {"text_chat": {"available_models": ["granite4:1b-h"]}}})
        if self.path == "/v1/models":
            return self._send(200, {"data": [{"id": "granite4:1b-h"}]})
        return self._send(200, {"status": "completed", "result": {
            "model": "granite4:1b-h",
            "choices": [{"message": {"content": '{"claims":[],"unknowns":[]}'}}],
        }})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.requests.append(("POST", self.path, self.headers.get("Authorization"), self.headers.get("Idempotency-Key"), body))
        return self._send(202, {"id": "job-one", "task": "text_chat", "status_url": "/v1/jobs/job-one"})


class SharedAIClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), SharedAIHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join(timeout=2)
        cls.server.server_close()

    def setUp(self):
        SharedAIHandler.requests = []
        self.config = SimpleNamespace(
            shared_ai_origin="http://127.0.0.1:%s/v1" % self.server.server_port,
            shared_ai_key="synthetic-shared-key-never-log-this-value",
            shared_ai_model="auto",
        )

    def test_discovery_confirms_permitted_job_and_catalog(self):
        self.assertEqual(validate_service(self.config), {"task": "text_chat", "model": "auto"})
        self.assertEqual([item[1] for item in SharedAIHandler.requests], ["/v1/job-types", "/v1/models"])
        self.assertTrue(all(item[2] == "Bearer " + self.config.shared_ai_key for item in SharedAIHandler.requests))

    def test_superseded_job_stops_polling_and_releases_the_worker(self):
        checks = iter([False, True])
        with self.assertRaises(SharedAICancelled):
            generate(self.config, "system", "question", "cancel-test", should_cancel=lambda: next(checks))
        self.assertEqual(len([r for r in SharedAIHandler.requests if r[0] == "POST"]), 1)
        self.assertFalse(any(r[0] == "GET" and "/jobs/" in r[1] for r in SharedAIHandler.requests))

    def test_async_job_uses_auto_and_stable_idempotency_then_polls(self):
        with patch("habi_worker.shared_ai.POLL_SECONDS", 0):
            generated, model = generate(self.config, "synthetic system", "synthetic question", "turn-7:revision-2")
        self.assertEqual(generated["claims"], [])
        self.assertEqual(model, "granite4:1b-h")
        post = next(item for item in SharedAIHandler.requests if item[0] == "POST")
        self.assertEqual(post[3], "habi-" + post[3][5:])
        self.assertEqual(post[4]["model"], "auto")
        self.assertEqual(post[4]["task"], "text_chat")
        self.assertEqual(post[4]["input"]["response_format"], {"type": "json_object"})
        self.assertTrue(any(item[1] == "/v1/jobs/job-one" for item in SharedAIHandler.requests))


if __name__ == "__main__":
    unittest.main()
