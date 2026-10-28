"""Factual, attributed fallback when a coach generation service cannot answer."""
from datetime import datetime
from zoneinfo import ZoneInfo

def source_summary(context, reason):
    sources = context.get("sourceSnapshots", [])
    refs = context["sourceManifest"]
    personal = [s for s in sources if s.get("kind") in ("checkin_results","records","assessment_results","monthly_reflections","plans","follow_ups","extractions","coach_materials","personal_memory")]
    selected = sorted(personal, key=lambda s: (s.get("kind")=="checkin_results",s.get("at", "")), reverse=True)[:3] if personal else ([s for s in sources if s.get("kind")=="derived_profile"][:1] or sources[:1])
    metric_help=[s for s in sources if s.get("id","").startswith("habi-metric-")]
    selected=selected[:2]+metric_help[:1] if metric_help else selected
    claims = []
    for source in selected:
        ref = next((r for r in refs if r["id"] == source.get("id") and r["revision"] == source.get("revision")), None)
        text = source.get("text", "").strip()
        if not ref or not text:
            continue
        at = source.get("at", "")
        if at:
            try: at=datetime.fromisoformat(at.replace("Z","+00:00")).astimezone(ZoneInfo("Europe/Budapest")).strftime("%Y. %m. %d. %H:%M")
            except ValueError: at=""
        attribution = {"player":"A játékos saját beszámolója", "parent":"Szülői beszámoló", "coach":"Edzői megfigyelés", "Habi":"Habi-tartalom"}.get(source.get("role"), "Mentett forrás")
        if source.get("kind")=="derived_profile": attribution="Források alapján rendezett profilpillanatkép"
        if source.get("kind")=="authored_content": attribution="Habi magyarázó tartalom"
        claims.append({"id":"source-" + str(len(claims)+1), "text":(attribution + (" · " + at if at else "") + ":\n" + text)[:2000], "kind":"general" if source.get("kind")=="authored_content" else "direct", "evidenceRefs":[ref], "review":None})
    return {"status":"ready" if claims else "needs_clarification", "questionRevision":context["turnRevision"], "claims":claims,
            "attributions":["A modellválasz helyett a mentett források tényszerű összefoglalója látható."],
            "unknowns":["Ebből nem állapítunk meg okot, diagnózist vagy teljes játékosértékelést."],
            "clarifyingQuestions":["Melyik rész érdekel: a legutóbbi állapotjelzés, a saját célok vagy a korábbi felmérés?"],
            "suggestedAction":None, "validity":"current", "manifest":{**context["promptManifest"], "modelArtifact":"habi-source-summary@1"}}
