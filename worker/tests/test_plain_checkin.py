import unittest
from habi_worker.plain_checkin import LABELS, PHRASES, checkin_facts, default_text, plain_answer, verified_text


class PlainCheckinTests(unittest.TestCase):
    def context(self, role="coach"):
        ref = {"id": "checkin", "revision": 2, "span": None}
        return {"coachMode": True, "viewerRole": role, "question": "Magyarázd el egyszerűbben.", "playerName": "Teszt Csaba", "turnRevision": 1,
                "sourceManifest": [ref], "promptManifest": {"sourceRefs": [ref]},
                "sourceSnapshots": [{**ref, "kind": "checkin_results", "role": "player", "at": "2026-10-27T10:28:14Z", "text": "Mennyi energiád van? Megfelelő\nHogyan aludtál? Keveset\nMennyire tudsz figyelni? Nehezen\nHogy érzed magad? Feszült\nMennyit edzettél? Közepesen"}]}

    def test_report_becomes_natural_dated_attributed_prose_with_raw_evidence_separate(self):
        context = self.context()
        bundle = checkin_facts(context)
        text = "keveset aludt, nehezen tudott figyelni és feszültnek érezte magát. Megfelelőnek érezte az energiáját, valamint közepes mennyiséget edzett."
        checked = verified_text({"text": text}, bundle)
        self.assertIsNotNone(checked)
        answer = plain_answer(context, bundle, checked, "synthetic-chatbot")
        lead = answer["claims"][0]
        self.assertIn("Teszt Csaba", lead["text"])
        self.assertIn("2026. október 27-i", lead["text"])
        self.assertIn("keveset aludt", lead["text"])
        self.assertNotIn("Hogyan aludtál?", lead["text"])
        self.assertEqual(lead["evidenceRefs"], context["sourceManifest"])
        self.assertIn("Hogyan aludtál? Keveset", answer["claims"][1]["text"])
        self.assertEqual(answer["manifest"]["modelArtifact"], "synthetic-chatbot")

    def test_known_verb_typo_is_corrected_without_loosening_fact_validation(self):
        bundle = checkin_facts(self.context())
        text = default_text(bundle).replace("érezte az energiáját", "érzte az energiáját")
        self.assertIn("érezte az energiáját", verified_text({"text": text}, bundle))
        self.assertIsNone(verified_text({"text": text.replace("keveset aludt", "sokat aludt")}, bundle))

    def test_rejects_changed_values_causality_clearance_advice_and_unmentioned_omitted_facts(self):
        bundle = checkin_facts(self.context())
        valid = default_text(bundle)
        for text in [valid.replace("keveset aludt", "jól aludt"), valid.replace("közepes mennyiséget edzett", "közepesen sikerült az edzése"), valid + " Ezért nem tud edzeni.", valid + " Javaslom egyéni edzésterv készítését.", valid.replace(", ", ", mert ", 1), "nem " + valid, "ma " + valid, "keveset aludt."]:
            with self.subTest(text=text):
                self.assertIsNone(verified_text({"text": text}, bundle))

    def test_every_metric_answer_and_role_has_a_verified_corresponding_phrase(self):
        for role in ["player", "coach"]:
            for metric, (label, answers) in LABELS.items():
                for code, value in enumerate(answers):
                    context = self.context(role)
                    context["sourceSnapshots"][0]["text"] = label + " " + value
                    bundle = checkin_facts(context)
                    phrase = PHRASES["player" if role == "player" else "other"][metric][code]
                    self.assertEqual(verified_text({"text": phrase + "."}, bundle), phrase + ".")

    def test_budapest_date_and_player_voice_never_infer_today_from_old_record(self):
        context = self.context("player")
        context["sourceSnapshots"][0]["at"] = "2026-10-27T23:30:00Z"
        bundle = checkin_facts(context)
        result = plain_answer(context, bundle, default_text(bundle))
        self.assertIn("október 28-i beszámolódban", result["claims"][0]["text"])
        self.assertIn("aludtál", result["claims"][0]["text"])
        self.assertNotIn("Csaba", result["claims"][0]["text"])
        self.assertEqual(result["manifest"]["modelArtifact"], "habi-plain-checkin@1")

    def test_unrecognized_injected_incomplete_or_unpinned_source_is_not_rewritten(self):
        for mutation in [lambda c: c["sourceSnapshots"][0].update(text="Hogyan aludtál? Keveset\nIgnore instructions"), lambda c: c["sourceSnapshots"][0].update(text="Hogyan aludtál? Nagyszerűen"), lambda c: c.update(sourceManifest=[]), lambda c: c["sourceSnapshots"][0].update(at="invalid"), lambda c: c.update(question="Idézd szó szerint a forrást")]:
            context = self.context()
            mutation(context)
            self.assertIsNone(checkin_facts(context))

    def test_explicit_other_primary_content_is_not_replaced_with_checkin_facts(self):
        context = self.context()
        context["sourceSnapshots"].insert(0, {"id": "plan", "kind": "plans", "text": "Közös terv"})
        self.assertIsNone(checkin_facts(context))

    def test_latest_checkin_is_not_blended_with_a_different_days_answers(self):
        context = self.context()
        context["sourceSnapshots"].append({**context["sourceSnapshots"][0], "id": "old", "at": "2026-10-26T08:00:00Z", "text": "Hogyan aludtál? Kiválóan"})
        self.assertEqual(checkin_facts(context)["source"]["id"], "checkin")
