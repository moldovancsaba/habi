"""What the coach actually does, from the worker log alone (no message text is ever in it).

  python3 worker/evaluations/log_mix.py [~/Library/Logs/habi-worker.log] [--since-start]

Counts answered coach turns by who answered (a rule or the model), the answer time of each,
model replies the checker refused (reason codes), failed jobs and model changes. --since-start
keeps only what happened after the worker's last start, because the log has no timestamps.
"""
import json
import os
import sys
from collections import Counter
from pathlib import Path


def events(lines, since_start=False):
    parsed = []
    for line in lines:
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            parsed.append(json.loads(line))
        except ValueError:
            continue
    if since_start:
        starts = [i for i, e in enumerate(parsed) if e.get("event") == "habi.worker.service.started"]
        parsed = parsed[starts[-1]:] if starts else parsed
    return parsed


def percentile(values, share):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(share * len(ordered)))] if ordered else None


def summarise(lines, since_start=False):
    answered = Counter()
    seconds = {"rule": [], "model": []}
    refused, failed, changes = Counter(), Counter(), []
    for event in events(lines, since_start):
        name = event.get("event")
        if name == "habi.worker.interpretation.completed" and "artifact" in event:
            artifact = event["artifact"] or "unknown"
            answered[artifact] += 1
            kind = "rule" if artifact.startswith("habi-") else "model"
            if isinstance(event.get("answerSeconds"), (int, float)):
                seconds[kind].append(event["answerSeconds"])
        elif name == "habi.worker.coach.reply_refused":
            refused[event.get("reason", "unknown")] += 1
        elif name == "habi.worker.job.failed":
            failed[event.get("reason", "unknown")] += 1
        elif name == "habi.worker.coach.model_changed":
            changes.append([event.get("previous"), event.get("current")])
    rules = sum(n for a, n in answered.items() if a.startswith("habi-"))
    total = sum(answered.values())
    return {
        "answered": total,
        "byRule": rules,
        "byModel": total - rules,
        "ruleShare": round(rules / total, 2) if total else None,
        "byArtifact": dict(answered.most_common()),
        "seconds": {kind: {"p50": percentile(v, .5), "p95": percentile(v, .95)} for kind, v in seconds.items()},
        "refusedModelReplies": dict(refused.most_common()),
        "failedJobs": dict(failed.most_common()),
        "modelChanges": changes,
    }


def main(argv):
    flags = [a for a in argv if a.startswith("--")]
    paths = [a for a in argv if not a.startswith("--")]
    path = Path(paths[0]) if paths else Path(os.path.expanduser("~/Library/Logs/habi-worker.log"))
    summary = summarise(path.read_text(encoding="utf-8", errors="replace").splitlines(), "--since-start" in flags)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
