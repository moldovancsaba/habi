"""Arm C: PROTOTYPE of a rules-first coach (no model). Reuses the repo's own authored content and fact composer.
Draft wording only: every sentence is a template over recorded data; nothing here has had a Hungarian copy review."""
import json, os, re, subprocess, sys, tempfile, time, unicodedata
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
HERE = Path(__file__).parent
ROOT = HERE.resolve().parents[2]
RESULTS = Path(os.environ.get("REPLAY_OUT", Path(tempfile.gettempdir()) / "habi-replay")); RESULTS.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / "worker")); sys.path.insert(0, str(HERE))
from habi_worker.plain_checkin import LABELS, PHRASES, MONTHS, default_text
from scenarios import NOW, CHECKINS, THREADS
CONTENT = ROOT / "src" / "lib" / "content"
GUIDE = json.load(open(CONTENT / "coach-guidance-v1.json", encoding="utf-8"))["training-attendance"]
PRACTICES = {p["id"]: p for p in json.load(open(CONTENT / "practices-v2.json", encoding="utf-8"))["items"]}
EXTRA = [("Q-attend-repeat-3x", "", "player", "ROUGH", ["Menjek ma edzésre?"] * 3, ["attendance", "repeat", "repeat"])]
N = lambda t: "".join(c for c in unicodedata.normalize("NFD", t.lower()) if not unicodedata.combining(c))
SAFETY_PAIN = r"faj\b|fajok|fajdalom|serul|szedul|rosszul vagyok|ajul|mellkas|legszomj|eszmeletem"
SAFETY_MOOD = r"semmi ertelme|nincs ertelme|nem akarok mar|nem birom|feladom|utalom magam|bantani magam|nem akarok elni"
ROLE_HU = {"player": "te", "coach": "az edző", "parent": "a szülő"}


def node(payload):
    r = subprocess.run(["node", str(HERE / "guidance.mjs")], input=json.dumps(payload), capture_output=True, text=True, timeout=30)
    return json.loads(r.stdout)


