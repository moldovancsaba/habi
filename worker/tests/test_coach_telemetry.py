import contextlib
import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from habi_worker import service_runtime
from habi_worker.coach_dialogue import answer, reply_problem, usable_reply
from habi_worker.shared_ai import SERVICE_TASK_MODELS

REF = {"id": "coach-message-current", "revision": 1, "span": None}
QUESTION = "Mit gondolsz a hétvégi meccsről?"


def context():
    return {"jobId": "job-1", "turnRevision": 1, "viewerRole": "player", "playerName": "Teszt Csaba", "question": QUESTION,
            "sourceManifest": [REF], "promptManifest": {"sourceRefs": [REF]}, "dialogue": [], "messageHistory": [],
            "sourceSnapshots": [{**REF, "kind": "conversation_message", "role": "player", "text": QUESTION, "at": "2026-10-31T09:00:00Z"}]}


def events(output):
    return [json.loads(line) for line in output.getvalue().splitlines() if line.startswith("{")]


class ReplyProblemTests(unittest.TestCase):
    def test_each_refusal_has_a_code_and_a_usable_reply_has_none(self):
        cases = {
            "Teszt Csaba.": "name_only",
            "Csaba, a vacsora": "unfinished",
            "Biztosan beteg, ezért nem mehet edzésre.": "diagnosis_or_clearance",
            QUESTION: "echo_of_question",
            "42 perce történt ez a meccs.": "unsourced_number",
            "Ez a meccs az okozza, hogy fáradt vagy.": "invented_cause",
        }
        for text, code in cases.items():
            with self.subTest(text=text):
                self.assertEqual(reply_problem(text, context()), code)
                self.assertFalse(usable_reply(text, context()))
        self.assertEqual(reply_problem("x", context()), "length")
        self.assertIsNone(reply_problem("Értem, mesélj róla, hogyan ment a meccs.", context()))
        self.assertTrue(usable_reply("Értem, mesélj róla, hogyan ment a meccs.", context()))


class RefusalLogTests(unittest.TestCase):
    def setUp(self):
        self.origin = "http://synthetic"
        SERVICE_TASK_MODELS[(self.origin, "text_chat_hu")] = {"synthetic"}
        self.config = SimpleNamespace(shared_ai_origin=self.origin, shared_ai_model="auto", shared_ai_dialogue_model="auto",
                                      shared_ai_dialogue_task="text_chat_hu")

    def tearDown(self):
        SERVICE_TASK_MODELS.pop((self.origin, "text_chat_hu"), None)

    def test_refused_replies_are_logged_as_codes_without_any_text(self):
        secret = "Csaba, a titkos vacsora"
        output = io.StringIO()
        with patch("habi_worker.coach_dialogue.generate", return_value=({"text": secret}, "synthetic")), contextlib.redirect_stdout(output):
            result = answer(self.config, context())
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-fallback@1")
        logged = [e for e in events(output) if e["event"] == "habi.worker.coach.reply_refused"]
        self.assertEqual([(e["attempt"], e["reason"]) for e in logged], [(1, "unfinished"), (2, "unfinished")])
        self.assertNotIn("titkos", output.getvalue())
        self.assertNotIn(QUESTION, output.getvalue())


class ModelChangeAlarmTests(unittest.TestCase):
    def setUp(self):
        service_runtime._dialogue_model_seen.clear()

    def run_notes(self, *artifacts):
        with patch.object(service_runtime, "_log") as log:
            for artifact in artifacts:
                service_runtime._note_dialogue_model(artifact)
        return [call for call in log.call_args_list]

    def test_a_changed_model_is_logged_once_and_rule_answers_never_count(self):
        calls = self.run_notes("model-a", "habi-rules-ack@1", "model-a", "habi-plain-checkin@1", "model-b", "model-b", "")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].args[0], "habi.worker.coach.model_changed")
        self.assertEqual(calls[0].kwargs, {"previous": "model-a", "current": "model-b"})

    def test_the_first_model_seen_is_not_a_change(self):
        self.assertEqual(self.run_notes("model-a"), [])


class CompletedLogTests(unittest.TestCase):
    def test_completed_event_carries_the_artifact_and_the_answer_time_but_no_text(self):
        config = SimpleNamespace(cloud_api_origin="https://habi.example", bearer_token="synthetic")
        answer_result = {"status": "ready", "claims": [], "reply": {"text": "Titkos válasz.", "sourceRefs": []},
                         "manifest": {"modelArtifact": "habi-rules-ack@1"}}

        def fake_api_call(config, path, payload=None, headers=None, method=None, timeout=8):
            if path.endswith("/claim"):
                return 200, {"jobId": "j", "kind": "coachConversation", "fence": 1, "leaseToken": "lease"}
            if path.endswith("/context"):
                return 200, {"sourceManifest": [], "coachMode": True}
            return 200, None

        with patch.object(service_runtime, "_api_call", fake_api_call), patch.object(service_runtime, "_answer_for_context", return_value=answer_result), \
                patch.object(service_runtime, "_log") as log:
            service_runtime._process_one(config, "claim-key")
        completed = next(c for c in log.call_args_list if c.args[0] == "habi.worker.interpretation.completed")
        self.assertEqual(completed.kwargs["artifact"], "habi-rules-ack@1")
        self.assertIsInstance(completed.kwargs["answerSeconds"], float)
        self.assertNotIn("Titkos", json.dumps([c.kwargs for c in log.call_args_list], ensure_ascii=False, default=str))


if __name__ == "__main__":
    unittest.main()
