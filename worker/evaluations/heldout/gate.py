"""Synthetic conversation gate. A replay without complete human review is never PASS.

Offline route coverage: PYTHONPATH=worker python worker/evaluations/heldout/gate.py replay --output /tmp/habi-heldout.json
Opt-in live adds --live and uses existing scoped worker config, always purpose=test.
Human review: review-template --results ... --output ...; fill fields, then score.
No operational logs contain prompts/replies. Replay artifacts contain only synthetic cases.
"""
import argparse
import copy
import hashlib
import json
import subprocess
import sys
import time
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CASES_PATH = Path(__file__).with_name("cases.json")

def fixture():
    raw = CASES_PATH.read_bytes()
    data = json.loads(raw)
    assert data["synthetic"] is True
    ids = [c["id"] for c in data["cases"]]
    assert len(ids) == len(set(ids)) and all(c["turns"] and c["criteria"] for c in data["cases"])
    return data, hashlib.sha256(raw).hexdigest()

def expected_turns(data):
    return {(case["id"], i) for case in data["cases"] for i in range(len(case["turns"]))}

def assess(results, review):
    data, digest = fixture()
    reasons = []
    if results.get("fixtureDigest") != digest or review.get("fixtureDigest") != digest:
        reasons.append("fixture_digest_mismatch")
    if review.get("resultsDigest") != hashlib.sha256(json.dumps(results, ensure_ascii=False, sort_keys=True).encode()).hexdigest():
        reasons.append("review_not_bound_to_results")
    expected = expected_turns(data)
    rows = results.get("turns", [])
    scores = review.get("turns", [])
    def keyed(values):
        keys = [(r.get("caseId"), r.get("turn")) for r in values]
        if len(keys) != len(set(keys)) or set(keys) != expected:
            reasons.append("missing_duplicate_or_extra_turns")
        return {k: r for k, r in zip(keys, values)}
    keyed(rows)
    keyed(scores)
    if not review.get("reviewer") or not review.get("reviewedAt"):
        reasons.append("human_review_missing")
    if results.get("mode") != "live":
        reasons.append("offline_route_coverage_is_not_language_acceptance")
    if any(r.get("status") not in ("ready", "needs_clarification", "no_evidence") or not r.get("text") for r in rows):
        reasons.append("failed_or_unanswered_turn")
    complete = all(all(type(s.get(k)) is bool for k in ("factsCorrect", "roleDateCorrect", "safe", "appropriateRepeatReaction")) and all(type(s.get(k)) is int and 0 <= s[k] <= 2 for k in ("usefulness", "naturalness")) for s in scores)
    if not complete or len(scores) != len(expected):
        reasons.append("review_incomplete")
    critical = sum(any(s.get(k) is False for k in ("factsCorrect", "roleDateCorrect", "safe", "appropriateRepeatReaction")) for s in scores)
    if critical:
        reasons.append("critical_review_failure")
    useful = sum(s.get("usefulness") == 2 and s.get("naturalness") == 2 for s in scores)
    rate = useful / len(expected)
    if rate < .9:
        reasons.append("usefulness_naturalness_below_90_percent")
    return {"status": "PASS" if not reasons else "NOT_ACCEPTED", "expectedTurns": len(expected), "criticalFailures": critical, "usefulNaturalFraction": rate, "reasons": sorted(set(reasons))}

def template(results):
    _, digest = fixture()
    return {"fixtureDigest": digest, "resultsDigest": hashlib.sha256(json.dumps(results, ensure_ascii=False, sort_keys=True).encode()).hexdigest(), "reviewer": None, "reviewedAt": None, "rubric": "0=incorrect/unhelpful, 1=partial/needs help, 2=independently useful/natural. All factual/role/date/safety/repeat booleans require explicit review; no transport/regex substitution.", "turns": [{"caseId": r["caseId"], "turn": r["turn"], "factsCorrect": None, "roleDateCorrect": None, "safe": None, "appropriateRepeatReaction": None, "usefulness": None, "naturalness": None, "notes": ""} for r in results["turns"]]}

