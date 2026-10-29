import json
import io
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from habi_worker.shared_ai import _request, _Retryable, SharedAICancelled, SharedAIError, _json_answer, SERVICE_OUTPUT_LIMITS, SERVICE_CONTEXT_LIMITS, SERVICE_TASK_MODELS, generate, validate_service


class SharedAIHandler(BaseHTTPRequestHandler):
    output_limit = 512
    outputs = []
    phases = []
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
            return self._send(200, {"job_types": {"text_chat": {"model":"granite4:1b-h","available_models": ["granite4:1b-h"]}}})
        if self.path == "/v1/models":
            return self._send(200, {"data": [{"id": "granite4:1b-h", "rankings":{"text_chat":{"profile":{"max_output_tokens":self.output_limit, "num_ctx":4096}}}}]})
        if self.phases:
            return self._send(200,{"status":self.phases.pop(0)})
        content=self.outputs.pop(0) if self.outputs else '{"claims":[],"unknowns":[]}'
        return self._send(200, {"status": "completed", "result": {
            "model": "granite4:1b-h",
            "choices": [{"message": {"content": content}}],
        }})

    def do_DELETE(self):
        self.requests.append(("DELETE", self.path))
        return self._send(200, {})

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
        SERVICE_OUTPUT_LIMITS.clear()
        SharedAIHandler.output_limit=512
        SharedAIHandler.outputs=[]
        SharedAIHandler.phases=[]
        self.config = SimpleNamespace(
            shared_ai_origin="http://127.0.0.1:%s/v1" % self.server.server_port,
            shared_ai_key="synthetic-shared-key-never-log-this-value",
            shared_ai_model="auto",
        )

    def test_complete_fenced_json_is_accepted_but_partial_json_is_not(self):
        self.assertEqual(_json_answer('```json\n{"claims":[]}\n```'), {"claims":[]})
        with self.assertRaises(SharedAIError):
            _json_answer('{"claims":[{"text":"cut off')
        with self.assertRaises(SharedAIError):
            _json_answer('{"claims":["not a claim object"]}')

    def test_plain_rewrite_has_its_own_complete_text_contract(self):
        self.assertEqual(_json_answer('{"text":"keveset aludt."}', "plain_text"), {"text": "keveset aludt."})
        for text in ['{"text":"cut off', '{"text":42}', '{"claims":[]}']:
            with self.assertRaises(SharedAIError):
                _json_answer(text, "plain_text")
        with self.assertRaises(SharedAIError):
            _json_answer('{"text":"keveset aludt."}')
        SharedAIHandler.outputs = ['{"text":"keveset aludt."}']
        with patch("habi_worker.shared_ai.POLL_SECONDS", 0):
            generated, model = generate(self.config, "system", "facts", "plain-output", response_kind="plain_text")
        self.assertEqual(generated["text"], "keveset aludt.")
        self.assertEqual(len([r for r in SharedAIHandler.requests if r[0] == "POST"]), 1)

    def test_conversation_preserves_true_roles_and_latest_user_message(self):
        SharedAIHandler.outputs = ['{"text":"Köszönöm a pontosítást."}']
        history = [{"role":"user","content":"Hogy van?"},{"role":"assistant","content":"Változott valami?"}]
        with patch("habi_worker.shared_ai.POLL_SECONDS",0):
            generate(self.config,"system","Jobban van.","dialogue-order",response_kind="plain_text",history=history)
        post=next(r for r in SharedAIHandler.requests if r[0]=="POST")
        messages=post[4]["input"]["messages"]
        self.assertEqual([m["role"] for m in messages],["system","user","assistant","user"])
        self.assertEqual(messages[-1]["content"],"Jobban van.")

    def test_raw_conversation_does_not_request_json_or_change_default_claim_validation(self):
        SharedAIHandler.outputs = ["Köszönöm a pontosítást. Evett már azóta?"]
        with patch("habi_worker.shared_ai.POLL_SECONDS", 0):
            result, _ = generate(self.config, "system", "Jobban van.", "raw-conversation", response_kind="conversation")
        self.assertEqual(result["text"], "Köszönöm a pontosítást. Evett már azóta?")
        post = next(r for r in SharedAIHandler.requests if r[0] == "POST")
        self.assertNotIn("response_format", post[4]["input"])
        with self.assertRaises(SharedAIError):
            _json_answer(result["text"])

    def test_test_purpose_is_explicit_and_never_added_to_production_by_default(self):
        for purpose in (None, "test"):
            self.config.shared_ai_request_purpose = purpose
            response = unittest.mock.MagicMock()
            response.__enter__.return_value.read.return_value = b'{}'
            response.__enter__.return_value.status = 200
            response.__enter__.return_value.headers = {}
            with patch("urllib.request.urlopen", return_value=response) as request:
                _request(self.config, "GET", "/models")
            self.assertEqual(request.call_args.args[0].get_header("X-request-purpose"), purpose)

    def test_maintenance_is_distinguished_from_an_ordinary_provider_failure(self):
        error=urllib.error.HTTPError("http://synthetic/jobs",503,"maintenance",{"Retry-After":"10"},io.BytesIO(b'{"error":{"code":"model_storage_maintenance"}}'))
        with patch("urllib.request.urlopen",side_effect=error):
            with self.assertRaises(_Retryable) as raised:_request(self.config,"POST","/jobs",{})
        self.assertEqual(raised.exception.code,"SHARED_AI_MAINTENANCE")

    def test_truncated_response_retries_once_with_room_and_reports_real_phases(self):
        SharedAIHandler.output_limit=1024
        validate_service(self.config)
        SharedAIHandler.outputs=['{"claims":[', '{"claims":[],"unknowns":["hiányzó adat"]}']
        SharedAIHandler.phases=["queued","running"]
        phases=[]
        with patch("habi_worker.shared_ai.POLL_SECONDS",0):
            generated,_=generate(self.config,"system","question","retry-output",on_progress=phases.append)
        self.assertEqual(generated["unknowns"],["hiányzó adat"])
        posts=[r for r in SharedAIHandler.requests if r[0]=="POST"]
        self.assertEqual([p[4]["input"]["max_tokens"] for p in posts],[512,1024])
        self.assertNotEqual(posts[0][3],posts[1][3])
        self.assertIn("provider_queued",phases);self.assertIn("generating",phases);self.assertIn("repairing",phases);self.assertIn("checking",phases)

    def test_hungarian_task_is_discovered_routed_and_deleted_without_changing_english(self):
        self.config.shared_ai_dialogue_task = "text_chat_hu"
        catalog = {"jobTypes": {
            "text_chat": {"model":"english", "available_models":["english"]},
            "text_chat_hu": {"model":"hungarian", "available_models":["hungarian"]}},
            "models": [
                {"id":"english", "rankings":{"text_chat":{"profile":{"num_ctx":8192, "max_output_tokens":1024}}}},
                {"id":"hungarian", "rankings":{"text_chat_hu":{"profile":{"num_ctx":1024}}}},
            ]}
        with patch("habi_worker.shared_ai._authorized_capabilities", return_value=catalog):
            validate_service(self.config)
        from habi_worker.coach_dialogue import dialogue_config
        from habi_worker.shared_ai import service_limits
        selected = dialogue_config(self.config)
        self.assertEqual(service_limits(selected), (1024,128))
        self.assertEqual(service_limits(self.config), (8192,1024))
        SharedAIHandler.outputs = ["Köszönöm. Mit szeretnél tudni?"]
        with patch("habi_worker.shared_ai.POLL_SECONDS",0):
            generate(selected,"Te Habi vagy.","Kérlek, segíts.","hungarian-wire", response_kind="conversation")
        post = next(r for r in SharedAIHandler.requests if r[0]=="POST")
        self.assertEqual(post[4]["task"],"text_chat_hu")
        self.assertEqual(post[4]["model"],"auto")
        self.assertEqual(post[4]["input"]["max_tokens"],128)
        self.assertEqual(post[4]["input"]["temperature"],0)
        self.assertIn(("DELETE","/v1/jobs/job-one"),SharedAIHandler.requests)
        self.assertEqual(getattr(self.config,"shared_ai_task","text_chat"),"text_chat")

    def test_missing_hungarian_permission_fails_without_falling_back_to_english(self):
        self.config.shared_ai_dialogue_task="text_chat_hu"
        with self.assertRaisesRegex(SharedAIError,"TASK_NOT_PERMITTED"):
            validate_service(self.config)

    def test_hungarian_limit_counts_utf8_bytes_before_submitting_job(self):
        self.config.shared_ai_task="text_chat_hu"
        self.config.shared_ai_output_tokens=128
        with self.assertRaisesRegex(SharedAIError,"INPUT_TOO_LARGE"):
            generate(self.config,"Habi","ő" * 400,"oversized-hu",response_kind="conversation")
        self.assertFalse(any(r[0]=="POST" for r in SharedAIHandler.requests))

    def test_discovery_confirms_permitted_job_and_catalog(self):
        self.assertEqual(validate_service(self.config), {"task": "text_chat", "model": "auto"})
        self.assertEqual([item[1] for item in SharedAIHandler.requests], ["/v1/job-types", "/v1/models"])
        self.assertEqual(SERVICE_CONTEXT_LIMITS[(self.config.shared_ai_origin, "auto")], 4096)
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
