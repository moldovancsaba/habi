"""Synthetic, opt-in live conversation evaluation. Never a language-quality approval.

Run from the repository root with the scoped worker environment already loaded:
  PYTHONPATH=worker worker/.venv/bin/python worker/evaluations/coach_hungarian.py
Only synthetic messages below may be sent. Output contains synthetic transcripts.
"""
import argparse
import json
import os
import uuid
from dataclasses import replace
from habi_worker.config import load_config
from habi_worker.coach_dialogue import answer
from habi_worker.shared_ai import SharedAIError, validate_service


MESSAGES = [
    ("Hogy van Csaba?", "question"),
    ("Jobb a közérzete, kiderült, hogy elfelejtett reggelizni.", "update"),
    ("Pontosítás: nem a reggeli maradt ki, hanem a vacsora.", "correction"),
    ("Rövidebben válaszolj, és ne ismételd meg a teljes beszámolót.", "feedback"),
    ("Hogy van Csaba?", "question"),
]


def evaluate(config, role="coach"):
    messages = MESSAGES if role != "player" else [
        ("Hogy állok most?", "question"),
        ("Jobban érzem magam, kiderült, hogy elfelejtettem reggelizni.", "update"),
        MESSAGES[2], MESSAGES[3], ("Hogy állok most?", "question"),
    ]
    dialogue, sources, passed = [], [], True
    checkin = {"id": "synthetic-checkin", "revision": 1, "span": None,
               "kind": "checkin_results", "role": "player", "title": "Tegnapi saját beszámoló",
               "at": "2026-10-27T10:28:14Z",
               "text": "Mennyi energiád van? Megfelelő\nHogyan aludtál? Keveset\nMennyire tudsz figyelni? Nehezen\nHogy érzed magad? Feszült\nMennyit edzettél? Közepesen"}
    for index, (message, act) in enumerate(messages):
        current = {"id": "coach-message-synthetic-" + str(index), "revision": 1, "span": None,
                   "kind": "conversation_message", "role": role, "title": "Saját üzenet",
                   "text": message, "at": "2026-10-28T09:%02d:00Z" % index}
        snapshots = [current, checkin] + sources
        refs = [{k: s[k] for k in ("id", "revision", "span")} for s in snapshots]
        context = {"jobId": str(uuid.uuid4()), "turnRevision": 1, "viewerRole": role,
                   "playerName": "Teszt Csaba", "question": message, "sourceManifest": refs,
                   "sourceSnapshots": snapshots, "promptManifest": {"sourceRefs": refs},
                   "messageUnderstanding": {"acts": [act]}, "dialogue": dialogue, "messageHistory": []}
        try:
            result = answer(config, context)
        except SharedAIError as error:
            print(json.dumps({"case": index, "status": "generation_failed", "error": str(error)}), flush=True)
            passed = False
            break
        text = result["reply"]["text"]
        print(json.dumps({"case": index, "user": message, "reply": text,
                          "model": result["manifest"]["modelArtifact"],
                          "sourceIds": [r["id"] for r in result["reply"]["sourceRefs"]]}, ensure_ascii=False), flush=True)
        dialogue.append({"question": message, "answer": text})
        if act == "correction":
            sources = [s for s in sources if s.get("noteKind") != "update"]
            # Retain the unaffected clause; only the meal detail was corrected.
            sources.append({**current, "id": "synthetic-preserved-wellbeing", "kind": "conversation_note",
                            "text": "Jobb a közérzete.", "title": "Új beszámoló · player"})
        if act != "question":
            sources.append({**current, "id": "coach-note-synthetic-" + str(index), "kind": "conversation_note",
                            "noteKind": act, "title": "Felhasználói " + act + " · " + ("author" if act == "feedback" else "player")})
    print(json.dumps({"execution": "completed" if passed else "failed",
                      "languageQuality": "requires_human_review",
                      "review": ["Natural Hungarian", "Correct coach/player address", "Latest correction respected",
                                 "No invented cause or action", "No repeated answer", "Useful response to feedback"]}), flush=True)
    return 0 if passed else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="auto", help="Existing permitted model; default follows the service selection")
    parser.add_argument("--role", choices=("coach", "parent", "player"), default="coach")
    args = parser.parse_args()
    config = replace(load_config(os.environ), shared_ai_request_purpose="test", shared_ai_dialogue_model=args.model)
    validate_service(config)
    raise SystemExit(evaluate(config, args.role))
