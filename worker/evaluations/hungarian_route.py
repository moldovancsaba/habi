"""Opt-in synthetic check of the experimental Hungarian API, not production approval.

Run with the scoped worker environment already loaded. Only the synthetic messages
below are sent. Successful HTTP responses still require human language review.
"""
import argparse
import json
import os
import time
import uuid
from dataclasses import replace

from habi_worker.config import load_config
from habi_worker.shared_ai import _request, _create_job


CASES = [
 ('initial','Csaba tegnapi saját beszámolója: megfelelő energia, kevés alvás, nehéz figyelem, feszültség, közepes edzésmennyiség. Hogy van Csaba?'),
 ('update','Csaba edzője vagyok. A korábbi kérdésed: Változott a közérzete? Válaszom: jobb a közérzete, kiderült, hogy elfelejtett reggelizni.'),
 ('correction','Csaba edzője vagyok. Korábban azt írtam, jobb a közérzete, elmaradt a reggeli. Pontosítás: nem a reggeli maradt ki, hanem a vacsora.'),
 ('feedback','Csaba edzője vagyok. Jobb a közérzete, elmaradt a vacsorája. Rövidebben válaszolj; ne ismételd az összes adatot.'),
 ('repeat','Csaba edzője vagyok. Már kérdeztem, hogy van Csaba. Azóta annyit jeleztem, hogy jobb a közérzete és elmaradt a vacsorája. Hogy van Csaba?'),
]


def probe(config, focused=False):
    instruction = "Habi vagy. Röviden, magyarul segíts. Ne találj ki tényeket vagy okokat. Az edző Csabáról beszél."
    cases = CASES
    if focused:
        instruction = "Te Habi, az AI-segítő vagy. Az edzővel beszélsz Csabáról, nem te vagy az edző. Az új közlésre reagálj. Ne találj ki tényeket vagy okokat. Őrizd meg a dátumot. Legfeljebb két rövid mondat."
        cases = cases[:2]
    complete = True
    for name, text in cases:
        messages = [{"role": "system", "content": instruction}, {"role": "user", "content": text}]
        size = len(json.dumps(messages, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        if size > 640:
            raise ValueError("Synthetic messages exceed the documented Hungarian byte limit")
        body = {"task": "text_chat_hu", "model": "auto",
                "input": {"messages": messages, "temperature": 0, "max_tokens": 128}}
        job = None
        try:
            job = _create_job(config, body, "habi-hu-check-" + str(uuid.uuid4()))
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                _, result, _ = _request(config, "GET", "/jobs/" + job)
                if result.get("status") in ("completed", "failed"):
                    output = result.get("result") or {}
                    choices = output.get("choices") or [{}]
                    finish = choices[0].get("finish_reason")
                    print(json.dumps({"case": name, "inputBytes": size, "status": result["status"],
                                      "result": output, "error": result.get("error")}, ensure_ascii=False), flush=True)
                    complete = complete and result["status"] == "completed" and finish == "stop"
                    break
                time.sleep(3)
            else:
                print(json.dumps({"case": name, "status": "timeout"}), flush=True)
                complete = False
        finally:
            if job:
                _request(config, "DELETE", "/jobs/" + job)
    print(json.dumps({"execution": "completed" if complete else "incomplete",
                      "languageQuality": "requires_human_review", "productionSettingsChanged": False}), flush=True)
    return 0 if complete else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--focused", action="store_true", help="Check explicit role and brevity instructions on two samples")
    args = parser.parse_args()
    config = replace(load_config(os.environ), shared_ai_request_purpose="test")
    return probe(config, args.focused)


if __name__ == "__main__":
    raise SystemExit(main())
