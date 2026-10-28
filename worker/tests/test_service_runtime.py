import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from habi_worker.shared_ai import SharedAIError
from habi_worker.service_runtime import _answer_for_context


class InterpretationEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.prompt_path = Path(self.temp.name) / "prompt.md"
        self.prompt_path.write_text("synthetic system prompt", encoding="utf-8")
        self.config = SimpleNamespace(
            mode="local_test",
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
            "jobId": "synthetic-job",
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

    def test_hosted_mode_uses_shared_api_and_records_actual_model(self):
        self.config.mode = "hosted"
        self.config.shared_ai_model = "auto"
        generated = {"claims": [], "unknowns": ["Nincs elegendő forrásadat."], "attributions": []}
        with patch("habi_worker.service_runtime.shared_ai_generate", return_value=(generated, "granite4:1b-h")) as request:
            result = _answer_for_context(self.config, self.context)
        self.assertEqual(result["status"], "no_evidence")
        self.assertEqual(result["manifest"]["modelArtifact"], "granite4:1b-h")
        self.assertEqual(result["questionRevision"], self.context["turnRevision"])
        self.assertEqual(request.call_args.args[0], self.config)
        self.assertIn("SOURCE_MANIFEST", request.call_args.args[2])

    def test_coach_followup_uses_dialogue_and_role_with_authored_evidence(self):
        self.prompt_path.with_name("coach-prompt.md").write_text("synthetic coach prompt", encoding="utf-8")
        self.context["promptManifest"]["promptHash"] = hashlib.sha256(b"synthetic coach prompt").hexdigest()
        self.context.update(coachMode=True, viewerRole="player", opening="Alvás", dialogue=[{"question":"Mit jelent?", "answer":"A saját beszámolódat mutatja."}])
        self.context["sourceSnapshots"]=[{"id":"checkin-1","revision":1,"kind":"authored_content","text":"A kijelzés saját beszámoló."}]
        result, prompt = self.answer([{"text":"A kijelzés saját beszámoló.", "kind":"general", "evidenceRefs":[self.ref]}])
        self.assertEqual(result["status"], "ready")
        self.assertIn("A saját beszámolódat mutatja.", prompt)
        self.assertIn("player", prompt)
        self.assertIn("nem új bizonyíték", prompt)

    def test_coach_personal_inference_still_requires_review(self):
        self.prompt_path.with_name("coach-prompt.md").write_text("synthetic coach prompt", encoding="utf-8")
        self.context["promptManifest"]["promptHash"] = hashlib.sha256(b"synthetic coach prompt").hexdigest()
        self.context.update(coachMode=True, viewerRole="player", opening="Alvás", dialogue=[])
        result, _ = self.answer([{"text":"Lehetséges összefüggés.", "kind":"inference", "evidenceRefs":[self.ref]}])
        self.assertEqual(result["status"], "awaiting_review")
        self.assertEqual(result["validity"], "review_required")

    def coach_context(self):
        text="synthetic coach prompt"
        self.prompt_path.with_name("coach-prompt.md").write_text(text,encoding="utf-8")
        self.context["promptManifest"]["promptHash"]=hashlib.sha256(text.encode()).hexdigest()
        self.context.update(coachMode=True,viewerRole="coach",opening="Állapotjelzés",dialogue=[])
        self.context["sourceSnapshots"]=[{"id":"checkin-1","revision":1,"kind":"checkin_results","text":"Hogyan aludtál? Keveset","at":"2026-10-28T07:00:00Z","role":"player"}]

    def test_compact_source_keys_restore_exact_pinned_citations(self):
        self.coach_context()
        result,prompt=self.answer([{"text":"A játékos kevés alvásról számolt be.","kind":"direct","sources":["S1"],"quote":"Hogyan aludtál? Keveset"}])
        self.assertEqual(result["claims"][0]["evidenceRefs"],[self.ref])
        self.assertIn('"key":"S1"',prompt)

    def test_failed_generation_still_returns_a_labelled_factual_source_summary(self):
        self.coach_context();self.config.mode="hosted"
        with patch("habi_worker.service_runtime.shared_ai_generate",side_effect=SharedAIError("SHARED_AI_RESULT_INVALID")):
            result=_answer_for_context(self.config,self.context)
        self.assertEqual(result["status"],"ready")
        self.assertEqual(result["manifest"]["modelArtifact"],"habi-source-summary@1")
        self.assertIn("Keveset",result["claims"][0]["text"])
        self.assertEqual(result["claims"][0]["evidenceRefs"],[self.ref])
        self.assertIn("összefoglaló",result["attributions"][0])

    def test_unknown_compact_source_never_becomes_a_model_claim(self):
        self.coach_context()
        result,_=self.answer([{"text":"Forged unsupported interpretation","kind":"inference","sources":["S999"]}])
        self.assertFalse(any("Forged" in c["text"] for c in result["claims"]))
        self.assertEqual(result["manifest"]["modelArtifact"],"habi-source-summary@1")

    def test_personal_claim_cannot_use_a_general_page_as_its_only_evidence(self):
        self.coach_context()
        self.context["sourceSnapshots"].append({"id":"page","revision":1,"kind":"authored_content","text":"Az áttekintés a napló eseményeit mutatja."})
        self.context["sourceManifest"].append({"id":"page","revision":1,"span":None})
        result,_=self.answer([{"text":"Az alvásválasz azt jelenti, hogy megfelelő energiája van.","kind":"direct","sources":["S2"]}])
        self.assertFalse(any("megfelelő energiája" in c["text"] for c in result["claims"]))
        self.assertTrue(any("Keveset" in c["text"] for c in result["claims"]))

    def test_direct_display_uses_the_verified_quote_instead_of_an_unsupported_paraphrase(self):
        self.coach_context()
        result,_=self.answer([{"text":"A játékos kipihent és biztosan készen áll.","kind":"direct","sources":["S1"],"quote":"Hogyan aludtál? Keveset"}])
        self.assertEqual(result["claims"][0]["text"],"Hogyan aludtál? Keveset")


if __name__ == "__main__":
    unittest.main()
