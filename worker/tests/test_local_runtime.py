import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import tempfile
from threading import Thread
import unittest

from habi_worker.config import WorkerConfig
from habi_worker.host_lock import HostLockBusy, acquire_host_lock
from habi_worker.local_runtime import (
    WorkerDependencyError,
    run_local_smoke,
    verify_local_runtime,
)


class OllamaHandler(BaseHTTPRequestHandler):
    digest = "a" * 64
    output = "HABI_LOCAL_MODEL_OK"

    def log_message(self, *_args):
        return

    def do_GET(self):
        if self.path == "/api/version":
            body = {"version": "0.40.3"}
        elif self.path == "/api/tags":
            body = {"models": [{"name": "qwen2.5:7b", "digest": self.digest}]}
        else:
            self.send_error(404)
            return
        self._respond(body)

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", "0")))
        self._respond({"done": True, "response": self.output})

    def _respond(self, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class LocalRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), OllamaHandler)
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join()
        cls.server.server_close()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.prompt_path = Path(self.temp.name) / "prompt.md"
        self.prompt_path.write_text("synthetic prompt", encoding="utf-8")
        prompt_hash = hashlib.sha256(self.prompt_path.read_bytes()).hexdigest()
        self.config = WorkerConfig(
            mode="local_synthetic",
            host_lock_path=str(Path(self.temp.name) / "worker.lock"),
            ollama_origin="http://127.0.0.1:{0}".format(self.server.server_port),
            model="qwen2.5:7b",
            model_digest="sha256:" + "a" * 64,
            prompt_hash=prompt_hash,
            prompt_path=str(self.prompt_path),
        )
        OllamaHandler.digest = "a" * 64
        OllamaHandler.output = "HABI_LOCAL_MODEL_OK"

    def tearDown(self):
        self.temp.cleanup()

    def test_verifies_exact_local_model_digest_and_prompt_hash(self):
        result = verify_local_runtime(self.config)
        self.assertEqual(result["modelDigest"], self.config.model_digest)
        self.assertEqual(result["ollamaVersion"], "0.40.3")

    def test_runs_synthetic_inference_smoke(self):
        result = run_local_smoke(self.config)
        self.assertEqual(result["inference"], "passed")

    def test_rejects_model_digest_drift(self):
        OllamaHandler.digest = "c" * 64
        with self.assertRaisesRegex(WorkerDependencyError, "OLLAMA_MODEL_DIGEST_MISMATCH"):
            verify_local_runtime(self.config)

    def test_rejects_prompt_hash_drift(self):
        self.prompt_path.write_text("changed prompt", encoding="utf-8")
        with self.assertRaisesRegex(WorkerDependencyError, "WORKER_PROMPT_HASH_MISMATCH"):
            verify_local_runtime(self.config)

    def test_rejects_unexpected_smoke_output(self):
        OllamaHandler.output = "untrusted response"
        with self.assertRaisesRegex(WorkerDependencyError, "OLLAMA_SMOKE_OUTPUT_INVALID"):
            run_local_smoke(self.config)

    def test_host_lock_excludes_a_second_worker(self):
        with acquire_host_lock(self.config.host_lock_path):
            with self.assertRaises(HostLockBusy):
                with acquire_host_lock(self.config.host_lock_path):
                    self.fail("second worker must not acquire host lock")


if __name__ == "__main__":
    unittest.main()
