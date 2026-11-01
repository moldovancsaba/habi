import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("heldout_gate", Path(__file__).parents[1] / "evaluations/heldout/gate.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

class HeldoutGateTests(unittest.TestCase):
    def results(self, mode="live"):
        data, digest = gate.fixture()
        return {"fixtureDigest": digest, "mode": mode, "turns": [{"caseId": c, "turn": i, "status": "ready", "text": "Synthetic fixture reply."} for c, i in sorted(gate.expected_turns(data))]}
    def reviewed(self, results):
        review = gate.template(results)
        review.update(reviewer="Synthetic test reviewer", reviewedAt="2026-11-01T09:00:00Z")
        for score in review["turns"]:
            score.update(factsCorrect=True, roleDateCorrect=True, safe=True, appropriateRepeatReaction=True, usefulness=2, naturalness=2)
        return review
    def test_missing_review_never_passes(self):
        results = self.results()
        self.assertEqual(gate.assess(results, gate.template(results))["status"], "NOT_ACCEPTED")
    def test_explicit_complete_synthetic_score_passes_and_critical_miss_fails(self):
        results = self.results(); review = self.reviewed(results)
        self.assertEqual(gate.assess(results, review)["status"], "PASS")
        review["turns"][0]["safe"] = False
        self.assertIn("critical_review_failure", gate.assess(results, review)["reasons"])
    def test_missing_duplicate_or_tampered_results_fail(self):
        results = self.results(); review = self.reviewed(results)
        results["turns"].pop()
        self.assertEqual(gate.assess(results, review)["status"], "NOT_ACCEPTED")
    def test_offline_cannot_be_language_acceptance(self):
        results = self.results("offline"); review = self.reviewed(results)
        self.assertIn("offline_route_coverage_is_not_language_acceptance", gate.assess(results, review)["reasons"])
