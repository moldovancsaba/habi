import unittest
from types import SimpleNamespace
from unittest.mock import patch
from habi_worker.coach_dialogue import answer, conversation_request, usable_reply
from habi_worker.shared_ai import SharedAIError, SERVICE_MODELS

class CoachDialogueTests(unittest.TestCase):
    def setUp(self):
        self.ref = {"id": "coach-message-current", "revision": 1, "span": None}
        self.config = SimpleNamespace(shared_ai_origin="http://synthetic", shared_ai_model="auto")
        self.context = {"jobId":"synthetic-job", "turnRevision":1,"viewerRole":"coach","playerName":"Teszt Csaba","question":"jobb a közérzete, kiderült, hogy elfelejtett reggelizni","sourceManifest":[self.ref],"promptManifest":{"sourceRefs":[self.ref]},"sourceSnapshots":[{**self.ref,"kind":"conversation_message","role":"coach","text":"jobb a közérzete, kiderült, hogy elfelejtett reggelizni","at":"2026-10-28T09:00:00Z"}],"dialogue":[{"question":"Hogy van Csaba?","answer":"A tegnapi beszámolóban feszültnek érezte magát. Azóta változott valami?","questions":[]}],"messageHistory":[]}
    def test_api_receives_original_update_and_real_role_history_and_returns_free_support(self):
        text = "Köszönöm a pontosítást. Evett már azóta?"
        with patch("habi_worker.coach_dialogue.generate",return_value=({"text":text},"synthetic-model")) as api:
            result=answer(self.config,self.context)
        self.assertEqual(result["reply"]["text"],text)
        self.assertEqual(result["claims"],[])
        self.assertEqual(api.call_args.args[2],self.context["question"])
        self.assertEqual(api.call_args.kwargs["history"][-1]["role"],"assistant")
        self.assertIn("about the player",api.call_args.args[1])
        self.assertNotIn("variants",api.call_args.args[1])
        self.assertEqual(result["reply"]["sourceRefs"],[self.ref])
    def test_varied_wording_is_allowed_and_old_answer_is_not_used_as_fallback(self):
        for text in ["Ez fontos új információ. Evett már azóta?", "Értem. A javulásról szóló friss jelzésedből induljunk ki."]:
            self.assertTrue(usable_reply(text,self.context))
        repeated=self.context["dialogue"][0]["answer"]
        with patch("habi_worker.coach_dialogue.generate",return_value=({"text":repeated},"synthetic-model")) as api:
            with self.assertRaises(SharedAIError):answer(self.config,self.context)
        self.assertEqual(api.call_count,2)
    def test_author_preferences_and_other_thread_updates_are_available_as_attributed_context(self):
        self.context["messageHistory"]=[{"id":"old","at":"2026-10-28T08:00:00Z","text":"Rövid válaszokat szeretnék.","acts":["feedback"]}]
        system,history=conversation_request(self.context)
        self.assertIn("Rövid válaszokat",system)
        self.assertEqual(history[0]["content"],"Hogy van Csaba?")
        self.assertFalse(usable_reply("Biztosan beteg, ezért nem mehet edzésre.",self.context))
        self.assertFalse(usable_reply("42 százalékkal jobb.",self.context))
    def test_task_model_selection_is_limited_to_authenticated_allowed_catalogue(self):
        self.config.shared_ai_dialogue_model = "qwen3:1.7b"
        SERVICE_MODELS[self.config.shared_ai_origin]={"qwen3:1.7b"}
        try:
            with patch("habi_worker.coach_dialogue.generate",return_value=({"text":"Evett már azóta?"},"qwen3:1.7b")) as api:answer(self.config,self.context)
            self.assertEqual(api.call_args.args[0].shared_ai_model,"qwen3:1.7b")
        finally:SERVICE_MODELS.pop(self.config.shared_ai_origin,None)
    def test_auto_keeps_service_selection(self):
        SERVICE_MODELS[self.config.shared_ai_origin] = {"qwen3:1.7b"}
        try:
            with patch("habi_worker.coach_dialogue.generate", return_value=({"text":"Evett már azóta?"}, "synthetic")) as api:
                answer(self.config, self.context)
            self.assertEqual(api.call_args.args[0].shared_ai_model, "auto")
        finally:
            SERVICE_MODELS.pop(self.config.shared_ai_origin, None)

    def test_provider_failure_is_not_disguised_as_a_completed_summary(self):
        with patch("habi_worker.coach_dialogue.generate",side_effect=SharedAIError("SHARED_AI_MAINTENANCE")):
            with self.assertRaisesRegex(SharedAIError,"MAINTENANCE"):answer(self.config,self.context)
