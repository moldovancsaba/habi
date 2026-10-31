"""Rules-first routing of AI-coach turns.

The server decides what is true; the model only answers what a rule cannot.
route() returns a finished answer for the question classes that have an
authored or source-bound rule, and None when the model should answer. fallback()
is the answer used when the model's reply was refused, so a turn never ends in
silence.

A message that may be about safety or pain is never answered by a rule here:
route() and fallback() both abstain and the existing behaviour applies. The
safety response and the coach alert are a separate decision (docs/ai-coach-analysis-2026-10-30.md, item 2).
"""
import re
import unicodedata

from habi_worker import plain_checkin
from habi_worker.coach_summary import source_summary

NO_RECORDED_ANSWER = "Ehhez a kérdéshez nincs rögzített válasz."
ACKNOWLEDGED_ACTS = ("correction", "feedback", "preference", "goal", "update")
NOTE_QUOTE_LIMIT = 300

# Tested against safetyKeywords in src/lib/content/guided-chat-routing-v1.json (test_coach_router.py).
SAFETY_OR_PAIN = re.compile("|".join([
    r"nem vagyok biztonsagban", r"nem erzem magam biztonsagban", r"bantanak", r"megut", r"bantom magam",
    r"bantani magam", r"artani magamnak", r"nem akarok elni", r"meg akarok halni", r"hurt myself", r"kill myself",
    r"not safe", r"being hurt", r"being bullied",
    r"semmi ertelme", r"nincs ertelme", r"nem akarok mar", r"nem birom", r"feladom", r"utalom magam",
    r"\bfaj\b", r"fajok", r"fajdalom", r"serul", r"szedul", r"rosszul vagyok", r"ajul", r"mellkas", r"legszomj", r"eszmeletem",
]))
# Questions that ask for advice, a reason or an opinion are not answered by a recorded fact.
NEEDS_JUDGEMENT = re.compile(r"tanacs|kellene|tegyek|csinaljak|gondolsz|szerinted|javit|miert|segits|mi alapjan|honnan")


def fold(text):
    return " ".join("".join(c for c in unicodedata.normalize("NFD", text.lower()) if not unicodedata.combining(c)).split())


def safety_hold(question):
    return bool(SAFETY_OR_PAIN.search(fold(question)))


def _reply(context, text, refs, artifact, understanding=None):
    return {
        "status": "ready", "questionRevision": context["turnRevision"], "claims": [],
        "reply": {"text": text, "sourceRefs": refs},
        **({"messageUnderstanding": understanding} if understanding else {}),
        "attributions": [], "unknowns": [], "clarifyingQuestions": [], "suggestedAction": None, "validity": "current",
        "manifest": {**context["promptManifest"], "modelArtifact": artifact},
    }


def _current_message_refs(context):
    pinned = {(r["id"], r["revision"]): r for r in context["sourceManifest"]}
    for source in context["sourceSnapshots"]:
        if source.get("kind") == "conversation_message" and source.get("text") == context["question"]:
            ref = pinned.get((source["id"], source["revision"]))
            return [ref] if ref else []
    return []


def repeated_answer(context):
    conversation = context.get("conversation")
    if not (conversation and conversation.get("suppressRepeatedAnswer")):
        return None
    return {
        "status": "needs_clarification", "questionRevision": context["turnRevision"],
        "claims": [], "attributions": [], "unknowns": [conversation["lead"]],
        "clarifyingQuestions": conversation["questions"],
        "suggestedAction": None, "validity": "current",
        "manifest": {**context["promptManifest"], "modelArtifact": "habi-conversation@1"},
    }


def guidance_answer(context):
    conversation = context.get("conversation")
    guidance = context.get("guidance")
    if not guidance or (conversation and conversation.get("hasNewUserContext")):
        return None
    facts = [claim for claim in source_summary(context, "GUIDANCE_EVIDENCE")["claims"] if claim["kind"] == "direct"][:2]
    return {
        "status": "ready", "questionRevision": context["turnRevision"],
        "claims": [guidance["claim"]] + facts,
        "attributions": ["Verziózott Habi-útmutatás, a kérdéshez kapcsolódó adatokkal."],
        "unknowns": guidance["unknowns"], "clarifyingQuestions": guidance["questions"],
        "suggestedAction": None, "validity": "current",
        "manifest": {**context["promptManifest"], "modelArtifact": "habi-guidance@1"},
    }


