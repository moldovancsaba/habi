import unittest
from types import SimpleNamespace
from unittest.mock import patch
from habi_worker.coach_dialogue import answer, conversation_request, prepare_conversation, prepare_hungarian_conversation, usable_reply
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
            result=answer(self.config,self.context)
        self.assertEqual(api.call_count,2)
        self.assertEqual(result["manifest"]["modelArtifact"],"habi-rules-fallback@1")
        self.assertNotIn(repeated,result["reply"]["text"])
    def test_author_preferences_and_other_thread_updates_are_available_as_attributed_context(self):
        self.add_source("preference", "conversation_note", "Rövid válaszokat szeretnék.", "Felhasználói preference · author")
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

    def add_source(self, identifier, kind, text, title="Játékos beszámolója"):
        ref = {"id": identifier, "revision": 1, "span": None}
        self.context["sourceManifest"].append(ref)
        self.context["sourceSnapshots"].append({**ref, "kind": kind, "text": text, "title": title,
                                                "at": "2026-10-27T09:00:00Z", "role": "coach"})
        return ref

    def test_preferences_do_not_displace_player_evidence_and_only_supplied_sources_are_linked(self):
        self.add_source("preference", "conversation_note", "Rövid válaszokat kérek.", "Felhasználói preference · author")
        checkin = self.add_source("checkin", "checkin_results", "Hogyan aludtál? Keveset")
        omitted = self.add_source("oversized", "record", "nincs fájdalma. " * 2000)
        with patch("habi_worker.coach_dialogue.generate", return_value=({"text":"Evett már azóta?"}, "synthetic")) as api:
            result = answer(self.config, self.context)
        self.assertIn("Hogyan aludtál? Keveset", api.call_args.args[1])
        self.assertIn("Rövid válaszokat kérek.", api.call_args.args[1])
        self.assertIn(checkin, result["reply"]["sourceRefs"])
        self.assertNotIn(omitted, result["reply"]["sourceRefs"])
        self.assertNotIn("nincs fájdalma", api.call_args.args[1])

    def test_budget_preserves_complete_records_and_complete_dialogue_pairs(self):
        self.context["dialogue"] = [
            {"question": "régi " * 400, "answer": "hosszú " * 400},
            {"question": "Van fájdalma?", "answer": "Ezt még nem jelezted."},
        ]
        negative = "Nem fáj a lába, de ma nem edzett."
        self.add_source("negative", "conversation_note", negative)
        system, history, refs = prepare_conversation(self.context, 1800)
        self.assertIn(negative, system)
        self.assertEqual(history, [{"role":"user", "content":"Van fájdalma?"},
                                   {"role":"assistant", "content":"Ezt még nem jelezted."}])
        self.assertLessEqual(len(system) + len(self.context["question"]) + sum(len(m["content"]) for m in history), 1800)

    def test_retired_or_unpinned_record_never_reaches_prompt_or_reply_links(self):
        stale = self.add_source("stale", "retired_conversation_note", "A reggeli maradt ki.")
        self.context["sourceSnapshots"].append({"id":"untrusted", "revision":1, "kind":"record", "text":"Nem hitelesített."})
        system, _, refs = prepare_conversation(self.context)
        self.assertNotIn("A reggeli", system)
        self.assertNotIn("Nem hitelesített", system)
        self.assertNotIn(stale, refs)

    def test_previous_question_remains_attributed_message_not_a_player_fact(self):
        old = self.add_source("coach-message-previous", "conversation_message", "Mi segített neki múltkor?", "Korábbi saját kérdés")
        system, _, refs = prepare_conversation(self.context)
        self.assertIn("Mi segített neki múltkor?", system)
        self.assertIn('"kind":"conversation_message"', system)
        self.assertIn(old, refs)

    def test_omitted_evidence_cannot_authorize_a_numeric_claim(self):
        self.add_source("oversized", "record", "42 perce evett. " * 2000)
        with patch("habi_worker.coach_dialogue.generate", return_value=({"text":"42 perce evett."}, "synthetic")):
            result = answer(self.config, self.context)
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-fallback@1")
        self.assertNotIn("42", result["reply"]["text"])

    def test_long_recycled_answer_with_swapped_nouns_is_not_a_new_reply(self):
        self.context["dialogue"] = [{"question":"Mi változott?", "answer":
            "Szívesen segítek. A reggelizés fontos, és ha valaki elfelejtik, akkor általában jobb érezni. Ha szeretnéd, szívesen javasolhatok egy gyakorlatot is, hogy segítsen neki a reggelizés és az érzések javításában."}]
        recycled = "Szívesen segítek. A vacsora elveszítése is fontos, és ha valaki nem tudja megfelelően táplálni, általában jobb érezni. Ha szeretnéd, szívesen javasolhatok egy gyakorlatot is, hogy segítsen neki a táplálkozás és az érzések javításában."
        self.assertFalse(usable_reply(recycled, self.context))
        self.assertTrue(usable_reply("Értem a javítást. Most hogy érzi magát?", self.context))

    def test_fragments_are_retried_and_cannot_be_marked_as_complete(self):
        for fragment in ("Csaba", "Csaba, a vacsora", "A javulás azért", "Teszt Csaba."):
            self.assertFalse(usable_reply(fragment, self.context))
        with patch("habi_worker.coach_dialogue.generate", return_value=({"text":"Csaba, a vacsora"}, "synthetic")) as api:
            result = answer(self.config, self.context)
        self.assertEqual(api.call_count, 2)
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-fallback@1")
        self.assertNotIn("a vacsora", result["reply"]["text"])

    def test_oversized_current_message_is_never_silently_shortened(self):
        self.context["question"] = "Nem fáj. " * 2000
        with self.assertRaisesRegex(SharedAIError, "INPUT_TOO_LARGE"):
            prepare_conversation(self.context, 2000)

    def test_hungarian_context_preserves_all_checkin_values_within_byte_budget(self):
        import json
        self.context["question"]="Hogy van Csaba?"
        self.context["sourceSnapshots"][0]["text"]=self.context["question"]
        self.context["dialogue"]=[]
        text="Mennyi energiád van? Megfelelő\nHogyan aludtál? Keveset\nMennyire tudsz figyelni? Nehezen\nHogy érzed magad? Feszült\nMennyit edzettél? Közepesen"
        ref=self.add_source("checkin","checkin_results",text)
        system,history,refs=prepare_hungarian_conversation(self.context)
        self.assertIn(ref,refs)
        for value in ("Megfelelő","Keveset","Nehezen","Feszült","Közepesen"):
            self.assertIn(value,system)
        self.assertIn("2026-10-27",system)
        messages=[{"role":"system","content":system}]+history+[{"role":"user","content":self.context["question"]}]
        self.assertLessEqual(len(json.dumps(messages,ensure_ascii=False,separators=(",",":")).encode()),608)

    def test_hungarian_packer_does_not_clip_long_message_or_strip_accents(self):
        self.context["question"]="ő"*400
        with self.assertRaisesRegex(SharedAIError,"INPUT_TOO_LARGE"):
            prepare_hungarian_conversation(self.context)

    def test_complete_reply_may_end_with_an_emoji_but_fragment_may_not(self):
        self.assertTrue(usable_reply("Köszönöm. Evett már azóta? 😊",self.context))
        self.assertFalse(usable_reply("Csaba, a vacsora 😊",self.context))

    def test_oversized_hungarian_message_gets_actionable_clarification_without_api_retry(self):
        from habi_worker.shared_ai import SERVICE_TASK_MODELS
        self.config.shared_ai_dialogue_task="text_chat_hu"
        SERVICE_TASK_MODELS[(self.config.shared_ai_origin,"text_chat_hu")]={"synthetic"}
        self.context["question"]="ő"*400
        try:
            with patch("habi_worker.coach_dialogue.generate") as api:
                result=answer(self.config,self.context)
            api.assert_not_called()
            self.assertEqual(result["status"],"needs_clarification")
            self.assertIn("rövidebb",result["unknowns"][0])
        finally:
            SERVICE_TASK_MODELS.pop((self.config.shared_ai_origin,"text_chat_hu"),None)

    def test_provider_failure_is_not_disguised_as_a_completed_summary(self):
        with patch("habi_worker.coach_dialogue.generate",side_effect=SharedAIError("SHARED_AI_MAINTENANCE")):
            with self.assertRaisesRegex(SharedAIError,"MAINTENANCE"):answer(self.config,self.context)
