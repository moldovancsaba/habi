import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "evaluations"))
import log_mix  # noqa: E402

LOG = """\
{"event":"habi.worker.job.failed","jobId":"old","reason":"SHARED_AI_RESULT_INVALID"}
{"event":"habi.worker.service.started","mode":"hosted"}
{"event":"habi.worker.interpretation.completed","jobId":"a","resultStatus":"ready","claimCount":1,"artifact":"habi-plain-checkin@1","answerSeconds":0.0}
{"event":"habi.worker.interpretation.completed","jobId":"b","resultStatus":"ready","claimCount":0,"artifact":"habi-rules-safety@1","answerSeconds":0.0}
{"event":"habi.worker.interpretation.completed","jobId":"c","resultStatus":"ready","claimCount":0,"artifact":"hf.co/unsloth/Qwen3","answerSeconds":61.5}
{"event":"habi.worker.interpretation.completed","jobId":"d","resultStatus":"ready","claimCount":0,"artifact":"hf.co/unsloth/Qwen3","answerSeconds":83.0}
{"event": "habi.worker.coach.reply_refused", "attempt": 1, "reason": "unfinished"}
{"event": "habi.worker.coach.reply_refused", "attempt": 2, "reason": "unfinished"}
{"event":"habi.worker.coach.model_changed","previous":"m1","current":"m2"}
{"event":"habi.worker.job.failed","jobId":"e","reason":"SHARED_AI_UNAVAILABLE"}
not json at all
{"event":"habi.worker.interpretation.completed","jobId":"legacy","resultStatus":"ready","claimCount":1}
"""


class LogMixTests(unittest.TestCase):
    def test_counts_who_answered_and_how_long_it_took(self):
        summary = log_mix.summarise(LOG.splitlines(), since_start=True)
        self.assertEqual((summary["answered"], summary["byRule"], summary["byModel"], summary["ruleShare"]), (4, 2, 2, 0.5))
        self.assertEqual(summary["byArtifact"]["habi-rules-safety@1"], 1)
        self.assertEqual(summary["seconds"]["rule"], {"p50": 0.0, "p95": 0.0})
        self.assertEqual(summary["seconds"]["model"], {"p50": 83.0, "p95": 83.0})
        self.assertEqual(summary["refusedModelReplies"], {"unfinished": 2})
        self.assertEqual(summary["failedJobs"], {"SHARED_AI_UNAVAILABLE": 1})
        self.assertEqual(summary["modelChanges"], [["m1", "m2"]])

    def test_since_start_drops_what_happened_before_the_last_start(self):
        self.assertEqual(log_mix.summarise(LOG.splitlines())["failedJobs"], {"SHARED_AI_RESULT_INVALID": 1, "SHARED_AI_UNAVAILABLE": 1})

    def test_an_empty_log_has_no_share(self):
        self.assertIsNone(log_mix.summarise([])["ruleShare"])


if __name__ == "__main__":
    unittest.main()
