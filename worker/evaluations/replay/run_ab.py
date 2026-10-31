"""Opt-in synthetic live replay of the recorded coach questions. Sends synthetic text only, marked as test traffic.
Run from the repository root with the worker environment loaded (do not print it):
  set -a; source worker/.env.production.local; set +a
  worker/.venv/bin/python worker/evaluations/replay/run_ab.py [thread-id ...]
  python3 worker/evaluations/replay/arm_c.py && python3 worker/evaluations/replay/score.py
Results go to $REPLAY_OUT (default: the system temp dir, habi-replay). Never an approval of language quality.

Replay the recorded threads through the worker's real _answer_for_context.
Arm A = production routing (dialogueVersion 2, text_chat_hu) with a bare context (what the 2026-10-30 baseline used).
Arm D = the same routing with the context the API really sends (guidance, conversation and messageUnderstanding computed by the
repo's own functions); REPLAY_ARMS=D selects it. Arm B = the rule-based routing the code still contains
(guidance / continuity), reached only when dialogueVersion is absent and the task is text_chat."""
import concurrent.futures as cf, hashlib, json, os, subprocess, sys, tempfile, threading, time, uuid
from dataclasses import replace
from pathlib import Path
HERE = Path(__file__).parent
ROOT = HERE.resolve().parents[2]
RESULTS = Path(os.environ.get("REPLAY_OUT", Path(tempfile.gettempdir()) / "habi-replay")); RESULTS.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / "worker")); sys.path.insert(0, str(HERE))
from habi_worker.config import load_config
from habi_worker import service_runtime as sr
from habi_worker.shared_ai import validate_service, SharedAIError
from scenarios import NOW, CHECKINS, THREADS

PROMPT = (ROOT / "contracts" / "coach-prompt.md").read_text(encoding="utf-8")
PROMPT_HASH = hashlib.sha256(PROMPT.encode()).hexdigest()
LOCK = threading.Lock()
OUT = RESULTS / "results-ab.jsonl"
ARMS = os.environ.get("REPLAY_ARMS", "A,B").split(",")
B_THREADS = {"Q-attend-player", "Q-attend-coach-self", "Q-attend-parent-other", "Q-attend-repeat-3x"}
EXTRA = [("Q-attend-repeat-3x", "docs/2026-10-28-coach-conversation-continuity.md", "player", "ROUGH",
          ["Menjek ma edzésre?"] * 3, ["attendance", "repeat", "repeat"])]


def node_helper(payload):
    r = subprocess.run(["node", str(HERE / "guidance.mjs")], input=json.dumps(payload), capture_output=True, text=True, timeout=30)
    if r.returncode: raise RuntimeError(r.stderr[:300])
    return json.loads(r.stdout)


def render(result):
    if result.get("reply"): return result["reply"]["text"]
    parts = [c["text"] for c in result.get("claims", [])[:1]] + result.get("unknowns", [])[:1] + result.get("clarifyingQuestions", [])[:1]
    return " ".join(parts)


