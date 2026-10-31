"""Builds the transcript appendix (markdown) from results-*.jsonl and verdicts-*.json. Offline.
  python3 worker/evaluations/replay/report.py [verdicts.json] > appendix.md"""
import json, os, sys, tempfile, collections
from pathlib import Path
HERE = Path(__file__).parent
RESULTS = Path(os.environ.get("REPLAY_OUT", Path(tempfile.gettempdir()) / "habi-replay"))
verdicts = json.load(open(sys.argv[1] if len(sys.argv) > 1 else HERE / "verdicts-2026-10-30.json", encoding="utf-8"))
rows = [json.loads(l) for f in ("results-ab.jsonl", "results-c.jsonl") for l in (RESULTS / f).open(encoding="utf-8")]
by = collections.defaultdict(dict)
for r in rows: by[(r["thread"], r["turn"])][r["arm"]] = r
order = []
for r in rows:
    k = (r["thread"], r["turn"])
    if k not in order: order.append(k)
tally = collections.Counter(verdicts[f"{t}#{i}"][0] for t, i in order if f"{t}#{i}" in verdicts)
print("Turns graded (arm A, production route):", sum(tally.values()), dict(sorted(tally.items())), file=sys.stderr)
for thread in dict.fromkeys(t for t, _ in order):
    first = by[(thread, 0)]["A"]
    print(f"### {thread} · {first['role']} · check-in {first['profile'] or 'none'}\n")
    for t, i in [k for k in order if k[0] == thread]:
        d, a = by[(t, i)], by[(t, i)]["A"]
        code, note = verdicts.get(f"{t}#{i}", ["?", ""])
        print(f"**{i + 1}. {a['message']}**\n")
        print(f"- A, production route ({a['seconds']:.0f} s, **{code}**: {note}): {a['text'].strip()}")
        if "B" in d: print(f"- B, rule-based path still in the code ({d['B']['model']}): {d['B']['text']}")
        print(f"- C, prototype ({d['C']['routed']}): {d['C']['text']}\n")