def _with_later_reports(context, bundle, answer):
    """Add what the viewer themselves reported after the check-in, quoted as written, so a repeated question does not ignore it."""
    since = bundle["source"].get("at", "")
    pinned = {(r["id"], r["revision"]): r for r in context["sourceManifest"]}
    notes = sorted((s for s in context["sourceSnapshots"]
                    if s.get("kind") == "conversation_note" and s.get("role") == context.get("viewerRole") and s.get("at", "") > since
                    and s.get("title", "").startswith(("Felhasználói update", "Felhasználói correction"))
                    and (s["id"], s["revision"]) in pinned and s.get("text", "").strip()),
                   key=lambda s: s["at"])[-2:]
    if not notes:
        return answer
    quoted = " ".join("„" + note["text"].strip().rstrip(".!") + "”" for note in notes)
    answer["claims"].insert(1, {"id": "plain-checkin-later", "text": "Utána ezt írtad: " + quoted + ".", "kind": "direct",
                                "evidenceRefs": [pinned[(note["id"], note["revision"])] for note in notes], "review": None})
    answer["clarifyingQuestions"] = ["Van azóta más változás?"]
    return answer


def status_answer(context):
    """The latest recorded check-in in plain, dated words, or an honest 'nothing recorded'."""
    question = context["question"]
    if NEEDS_JUDGEMENT.search(fold(question)) or not plain_checkin.explanation_requested(question):
        return None
    bundle = plain_checkin.checkin_facts(context)
    if bundle:
        return _with_later_reports(context, bundle, plain_checkin.plain_answer(context, bundle, plain_checkin.default_text(bundle)))
    checkins = [s for s in context["sourceSnapshots"] if s.get("kind") == "checkin_results" and s.get("role") == "player"]
    if checkins and any(s.get("text", "").strip() != NO_RECORDED_ANSWER for s in checkins):
        return None
    text = ("Erről a területről nincs mentett válasz, ezért nem tudok mit mondani róla. Ha elkészül az állapotjelzés, megnézzük együtt."
            if checkins else
            "Még nincs mentett állapotjelzés, ezért erre nem tudok forrásból válaszolni. Ha elkészül, megnézzük együtt.")
    return _reply(context, text, _current_message_refs(context), "habi-rules-no-data@1")


ACKNOWLEDGEMENTS = {
    "correction": "Köszönöm a pontosítást, az üzenetedet külön elmentettem. A korábbi bejegyzések az előzményekben megmaradnak.",
    "feedback": "Rendben, a kérésedet elmentettem.",
    "preference": "Rendben, a kérésedet elmentettem.",
    "goal": "Köszönöm, a célodat elmentettem. Megnézzük együtt, mit mutatnak erről a mentett állapotjelzések?",
    "update": "Köszönöm, hogy megírtad, az üzenetedet elmentettem. Van még valami, amit érdemes tudnom?",
}


def acknowledgement(context):
    """A short, honest receipt for a message that is a report, a correction, a preference or a goal rather than a question."""
    understanding = context.get("messageUnderstanding") or {}
    acts = [act for act in understanding.get("acts", []) if isinstance(act, str)]
    if "question" in acts or "hypothesis" in acts:
        return None
    kind = next((act for act in ACKNOWLEDGED_ACTS if act in acts), None)
    if kind is None:
        return None
    question = context["question"].strip()
    notes = [{"quote": question, "kind": kind, "timeText": None, "corrects": []}] if 0 < len(question) <= NOTE_QUOTE_LIMIT and "?" not in question else []
    subject = understanding.get("subject") if understanding.get("subject") in ("player", "author", "unknown") else "unknown"
    proposed = {"acts": acts[:8], "subject": subject, "notes": notes}
    return _reply(context, ACKNOWLEDGEMENTS[kind], _current_message_refs(context), "habi-rules-ack@1", proposed)


def route(context):
    """The rule-based answer for this turn, or None when the model should answer."""
    if safety_hold(context["question"]):
        return None
    return repeated_answer(context) or guidance_answer(context) or status_answer(context) or acknowledgement(context)


def fallback(context):
    """What to say when the model's reply was refused. None means: keep the old failure."""
    if safety_hold(context["question"]):
        return None
    text = ("Erre most nem tudtam megbízható választ adni, ezért nem találok ki semmit. Az üzenetedet elmentettem. "
            "A mentett állapotjelzésekről és az edzésre menésről biztosan tudok beszélni. Melyikről beszéljünk?")
    return _reply(context, text, _current_message_refs(context), "habi-rules-fallback@1")