def run_thread(tid, src, role, profile, messages, kinds, cfgA, cfgB):
    dialogue, notes = [], []
    prevB = []
    for i, (message, kind) in enumerate(zip(messages, kinds)):
        current = {"id": f"{tid}-m{i}", "revision": 1, "span": None, "kind": "conversation_message", "role": role,
                   "title": "Mostani saját üzenet", "text": message, "at": NOW}
        sources = [current]
        guide_src = None
        for arm in ARMS:
            if arm == "B" and tid not in B_THREADS: continue
            snaps = [current]
            if kind == "attendance":
                if guide_src is None:
                    guide_src = node_helper({"question": message, "role": role, "sources": [], "now": NOW, "previous": [], "sourceRefs": []})["guidanceSource"]
                snaps.append(guide_src)
            if profile:
                at, text = CHECKINS[profile]
                snaps.append({"id": f"{tid}-checkin", "revision": 1, "span": None, "kind": "checkin_results", "role": "player",
                              "title": "Napi állapotjelzés", "at": at, "text": text})
            snaps += notes
            refs = [{k: s[k] for k in ("id", "revision", "span")} for s in snaps]
            ctx = {"jobId": str(uuid.uuid4()), "turnId": str(uuid.uuid4()), "turnRevision": 1, "viewerRole": role, "playerName": "Teszt Csaba",
                   "coachMode": True, "question": message, "sourceManifest": refs, "sourceSnapshots": snaps,
                   "promptManifest": {"sourceRefs": refs, "promptHash": PROMPT_HASH}, "dialogue": list(dialogue), "opening": "",
                   "messageUnderstanding": {"acts": ["question"]}, "messageHistory": [], "fence": 1}
            cfg = cfgA
            if arm in ("A", "D"):
                ctx["dialogueVersion"] = 2
            if arm == "D":
                h = node_helper({"question": message, "role": role, "sources": snaps, "now": NOW, "previous": prevB, "sourceRefs": refs})
                ctx["messageUnderstanding"] = h["understanding"]
                if h["safety"]: ctx["safety"] = h["safety"]
                if h["pain"]: ctx["pain"] = h["pain"]
                if h["guidance"]: ctx["guidance"] = h["guidance"]
                if h["conversation"]: ctx["conversation"] = h["conversation"]
            if arm == "B":
                cfg = cfgB
                h = node_helper({"question": message, "role": role, "sources": snaps, "now": NOW, "previous": prevB, "sourceRefs": refs})
                if h["guidance"]: ctx["guidance"] = h["guidance"]
                if h["conversation"]: ctx["conversation"] = h["conversation"]
            t0 = time.monotonic()
            try:
                result = sr._answer_for_context(cfg, ctx)
                status, text = result.get("status"), render(result)
                model = result.get("manifest", {}).get("modelArtifact")
            except SharedAIError as e:
                status, text, model = "FAILED", str(e), None
            except Exception as e:
                status, text, model = "ERROR", type(e).__name__ + ": " + str(e)[:150], None
            row = {"thread": tid, "turn": i, "arm": arm, "role": role, "profile": profile, "kind": kind, "message": message if len(message) < 400 else message[:60] + "…[long]",
                   "status": status, "text": text, "model": model, "seconds": round(time.monotonic() - t0, 1)}
            with LOCK:
                with OUT.open("a", encoding="utf-8") as f: f.write(json.dumps(row, ensure_ascii=False) + "\n")
            if arm in ("A", "D"):
                dialogue.append({"question": message, "answer": text if status in ("ready", "needs_clarification") else "", "questions": []})
            if arm in ("B", "D"):
                prevB.append({"question": message, "answer": {"claims": result.get("claims", []) if status != "FAILED" else [], "clarifyingQuestions": result.get("clarifyingQuestions", [])} if status not in ("FAILED", "ERROR") else None,
                              "sourceRefs": refs, "conversation": ctx.get("conversation")})
        # recorded-evaluation note accumulation (as worker/evaluations/coach_hungarian.py does)
        if kind in ("update", "correction", "feedback", "goal"):
            if kind == "correction":
                notes = [n for n in notes if n.get("noteKind") != "update"]
                notes.append({**current, "id": f"{tid}-preserved", "kind": "conversation_note", "text": "Jobb a közérzete." if role != "player" else "Jobban érzem magam.", "title": "Új beszámoló · player"})
            notes.append({**current, "id": f"{tid}-note{i}", "kind": "conversation_note", "noteKind": kind, "title": "Felhasználói " + kind + " · " + ("author" if kind == "feedback" else "player")})


def main():
    base = replace(load_config(os.environ), shared_ai_request_purpose="test")
    cfgA = replace(base, shared_ai_dialogue_task="text_chat_hu", shared_ai_dialogue_model="auto")
    cfgB = replace(base, shared_ai_dialogue_task="text_chat", shared_ai_dialogue_model="auto")
    validate_service(cfgA)
    only = set(sys.argv[1:])
    jobs = [t for t in THREADS + EXTRA if not only or t[0] in only]
    with cf.ThreadPoolExecutor(3) as pool:
        futures = [pool.submit(run_thread, *t, cfgA, cfgB) for t in jobs]
        for f in futures: f.result()
    print("DONE", flush=True)


main()
