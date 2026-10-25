import unittest

from habi_worker.config import load_config


class WorkerConfigTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            "HG_CLOUD_API_ORIGIN": "https://habi-test.example",
            "HG_WORKER_CLIENT_ID": "worker-test",
            "HG_WORKER_CLIENT_SECRET": "synthetic-placeholder-worker-secret",
            "HG_WORKER_SSO_TOKEN_ENDPOINT": "https://sso.example/oauth/token",
            "HG_HOST_LOCK_PATH": "/tmp/habi-test.lock",
            "HG_OLLAMA_ORIGIN": "http://127.0.0.1:11434",
            "HG_MODEL": "qwen2.5:7b",
            "HG_MODEL_DIGEST": "sha256:" + "a" * 64,
            "HG_PROMPT_HASH": "b" * 64,
        }

    def test_accepts_scoped_worker_environment(self):
        config = load_config(self.env)
        self.assertEqual(config.model, "qwen2.5:7b")
        self.assertNotIn("synthetic-placeholder-worker-secret", repr(config))

    def test_requires_all_worker_values(self):
        del self.env["HG_MODEL_DIGEST"]
        with self.assertRaisesRegex(ValueError, "HG_MODEL_DIGEST"):
            load_config(self.env)

    def test_cloud_origin_must_use_tls(self):
        self.env["HG_CLOUD_API_ORIGIN"] = "http://habi-test.example"
        with self.assertRaisesRegex(ValueError, "must use HTTPS"):
            load_config(self.env)

    def test_ollama_must_be_on_local_host(self):
        self.env["HG_OLLAMA_ORIGIN"] = "https://ollama.example"
        with self.assertRaisesRegex(ValueError, "local model host"):
            load_config(self.env)

    def test_cloud_database_credentials_are_rejected(self):
        self.env["HG_ATLAS_URI"] = "mongodb+srv://example.invalid"
        with self.assertRaisesRegex(ValueError, "forbidden on the worker"):
            load_config(self.env)

    def test_worker_token_endpoint_requires_tls(self):
        self.env["HG_WORKER_SSO_TOKEN_ENDPOINT"] = "http://sso.example/oauth/token"
        with self.assertRaisesRegex(ValueError, "must use HTTPS"):
            load_config(self.env)


if __name__ == "__main__":
    unittest.main()