def parse_checkin(profile, role):
    if not profile: return None
    at, text = CHECKINS[profile]
    side = "player" if role == "player" else "other"
    facts = {}
    for line in text.splitlines():
        for metric, (label, answers) in LABELS.items():
            if line.startswith(label):
                facts[metric] = PHRASES[side][metric][answers.index(line[len(label):].strip())]
    date = datetime.fromisoformat(at.replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Budapest"))
    age = (datetime.fromisoformat(NOW.replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Budapest")).date() - date.date()).days
    return {"facts": facts, "date": date, "age": age, "text": text, "stamp": f"{date.year}. {MONTHS[date.month - 1]} {date.day}-i"}


def classify(message, role):
    q = N(message)
    if len(message.encode()) > 520: return "toolong"
    if re.search(SAFETY_MOOD, q): return "safety_mood"
    if re.search(SAFETY_PAIN, q): return "safety_pain"
    if re.search(r"edz|trening|train|practice", q) and re.search(r"menj|mehe|menni|edzhet|kihagy|should|attend|skip", q): return "attendance"
    if re.search(r"^(tenyleg|biztos|miert|mi alapjan|honnan)", q): return "followup"
    if re.search(r"pontositas|helyesbit|ugy ertettem|nem .{0,100}hanem", q): return "correction"
    if re.search(r"rovidebb|roviden|ismetled|hosszabb|nem segitett|hasznos volt", q): return "feedback"
    if re.search(r"celom|az a cel|szeretnek (elerni|jobban)", q): return "goal"
    if re.search(r"tanacs|mit (kellene|tegyek|csinaljak|gondolsz)|hogyan javit|segits|mit tanacsol", q): return "advice"
    m = [k for k, rx in (("sleep", r"alv|alud|pihen"), ("energy", r"energi"), ("focus", r"figyel|koncentr"), ("mood", r"kozerzet|hangulat|feszult")) if re.search(rx, q)]
    if len(m) == 1 and "?" in message: return "metric:" + m[0]
    if re.search(r"hogy (vagy|allok|van|all|aludtam)|magyarazd|egyszerubben|mit mutat|osszefoglal", q): return "status"
    if re.search(r"mire jo|mi az a|hogyan hasznal", q): return "product"
    if re.fullmatch(r"(szia|hello|hali|jo napot|udv)[ !.]*", q.strip()): return "smalltalk"
    if re.search(r"jobban|rosszabb|erzem|vagyok|kiderult|elfelejt|ettem|aludt|edzett", q): return "update"
    return "offtopic"


def since(state, role):
    if not state["notes"]: return ""
    who = "Utána ezt írtad: " if role == "player" else "Utána ezt jelezted: "
    return " " + who + " ".join("„" + n.rstrip(".!") + "”" for n in state["notes"][-2:]) + "."


def status_text(c, role, name, only=None, state=None):
    facts = {k: v for k, v in c["facts"].items() if only in (None, k)}
    body = default_text({"facts": [{"key": k, "variants": [v]} for k, v in facts.items()]})
    who = "A " + c["stamp"] + " beszámolódban azt jelezted, hogy " if role == "player" else f"{name} a {c['stamp']} beszámolójában azt jelezte, hogy "
    age = "" if c["age"] <= 1 else f" Ez az adat {c['age']} napos."
    if only: ask = "Azóta változott ezen valami?"
    else: ask = "Most is így érzed magad, vagy azóta változott valami?" if role == "player" else "Azóta változott valami a közérzetében?"
    tail = since(state, role) if state else ""
    if tail: ask = "Van azóta más változás?"
    return who + body + age + tail + " " + ask


def reply(message, role, profile, state):
    kind, c, name = classify(message, role), parse_checkin(profile, role), "Csaba"
    quote = "„" + message.strip().rstrip(".!") + "”"
    if kind == "toolong":
        return kind, "Köszönöm, hogy ilyen részletesen leírtad, az üzenetedet elmentettem. Melyik résszel kezdjük: az alvással, az edzéssel vagy a napirenddel?"
    if kind == "safety_mood":
        return kind, "Köszönöm, hogy ezt megírtad, ez fontos. Nem kell egyedül maradnod vele: kérlek, még ma mondd el egy felnőttnek, akiben megbízol, például az edződnek vagy a szüleidnek. Ha úgy érzed, hogy veszélyben vagy, azonnal hívd a 112-t. Szólni fogsz valakinek ma erről?"
    if kind == "safety_pain":
        return kind, "Köszönöm, hogy megírtad. Ha fáj valamid, ne erőltesd az edzést, és még ma mondd el az edződnek vagy egy felnőttnek, akiben megbízol. Ha erős a fájdalom vagy rosszul vagy, kérj orvosi segítséget. Szóltál már erről valakinek?"
    if kind == "attendance":
        h = node({"question": message, "role": role, "sources": [{"id": "x", "revision": 1, "kind": "checkin_results", "at": CHECKINS[profile][0]}] if profile else [], "now": NOW, "previous": state["prevB"], "sourceRefs": []})
        conv = h["conversation"]
        if conv and conv.get("suppressRepeatedAnswer"):
            out = conv["lead"] + " " + (conv["questions"][0] if conv["questions"] else "")
        else:
            g = h["guidance"]; out = g["claim"]["text"] + " " + g["unknowns"][0] + " " + g["questions"][0]
        state["prevB"].append({"question": message, "answer": {"claims": [{"kind": "general", "text": out}], "clarifyingQuestions": []}, "sourceRefs": [], "conversation": conv})
        return kind, out
    if kind.startswith("metric:"):
        m = kind.split(":")[1]
        if not c or m not in c["facts"]: return kind, "Erről a területről nincs mentett válaszod, ezért nem tudok mit mondani. Kitöltöd hozzá a napi állapotjelzést?"
        return kind, status_text(c, role, name, only=m, state=state)
    if kind in ("status", "followup"):
        if not c: return kind, ("Még nincs mentett állapotjelzésed, ezért nem tudom megmondani, hogyan állsz. Ha kitöltöd a napi állapotjelzést, megnézzük együtt. Addig: hogy érzed magad ma?" if role == "player" else f"{name} még nem töltött ki állapotjelzést, ezért nincs mit mutatnom. Mit tudsz róla mondani te?")
        if state["last_status_q"] == N(message) and not state["fresh"]:
            state["repeats"] += 1
            leads = ["Ugyanezt kérdezted, és új adat nincs, ezért nem ismétlem az egészet. Mi hiányzott a válaszból: a jelentése, az indoka vagy a következő lépés?",
                     "Látom, hogy az eddigi válaszok nem adták meg, amit keresel. Segíts, mire lenne szükséged: más szempontból nézzük az adatokat, vagy írod, mi változott?"]
            return kind, leads[min(state["repeats"] - 1, 1)]
        state["last_status_q"] = N(message); state["repeats"] = 0; state["fresh"] = False
        if kind == "followup": return kind, "Igen, ez a " + c["stamp"] + " beszámolóból következik, mást nem tudok róla. Ha azóta változott valami, írd meg, és azt veszem alapul."
        return kind, status_text(c, role, name, state=state)
    if kind == "advice":
        flags = []
        if c:
            f = c["facts"]
            if re.search(r"keveset|rosszul", f.get("sleep", "")): flags.append(("sleep", "alvás"))
            if re.search(r"nehezen|alig", f.get("focus", "")): flags.append(("focus", "figyelem"))
            if re.search(r"feszült|lehangolt", f.get("mood", "")): flags.append(("pause", "feszültség"))
        if not flags: return kind, "A mentett válaszaid alapján most nincs olyan terület, amit kiemelnék. Melyik területen szeretnél próbálkozni: alvás, figyelem vagy feszültség?"
        opts = ", ".join("„" + PRACTICES[k]["title"] + "” (" + label + ")" for k, label in flags[:3])
        return kind, f"A {c['stamp']} beszámolód alapján ezekből a kis gyakorlatokból választhatsz: {opts}. Melyiket nézzük meg részletesen? Ez nem edzésterv és nem orvosi javaslat."
    if kind == "update": return kind, f"Köszönöm, hogy megírtad. Elmentettem: {quote}. Mi változott még azóta?"
    if kind == "correction": return kind, f"Köszönöm a pontosítást, külön rögzítettem: {quote}. A korábbi bejegyzés az előzményekben megmarad."
    if kind == "feedback": return kind, "Rendben, rövidebben válaszolok. A kérésedet elmentettem."
    if kind == "goal": return kind, f"Rögzítettem a célodat: {quote}. Megnézzük együtt, mit mutatnak erről a mentett válaszaid?"
    if kind == "smalltalk": return kind, "Szia! Kérdezhetsz a mentett állapotjelzéseidről, arról, hogy menj-e edzésre, vagy hogyan használd a Habit. Miben segíthetek?"
    if kind == "product": return kind, "Az Állapotjelzések grafikonja az időrendben rögzített válaszkategóriákat mutatja. Az üres nap és a kihagyott válasz nem kitöltött adat. Melyik részét nézzük meg?"
    return kind, "Ebben nem tudok segíteni: a Habiban a mentett állapotjelzéseidről, az edzésre menésről és a Habi használatáról beszélgethetünk. Melyik érdekel?"


def remember(kind, message, state):
    if kind in ("update", "correction", "goal"):
        state["notes"].append(message.strip()); state["fresh"] = True


def main():
    out = RESULTS / "results-c.jsonl"; out.write_text("")
    for tid, src, role, profile, messages, kinds in THREADS + EXTRA:
        state = {"last_status_q": None, "repeats": 0, "prevB": [], "notes": [], "fresh": False}
        for i, m in enumerate(messages):
            t0 = time.monotonic(); kind, text = reply(m, role, profile, state); remember(kind, m, state)
            row = {"thread": tid, "turn": i, "arm": "C", "role": role, "profile": profile, "kind": kinds[i], "routed": kind,
                   "message": m if len(m) < 400 else m[:60] + "…[long]", "status": "ready", "text": text, "model": "rules", "seconds": round(time.monotonic() - t0, 3)}
            with out.open("a", encoding="utf-8") as f: f.write(json.dumps(row, ensure_ascii=False) + "\n")
main()
