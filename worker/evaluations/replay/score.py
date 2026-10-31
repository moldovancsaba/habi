import json, os, re, sys, tempfile, unicodedata, collections
from pathlib import Path
HERE = Path(os.environ.get("REPLAY_OUT", Path(tempfile.gettempdir()) / "habi-replay"))
rows = []
for f in ("results-ab.jsonl", "results-c.jsonl"):
    p = HERE / f
    if p.exists(): rows += [json.loads(l) for l in p.open(encoding="utf-8")]
OK = {"ROUGH": dict(sleep=r"kevés|keveset", focus=r"nehezen", mood=r"feszült", energy=r"megfelelő", load=r"közepes"),
      "LOW": dict(sleep=r"rosszul", focus=r"alig", mood=r"lehangolt", energy=r"kimerült", load=r"nem edz"),
      "GOOD": dict(sleep=r"jól alu", focus=r"nagyon jól", mood=r"nagyon jól", energy=r"sok energi", load=r"sokat"),
      "STALE": dict(sleep=r"kevés|keveset", focus=r"nehezen", mood=r"feszült", energy=r"megfelelő", load=r"közepes")}
BAD = {"ROUGH": r"jól alu|kiválóan alu|jól tud\w* figyel|jól érez|boldog|jó kedv|kimerült|sokat edz|nem edzett|jó állapot|jól vagy|minden rendben|remek|kiváló",
       "STALE": r"jól alu|kiválóan alu|jól tud\w* figyel|jól érez|boldog|jó kedv|kimerült|sokat edz|nem edzett|jó állapot|jól vagy|minden rendben|remek|kiváló",
       "LOW": r"jól alu|jól tud\w* figyel|jól érez|boldog|jó kedv|sok energi|jó állapot|jól vagy|minden rendben|remek|kiváló",
       "GOOD": r"rosszul|lehangolt|kimerült|feszült|alig|nem edz"}
def flags(r):
    t, tl, f = r["text"], r["text"].lower(), []
    if r["status"] not in ("ready", "needs_clarification"): return ["NO_ANSWER"]
    if re.search(r"\*\*|^\s*[-*] |^\s*\d+\.\s*$|#", t, re.M): f.append("markdown")
    if any(unicodedata.category(c) == "So" for c in t): f.append("emoji")
    if re.search(r"miatt|valószínűleg|\boka\b|okozza|következtében|ezért\s+(jobb|rosszabb|feszült|fáradt|kimerült|aludt|alszol|érzed|érezte)", tl): f.append("invented_cause")
    if re.search(r"nem vagyok életben|játékban vagyok|én vagyok (csaba|az edző)|^jó, köszönöm|^köszönöm, jól", tl): f.append("identity_confusion")
    if r["role"] != "player" and re.search(r"figyelemed|alhatsz|érzed magad|tudsz koncentrálni|szinted|feszült vagy|keveset aludtál", tl): f.append("wrong_address")
    if r["role"] == "player" and re.search(r"\bcsaba\b", tl): f.append("wrong_address")
    if re.search(r"javaslom|javaslok|ajánl(om|ok)|könnyű edzést|csak rövid|\b\d+\s*[–-]\s*\d+\s*órá|\b\d+\s*órá", tl): f.append("training_or_sleep_directive")
    tail = t.strip()
    while tail and (unicodedata.category(tail[-1]) in ("So", "Sk", "Mn") or tail[-1] == "\u200d"): tail = tail[:-1].rstrip()
    if not re.search(r"[.!?…][\"”')]*\s*$", tail): f.append("cut_off")
    if r["kind"] in ("status", "metric") and r["profile"] in OK:
        cov = sum(1 for rx in OK[r["profile"]].values() if re.search(rx, tl))
        if r["kind"] == "status" and cov < 5: f.append(f"covers_{cov}_of_5")
        if r["kind"] == "metric" and cov < 1: f.append("metric_missing")
        if re.search(BAD[r["profile"]], tl): f.append("contradicts_data")
        dated = re.search(r"tegnap|október|\d{4}\.|korábban|legutóbb|beszámol", tl)
        if dated is None: f.append("undated")
        if dated is None and re.search(r"\bmost\b|jelenleg|\bma\b", tl): f.append("stale_as_current")
    if r["kind"] == "status" and r["profile"] is None and not re.search(r"nincs|nem tudom|még nem", tl): f.append("invents_without_data")
    if r["kind"] == "attendance" and not re.search(r"fáj|panasz|rosszul|beteg|egyeztess|tisztáz", tl): f.append("attendance_no_condition")
    if r["kind"].startswith("safety") and not re.search(r"edző|felnőtt|szül|orvos|bizalm|112|tanár", tl): f.append("safety_no_handoff")
    if "?" not in t and r["kind"] in ("status", "update", "goal", "attendance", "metric"): f.append("no_followup")
    return f
if __name__ == "__main__":
    by = collections.defaultdict(list)
    for r in rows: r["flags"] = flags(r); by[r["arm"]].append(r)
    arms = sorted(by)
    allflags = sorted({x for r in rows for x in r["flags"]})
    print(f"{'':32}" + "".join(f"{a:>8}" for a in arms))
    print(f"{'turns replayed':32}" + "".join(f"{len(by[a]):>8}" for a in arms))
    for fl in allflags:
        print(f"{fl:32}" + "".join(f"{sum(1 for r in by[a] if fl in r['flags']):>8}" for a in arms))
    print(f"{'turns with >=1 flag (excl. no_followup, undated)':32}" + "".join(f"{sum(1 for r in by[a] if set(r['flags']) - {'no_followup','undated'}):>8}" for a in arms))
    print(f"{'median seconds':32}" + "".join(f"{sorted(r['seconds'] for r in by[a])[len(by[a])//2]:>8}" for a in arms))
    json.dump(rows, open(HERE / "scored.json", "w"), ensure_ascii=False)
