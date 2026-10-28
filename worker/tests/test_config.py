import unittest

from habi_worker.config import load_config


class WorkerConfigTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            "HG_CLOUD_API_ORIGIN": "https://habi-test.example",
            "HG_WORKER_SERVICE_ID": "worker-test",
            "HG_WORKER_BEARER_TOKEN": "synthetic-placeholder-worker-secret-that-is-long-enough",
            "HG_HOST_LOCK_PATH": "/tmp/habi-test.lock",
            "HG_OLLAMA_ORIGIN": "http://127.0.0.1:11434",
            "HG_MODEL": "qwen2.5:7b",
            "HG_MODEL_DIGEST": "sha256:" + "a" * 64,
            "HG_PROMPT_HASH": "b" * 64,
            "HG_SHARED_AI_API_KEY": "synthetic-placeholder-shared-ai-secret-that-is-long-enough",
        }

    def test_accepts_scoped_worker_environment(self):
        config = load_config(self.env)
        self.assertEqual(config.model, "qwen2.5:7b")
        self.assertEqual(config.service_id, "worker-test")
        self.assertNotIn("synthetic-placeholder-worker-secret", repr(config))
        self.assertNotIn("synthetic-placeholder-shared-ai-secret", repr(config))
        self.assertEqual(config.shared_ai_model, "auto")

    def test_dialogue_override_and_test_purpose_are_explicit(self):
        self.assertEqual(load_config(self.env).shared_ai_dialogue_model, "auto")
        self.assertIsNone(load_config(self.env).shared_ai_request_purpose)
        self.env.update(HG_SHARED_AI_DIALOGUE_MODEL="qwen3:1.7b", HG_SHARED_AI_REQUEST_PURPOSE="test")
        config = load_config(self.env)
        self.assertEqual(config.shared_ai_dialogue_model, "qwen3:1.7b")
        self.assertEqual(config.shared_ai_request_purpose, "test")
        self.env["HG_SHARED_AI_REQUEST_PURPOSE"] = "production"
        with self.assertRaisesRegex(ValueError, "PURPOSE"):
            load_config(self.env)

    def test_requires_all_worker_values(self):
        del self.env["HG_MODEL_DIGEST"]
        with self.assertRaisesRegex(ValueError, "HG_MODEL_DIGEST"):
            load_config(self.env)

    def test_cloud_origin_must_use_tls(self):
        self.env["HG_CLOUD_API_ORIGIN"] = "http://habi-test.example"
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            load_config(self.env)

    def test_ollama_must_be_on_local_host(self):
        self.env["HG_OLLAMA_ORIGIN"] = "https://ollama.example"
        with self.assertRaisesRegex(ValueError, "local model host"):
            load_config(self.env)

    def test_cloud_database_credentials_are_rejected(self):
        self.env["HG_ATLAS_URI"] = "mongodb+srv://example.invalid"
        with self.assertRaisesRegex(ValueError, "forbidden on the worker"):
            load_config(self.env)

    def test_worker_bearer_token_requires_entropy(self):
        self.env["HG_WORKER_BEARER_TOKEN"] = "short"
        with self.assertRaisesRegex(ValueError, "at least 32 bytes"):
            load_config(self.env)

    def test_local_synthetic_mode_runs_without_cloud_or_sso_credentials(self):
        env = {
            "HG_WORKER_MODE": "local_synthetic",
            "HG_ENVIRONMENT": "development",
            "HG_SYNTHETIC_DATA_ONLY": "true",
            "HG_HOST_LOCK_PATH": "/tmp/habi-test.lock",
            "HG_OLLAMA_ORIGIN": "http://127.0.0.1:11434",
            "HG_MODEL": "qwen2.5:7b",
            "HG_MODEL_DIGEST": "sha256:" + "a" * 64,
            "HG_PROMPT_HASH": "b" * 64,
        }
        config = load_config(env)
        self.assertEqual(config.mode, "local_synthetic")
        self.assertIsNone(config.cloud_api_origin)
        self.assertIsNone(config.bearer_token)

    def test_local_synthetic_mode_requires_development_and_synthetic_only(self):
        env = {
            "HG_WORKER_MODE": "local_synthetic",
            "HG_ENVIRONMENT": "production",
            "HG_SYNTHETIC_DATA_ONLY": "false",
            "HG_HOST_LOCK_PATH": "/tmp/habi-test.lock",
            "HG_OLLAMA_ORIGIN": "http://127.0.0.1:11434",
            "HG_MODEL": "qwen2.5:7b",
            "HG_MODEL_DIGEST": "sha256:" + "a" * 64,
            "HG_PROMPT_HASH": "b" * 64,
        }
        with self.assertRaisesRegex(ValueError, "development and synthetic-only"):
            load_config(env)

    def test_local_synthetic_mode_rejects_cloud_credentials(self):
        env = {
            "HG_WORKER_MODE": "local_synthetic",
            "HG_ENVIRONMENT": "development",
            "HG_SYNTHETIC_DATA_ONLY": "true",
            "HG_HOST_LOCK_PATH": "/tmp/habi-test.lock",
            "HG_OLLAMA_ORIGIN": "http://127.0.0.1:11434",
            "HG_MODEL": "qwen2.5:7b",
            "HG_MODEL_DIGEST": "sha256:" + "a" * 64,
            "HG_PROMPT_HASH": "b" * 64,
            "HG_WORKER_BEARER_TOKEN": "must-not-be-present-and-too-short",
        }
        with self.assertRaisesRegex(ValueError, "forbidden in local_synthetic mode"):
            load_config(env)

    def test_local_synthetic_mode_rejects_user_sso_and_external_provider_secrets(self):
        env = {
            "HG_WORKER_MODE": "local_synthetic",
            "HG_ENVIRONMENT": "development",
            "HG_SYNTHETIC_DATA_ONLY": "true",
            "HG_HOST_LOCK_PATH": "/tmp/habi-test.lock",
            "HG_OLLAMA_ORIGIN": "http://127.0.0.1:11434",
            "HG_MODEL": "qwen2.5:7b",
            "HG_MODEL_DIGEST": "sha256:" + "a" * 64,
            "HG_PROMPT_HASH": "b" * 64,
            "HG_SSO_CLIENT_SECRET": "must-not-be-present",
        }
        with self.assertRaisesRegex(ValueError, "forbidden in local_synthetic mode"):
            load_config(env)


if __name__ == "__main__":
    unittest.main()