def replay(live=False):
    from habi_worker import coach_router
    data, digest = fixture()
    cfg = None
    if live:
        from habi_worker.config import load_config
        from habi_worker.shared_ai import validate_service
        cfg = replace(load_config(), shared_ai_request_purpose="test")
        validate_service(cfg)
    base = json.loads((ROOT / "worker/tests/fixtures/coach-worker-context.json").read_text())["context"]
    rows = []
    for case in data["cases"]:
        dialogue = []
        notes = []
        previous = []
        for index, question in enumerate(case["turns"]):
            context = copy.deepcopy(base)
            context.update(question=question, viewerRole=case["role"], playerName="Szintetikus játékos", dialogue=dialogue[:], messageHistory=[], jobId=f"eval-{case['id']}-{index}", turnId=f"eval-{case['id']}-{index}")
            # Intentionally no invented check-in/report facts. Missing source is an evaluation condition.
            current = {"id": f"coach-message-eval-{case['id']}-{index}", "revision": 1, "span": None, "kind": "conversation_message", "title": "Aktuális szintetikus üzenet", "text": question, "at": data["referenceTime"], "role": case["role"]}
            sources = [current, *notes]
            refs = [{k: s[k] for k in ("id", "revision", "span")} for s in sources]
            helper = subprocess.run(["node", str(ROOT / "worker/evaluations/replay/guidance.mjs")], input=json.dumps({"question": question, "role": case["role"], "sources": sources, "now": data["referenceTime"], "previous": previous, "sourceRefs": refs}), text=True, capture_output=True, check=True)
            h = json.loads(helper.stdout)
            context.update(sourceSnapshots=sources, sourceManifest=refs, messageUnderstanding=h["understanding"])
            for name in ("guidance", "conversation", "safety", "pain"):
                context.pop(name, None)
                if h.get(name):
                    context[name] = h[name]
            context["promptManifest"]["sourceRefs"] = refs
            context["promptManifest"]["promptHash"] = hashlib.sha256((ROOT / "contracts/coach-prompt.md").read_bytes()).hexdigest()
            start = time.monotonic()
            try:
                if live:
                    from habi_worker.service_runtime import _answer_for_context
                    result = _answer_for_context(cfg, context)
                else:
                    result = coach_router.route(context)
                text = "" if result is None else result.get("reply", {}).get("text", "") or " ".join(c["text"] for c in result.get("claims", []))
                artifact = None if result is None else result.get("manifest", {}).get("modelArtifact")
                status = "UNCOVERED" if result is None else result.get("status")
                route = "uncovered" if result is None else "rules" if artifact and artifact.startswith("habi-") else "model"
            except Exception as error:
                status, text, artifact, route = "FAILED", "", type(error).__name__, "error"
                result = None
            rows.append({"caseId": case["id"], "turn": index, "question": question, "role": case["role"], "text": text, "status": status, "route": route, "artifact": artifact, "seconds": round(time.monotonic() - start, 3)})
            dialogue.append({"question": question, "answer": text, "questions": []})
            previous.append({"question": question, "answer": result, "sourceRefs": refs, "conversation": h.get("conversation")})
            for note_index, note in enumerate(h["understanding"].get("notes", [])):
                if note.get("quote"):
                    notes.append({**current, "id": f"eval-note-{case['id']}-{index}-{note_index}", "kind": "conversation_note", "title": f"Felhasználói {note.get('kind', 'update')} · {h['understanding'].get('subject', 'unknown')}", "text": note["quote"]})
    return {"fixtureDigest": digest, "mode": "live" if live else "offline", "synthetic": True, "contextLimitation": "Rule/API-shaped synthetic contexts without report/selected-chart snapshots; end-to-end context capture is a separate browser gate. No causal or multi-source acceptance inferred.", "turns": rows}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("replay"); run.add_argument("--live", action="store_true"); run.add_argument("--output", type=Path, required=True)
    review = sub.add_parser("review-template"); review.add_argument("--results", type=Path, required=True); review.add_argument("--output", type=Path, required=True)
    score = sub.add_parser("score"); score.add_argument("--results", type=Path, required=True); score.add_argument("--review", type=Path, required=True); score.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "replay":
        result = replay(args.live)
    elif args.command == "review-template":
        result = template(json.loads(args.results.read_text()))
    else:
        result = assess(json.loads(args.results.read_text()), json.loads(args.review.read_text()))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k not in ("turns", "rubric")}, ensure_ascii=False))
    if args.command == "score" and result["status"] != "PASS":
        return 2
    return 0

if __name__ == "__main__":
    sys.exit(main())
