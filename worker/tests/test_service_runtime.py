import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from habi_worker.service_runtime import _answer_for_context


class InterpretationEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.prompt_path = Path(self.temp.name) / "prompt.md"
        self.prompt_path.write_text("synthetic system prompt", encoding="utf-8")
        self.config = SimpleNamespace(
            prompt_path=str(self.prompt_path),
            ollama_origin="http://127.0.0.1:11434",
            model="qwen2.5:7b",
        )
        self.ref = {"id": "checkin-1", "revision": 1, "span": None}
        self.context = {
            "sourceManifest": [self.ref],
            "sourceSnapshots": [{"id": "checkin-1", "revision": 1, "answerCodes": [{"metric": "energy", "code": 2}]}],
            "promptManifest": {"promptHash": hashlib.sha256(b"synthetic").hexdigest()},
            "question": "Mit mutat ez a napi állapotjelzés?",
            "turnRevision": 1,
        }

    def tearDown(self):
        self.temp.cleanup()

    def answer(self, claims):
        response = {"done": True, "response": json.dumps({"claims": claims, "unknowns": [], "attributions": []})}
        with patch("habi_worker.service_runtime._request_json", return_value=response) as request:
            result = _answer_for_context(self.config, self.context)
        return result, request.call_args.args[1]["prompt"]

    def test_accepts_exact_object_evidence_reference_and_requests_contract(self):
        result, prompt = self.answer([{
            "text": "A válasz a napi energiaértékelésre vonatkozik.",
            "kind": "interpretation",
            "evidenceRefs": [{"id": "checkin-1", "revision": 1, "span": None}],
        }])

        self.assertEqual(result["status"], "awaiting_review")
        self.assertEqual(result["claims"][0]["evidenceRefs"], [self.ref])
        self.assertIn("Minden evidenceRefs elem objektum legyen pontosan id, revision és span mezőkkel", prompt)
        self.assertIn("kizárólag direct, general vagy inference", prompt)

    def test_rejects_string_only_evidence_reference(self):
        result, _ = self.answer([{
            "text": "A válasz a napi energiaértékelésre vonatkozik.",
            "kind": "direct",
            "evidenceRefs": ["checkin-1"],
        }])

        self.assertEqual(result["status"], "no_evidence")
        self.assertEqual(result["claims"], [])


if __name__ == "__main__":
    unittest.main()
