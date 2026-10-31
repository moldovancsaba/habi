import copy
import hashlib
import json
import tempfile
import unicodedata
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from habi_worker import coach_router
from habi_worker.service_runtime import _answer_for_context
from habi_worker.shared_ai import SharedAIError, SERVICE_TASK_MODELS

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "coach-worker-context.json").read_text(encoding="utf-8"))
ROUTING = json.loads((ROOT / "src" / "lib" / "content" / "guided-chat-routing-v1.json").read_text(encoding="utf-8"))
COACH_PROMPT = "synthetic coach prompt"
OPEN_QUESTION = "Hogyan ment a hétvégi meccs?"
GUIDANCE_REF = {"id": "habi-guidance-training-attendance", "revision": 1, "span": None}


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if not unicodedata.combining(c))


class RulesFirstRoutingTests(unittest.TestCase):
    """The context is the exact shape the Habi API sends (dialogueVersion 2, the player's message first)."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        prompt = Path(self.temp.name) / "prompt.md"
        prompt.write_text("synthetic system prompt", encoding="utf-8")
        prompt.with_name("coach-prompt.md").write_text(COACH_PROMPT, encoding="utf-8")
        self.origin = "http://synthetic"
        SERVICE_TASK_MODELS[(self.origin, "text_chat_hu")] = {"synthetic"}
        self.config = SimpleNamespace(
            mode="hosted", prompt_path=str(prompt), shared_ai_origin=self.origin, shared_ai_model="auto",
            shared_ai_dialogue_model="auto", shared_ai_dialogue_task="text_chat_hu",
        )

    def tearDown(self):
        SERVICE_TASK_MODELS.pop((self.origin, "text_chat_hu"), None)
        self.temp.cleanup()

    def context(self, question="Magyarázd el egyszerűbben.", acts=("other",), checkin=True, **extra):
        context = copy.deepcopy(FIXTURE["context"])
        context["question"] = question
        context["sourceSnapshots"][0]["text"] = question
        context["messageUnderstanding"] = {"acts": list(acts), "subject": "player", "notes": []}
        context["promptManifest"] = {**context["promptManifest"], "promptHash": hashlib.sha256(COACH_PROMPT.encode()).hexdigest()}
        if not checkin:
            context["sourceSnapshots"].pop()
            context["sourceManifest"].pop()
            context["promptManifest"]["sourceRefs"].pop()
        context.update(extra)
        return context

    def answer(self, context, generate=None):
        def forbidden(*args, **kwargs):
            raise AssertionError("the model must not be called for this question")

        with patch("habi_worker.coach_dialogue.generate", MagicMock(side_effect=generate or forbidden)) as model:
            return _answer_for_context(self.config, context), model

    # -- the regression: the real shape used to bypass every rule --------------------------------

    def test_status_question_is_answered_from_the_dated_checkin_without_the_model(self):
        self.assertEqual(self.context()["dialogueVersion"], 2)
        result, model = self.answer(self.context())
        model.assert_not_called()
        text = result["claims"][0]["text"]
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-plain-checkin@1")
        self.assertIn("2026. október 27-i beszámolódban", text)
        self.assertIn("keveset aludtál", text)
        self.assertEqual(result["claims"][0]["evidenceRefs"], [FIXTURE["context"]["sourceManifest"][1]])
        self.assertEqual(result["clarifyingQuestions"], ["Most is így érzed magad, vagy azóta változott valami?"])

    def test_single_metric_question_names_only_that_metric(self):
        context = self.context("Hogyan aludtam?")
        context["sourceSnapshots"][1]["text"] = "Hogyan aludtál? Keveset"
        result, model = self.answer(context)
        model.assert_not_called()
        self.assertIn("keveset aludtál", result["claims"][0]["text"])
        self.assertNotIn("feszült", result["claims"][0]["text"])

    def test_attendance_guide_is_answered_by_the_authored_guidance(self):
        guidance = {"claim": {"id": "attendance-guidance-v1", "text": "Feltételes útmutatás.", "kind": "general", "evidenceRefs": [GUIDANCE_REF], "review": None},
                    "unknowns": ["A mai közérzet nem ismert."], "questions": ["Hogy vagy ma?"], "asOfDate": "2026-10-28", "hasCurrentCheckin": False}
        context = self.context("Menjek ma edzésre?", acts=("question",), guidance=guidance)
        context["sourceManifest"].append(GUIDANCE_REF)
        context["sourceSnapshots"].append({**GUIDANCE_REF, "kind": "authored_content", "title": "Útmutatás", "text": "Feltételes útmutatás.", "at": "2026-10-28T00:00:00Z", "role": "Habi"})
        result, model = self.answer(context)
        model.assert_not_called()
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-guidance@1")
        self.assertEqual(result["claims"][0], guidance["claim"])
        self.assertEqual(result["clarifyingQuestions"], ["Hogy vagy ma?"])

    def test_new_user_context_sends_an_attendance_question_to_the_model_not_the_canned_guide(self):
        guidance = {"claim": {"id": "g", "text": "Feltételes útmutatás.", "kind": "general", "evidenceRefs": [GUIDANCE_REF], "review": None}, "unknowns": [], "questions": []}
        context = self.context("Menjek ma edzésre?", acts=("question",), guidance=guidance,
                               conversation={"repeated": True, "suppressRepeatedAnswer": False, "hasNewUserContext": True, "lead": "", "questions": []})
        self.assertIsNone(coach_router.route(context))

    def test_repeated_question_gets_the_repeat_handling(self):
        conversation = {"repeated": True, "suppressRepeatedAnswer": True, "lead": "Az előző adatok nem változtak.", "questions": ["Mi maradt bizonytalan?"]}
        result, model = self.answer(self.context(conversation=conversation))
        model.assert_not_called()
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-conversation@1")
        self.assertEqual(result["clarifyingQuestions"], ["Mi maradt bizonytalan?"])

    def test_status_question_without_any_checkin_says_so_instead_of_inventing(self):
        result, model = self.answer(self.context("Hogy állok most?", checkin=False))
        model.assert_not_called()
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-no-data@1")
        self.assertIn("Még nincs mentett állapotjelzés", result["reply"]["text"])
        self.assertEqual(result["reply"]["sourceRefs"], [FIXTURE["context"]["sourceManifest"][0]])

    def test_metric_without_a_recorded_answer_is_reported_as_missing(self):
        context = self.context("Hogyan aludtam?")
        context["sourceSnapshots"][1]["text"] = coach_router.NO_RECORDED_ANSWER
        result, model = self.answer(context)
        model.assert_not_called()
        self.assertIn("nincs mentett válasz", result["reply"]["text"])

    def note(self, ident, text, at, title="Felhasználói update · player · 2026-10-28", role="player", kind="conversation_note"):
        return {"id": ident, "revision": 1, "span": None, "kind": kind, "title": title, "text": text, "at": at, "role": role}

    def test_repeated_status_question_after_new_reports_still_answers_from_the_checkin_and_quotes_them(self):
        context = self.context("Hogy állok most?")
        notes = [self.note("n-new", "Jobban érzem magam.", "2026-10-28T08:50:00Z"),
                 self.note("n-old", "Régi közlés.", "2026-10-26T08:00:00Z"),
                 self.note("n-other", "Más szerző.", "2026-10-28T08:51:00Z", role="coach"),
                 self.note("n-retired", "Visszavont közlés.", "2026-10-28T08:52:00Z", kind="retired_conversation_note"),
                 self.note("n-style", "Rövidebben.", "2026-10-28T08:53:00Z", title="Felhasználói feedback · author · 2026-10-28")]
        refs = [{k: n[k] for k in ("id", "revision", "span")} for n in notes]
        context["sourceSnapshots"] += notes
        context["sourceManifest"] += refs
        context["conversation"] = {"repeated": True, "suppressRepeatedAnswer": False, "hasNewUserContext": True, "lead": "", "questions": []}
        result, model = self.answer(context)
        model.assert_not_called()
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-plain-checkin@1")
        self.assertIn("keveset aludtál", result["claims"][0]["text"])
        self.assertEqual(result["claims"][1]["text"], "Utána ezt írtad: „Jobban érzem magam”.")
        self.assertEqual(result["claims"][1]["evidenceRefs"], [refs[0]])
        self.assertEqual(result["clarifyingQuestions"], ["Van azóta más változás?"])

    def test_advice_and_why_questions_are_left_to_the_model(self):
        for question in ("Mit tanácsolsz, ha keveset alszom?", "Miért aludtam keveset?", "Szerinted mit mutat az alvásom?"):
            with self.subTest(question=question):
                self.assertIsNone(coach_router.status_answer(self.context(question)))

    # -- messages that are not questions ---------------------------------------------------------

    def test_a_report_is_acknowledged_and_offered_to_memory_as_one_note(self):
        message = "Ma jobban érzem magam, elfelejtettem reggelizni."
        result, model = self.answer(self.context(message, acts=("update",)))
        model.assert_not_called()
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-ack@1")
        self.assertIn("elmentettem", result["reply"]["text"])
        self.assertEqual(result["messageUnderstanding"]["notes"], [{"quote": message, "kind": "update", "timeText": None, "corrects": []}])
        self.assertEqual(result["reply"]["sourceRefs"], [FIXTURE["context"]["sourceManifest"][0]])

    def test_a_correction_and_a_preference_are_acknowledged_and_a_question_is_not(self):
        self.assertIn("pontosítást", coach_router.route(self.context("Pontosítás: nem edzettem, hanem pihentem.", acts=("correction", "update")))["reply"]["text"])
        self.assertIn("kérésedet", coach_router.route(self.context("Rövidebben szeretném.", acts=("preference",)))["reply"]["text"])
        self.assertIsNone(coach_router.acknowledgement(self.context("Jobban érzem magam, ugye?", acts=("question", "update"))))
        self.assertIsNone(coach_router.acknowledgement(self.context("Talán jobb lesz.", acts=("hypothesis",))))

    def test_a_long_report_is_acknowledged_without_a_memory_note(self):
        result = coach_router.acknowledgement(self.context("Jobban érzem magam. " * 40, acts=("update",)))
        self.assertEqual(result["messageUnderstanding"]["notes"], [])

    # -- what used to fall through to the unchecked model ---------------------------------------

    def test_a_player_message_matched_by_the_api_gets_exactly_the_authored_safety_copy(self):
        copy_text = "Fontos, amit írtál. Biztonságban vagy most? Most rögtön menj egy szülődhöz vagy más megbízható felnőtthöz."
        context = self.context("Semmi értelme az egésznek.", acts=("other",), safety={"text": copy_text})
        result, model = self.answer(context)
        model.assert_not_called()
        self.assertEqual(result["reply"]["text"], copy_text)
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-safety@1")
        self.assertEqual(result["reply"]["sourceRefs"], [FIXTURE["context"]["sourceManifest"][0]])

    def test_a_player_pain_message_gets_exactly_the_authored_pain_stance_and_safety_wins_over_it(self):
        text = "Köszönöm, hogy megírtad. Ha fáj valamid, ne erőltesd az edzést."
        context = self.context("Nagyon fáj a térdem, de ma is edzésre kell mennem.", pain={"text": text})
        result, model = self.answer(context)
        model.assert_not_called()
        self.assertEqual(result["reply"]["text"], text)
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-pain@1")
        both = coach_router.route(self.context("Fáj, és semmi értelme az egésznek.", safety={"text": "Biztonságban vagy most?"}, pain={"text": text}))
        self.assertEqual(both["manifest"]["modelArtifact"], "habi-rules-safety@1")
        self.assertIsNone(coach_router.route(self.context("Nagyon fáj a térdem.", pain={"text": text}, viewerRole="parent")))
        self.assertIsNone(coach_router.route(self.context("Nagyon fáj a térdem.")))

    def test_the_authored_safety_copy_is_only_for_a_player_and_never_blocks_the_hold(self):
        context = self.context("Semmi értelme az egésznek.", safety={"text": "Biztonságban vagy most?"}, viewerRole="coach")
        self.assertIsNone(coach_router.route(context))
        self.assertIsNone(coach_router.fallback(context))
        self.assertIsNone(coach_router.safety_answer(self.context("Hogy állok most?")))

    def test_a_confirmation_after_a_checkin_summary_names_the_source_and_adds_nothing(self):
        summary = "A 2026. október 27-i beszámolódban azt jelezted, hogy keveset aludtál. Most is így érzed magad?"
        for question in ("Tényleg?", "Biztos vagy ebben?", "Mi alapján?"):
            with self.subTest(question=question):
                result, model = self.answer(self.context(question, dialogue=[{"question": "Hogy állok?", "answer": summary, "questions": []}]))
                model.assert_not_called()
                self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-source@1")
                self.assertIn("2026. október 27-i beszámolóból következik", result["reply"]["text"])
        self.assertIsNone(coach_router.confirmation_answer(self.context("Tényleg?")))
        self.assertIsNone(coach_router.confirmation_answer(self.context("Tényleg?", dialogue=[{"question": "Hogy ment?", "answer": "Jól ment.", "questions": []}])))

    def test_advice_is_declined_and_the_recorded_checkin_is_shown_instead(self):
        result, model = self.answer(self.context("Mit tanácsolsz, ha feszült vagyok és keveset alszom?", acts=("question", "update")))
        model.assert_not_called()
        text = result["reply"]["text"]
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-advice@1")
        self.assertIn("Személyre szabott tanácsot nem adok.", text)
        self.assertIn("Ennyi van mentve: a 2026. október 27-i beszámolódban azt jelezted, hogy keveset aludtál", text)
        self.assertNotRegex(text, r"\d\s*[–-]\s*\d|óra")
        self.assertIn(FIXTURE["context"]["sourceManifest"][1], result["reply"]["sourceRefs"])
        without_checkin = coach_router.route(self.context("Mit tanácsolsz a következő hétre?", checkin=False))
        self.assertIn("Kérdezhetsz a mentett állapotjelzésekről.", without_checkin["reply"]["text"])

    def test_corrections_preferences_and_help_requests_are_not_mistaken_for_advice_questions(self):
        correction = coach_router.route(self.context("Javítás: nem a reggeli maradt ki, hanem a vacsora.", acts=("correction", "update")))
        self.assertEqual(correction["manifest"]["modelArtifact"], "habi-rules-ack@1")
        self.assertIsNone(coach_router.advice_answer(self.context("Javítsd ki a válaszodat, kérlek.")))
        self.assertIsNone(coach_router.advice_answer(self.context("Segíts megérteni a grafikont.")))
        self.assertIsNone(coach_router.route(self.context("Segíts megérteni a grafikont.")))
        long_ask = "Mesélj részletesen arról, hogyan javíthatnám az alvásomat, az energiaszintemet és a figyelmemet az edzések mellett."
        self.assertEqual(coach_router.route(self.context(long_ask))["manifest"]["modelArtifact"], "habi-rules-advice@1")

    def test_advice_mixed_with_pain_is_still_held_back(self):
        self.assertIsNone(coach_router.route(self.context("Fáj a térdem, mit tanácsolsz?")))

    def test_a_greeting_gets_a_scope_statement_but_a_question_after_it_does_not(self):
        result, model = self.answer(self.context("Szia!"))
        model.assert_not_called()
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-greeting@1")
        self.assertNotRegex(result["reply"]["text"], "[\U0001F300-\U0001FAFF]")
        self.assertIsNone(coach_router.greeting_answer(self.context("Szia, hogy ment a meccs?")))

    # -- open conversation still reaches the model; its failure no longer ends in silence ---------

    def test_an_open_question_is_answered_by_the_model(self):
        reply = "Erről a mentett adatok alapján nem tudok mondani semmit, de szívesen meghallgatom, hogyan ment."
        result, model = self.answer(self.context(OPEN_QUESTION, acts=("question",)), generate=lambda *a, **k: ({"text": reply}, "synthetic"))
        self.assertEqual(result["reply"]["text"], reply)
        self.assertEqual(result["manifest"]["modelArtifact"], "synthetic")

    def test_a_refused_model_reply_becomes_a_fallback_reply_not_a_failed_turn(self):
        calls = []
        result, _ = self.answer(self.context(OPEN_QUESTION, acts=("question",)),
                                generate=lambda *a, **k: calls.append(1) or ({"text": "Csaba, a vacsora"}, "synthetic"))
        self.assertEqual(len(calls), 2)
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-rules-fallback@1")
        self.assertEqual(result["status"], "ready")
        self.assertIn("nem találok ki semmit", result["reply"]["text"])
        self.assertEqual(result["reply"]["sourceRefs"], [FIXTURE["context"]["sourceManifest"][0]])

    # -- safety: the rules abstain, nothing new is said ------------------------------------------

    def test_every_authored_safety_keyword_holds_the_rules_back(self):
        for keyword in ROUTING["safetyKeywords"]:
            with self.subTest(keyword=keyword):
                self.assertTrue(coach_router.safety_hold(keyword), keyword)
                self.assertTrue(coach_router.safety_hold("Azt hiszem, " + keyword.upper() + "!"))

    def test_every_authored_pain_keyword_holds_the_rules_back(self):
        for keyword in ROUTING["painKeywords"]:
            with self.subTest(keyword=keyword):
                self.assertTrue(coach_router.safety_hold("Azt írtam, hogy " + keyword + " ma"), keyword)

    def test_pain_and_hopelessness_are_held_back_from_every_rule(self):
        for message in ("Semmi értelme az egésznek, nem akarok már edzésre járni.", "Fáj a térdem, és rosszul vagyok.", "Nem bírom tovább, jobban érzem magam?"):
            with self.subTest(message=message):
                context = self.context(message, acts=("update",))
                self.assertIsNone(coach_router.route(context))
                self.assertIsNone(coach_router.fallback(context))

    def test_safety_message_keeps_the_existing_failure_when_the_model_reply_is_refused(self):
        context = self.context("Nem érzem magam biztonságban.", acts=("update",))
        with patch("habi_worker.coach_dialogue.generate", return_value=({"text": "Csaba, a vacsora"}, "synthetic")):
            with self.assertRaises(SharedAIError) as raised:
                _answer_for_context(self.config, context)
        self.assertEqual(str(raised.exception), "SHARED_AI_RESULT_INVALID")

    def test_ordinary_messages_are_not_held_back(self):
        for message in ("Hogyan aludtam?", "Magyarázd el egyszerűbben.", "Menjek ma edzésre?", "Ma jobban érzem magam."):
            self.assertFalse(coach_router.safety_hold(message), message)

    # -- the contract with the API ---------------------------------------------------------------

    def test_fixture_matches_the_declared_key_lists(self):
        keys = set(FIXTURE["context"])
        self.assertTrue(set(FIXTURE["requiredKeys"]) <= keys)
        self.assertTrue(keys <= set(FIXTURE["requiredKeys"]) | set(FIXTURE["optionalKeys"]))


if __name__ == "__main__":
    unittest.main()
