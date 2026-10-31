# Habi helyi AI-worker

## Szerep és határok

A Mac worker kifelé hívja a Habi API-t és a megosztott Hetzner AI API-t; nem csatlakozik közvetlenül MongoDB Atlashoz, nem kap felhasználói SSO credentialt, és nem fogad be tetszőleges hálózati kapcsolatot. A `hosted` értelmezési jobok a `text_chat` feladatot és alapértelmezésben az `auto` modellt használják. A helyi szintetikus/teszt mód továbbra is a rögzített `qwen2.5:7b` modellt használja; ennek digestjét és a prompt SHA-256 értékét a `contracts/runtime-manifest.json` rögzíti.

A `run-service` a Habi worker API-t használja: egy jobot claimel, lease alatt időnként heartbeatet küld, majd betölti az engedélyezett kontextust, és eredményt küld vissza. A személyes magyarázat forrásrefjeit a szerver újraellenőrzi; állításokat tartalmazó modellválasz emberi coach review-ra vár. Riportnál a worker a karanténban tartott PDF-et letölti, ellenőrzi a hash-t és ClamAV-val vizsgálja; csak `clean` eredmény után válik a riport olvashatóvá. Ismeretlen vagy hibás scanner-válasz esetén a riport karanténban marad.

## Módok

- `local_synthetic`: Ollama-verzió, modell, prompt hash, inference és kizárólagos hostzár ellenőrzése. Csak `development` + `HG_SYNTHETIC_DATA_ONLY=true`; felhő-, adatbázis- és felhasználói credentialt nem fogad el.
- `local_test`: localhoston futó Habi API-val dolgozó end-to-end worker. Kizárólag `test`, localhost HTTP, szintetikus DB és a repository `.env.test.example` tokenje engedélyezett.
- `hosted`: HTTPS Habi API, a Hetzner szolgáltatásspecifikus kulcsa és operátori konfiguráció kell. A két bearer csak a Macen marad; Vercelre kizárólag a Habi worker bearer SHA-256 verifiere kerül. A dolgozó szöveg és a kijelölt, jogosultság-ellenőrzött forráscsomag a Macről HTTPS-en a Hetzner API-hoz kerül. A Tailscale Funnel nem része ennek a kapcsolatnak.

## Helyi előfeltételek

- A helyi acceptancehez az Ollama elérhető `127.0.0.1:11434` címen, a manifest szerinti modell digesttel. A hosted mód a `https://chatbotapi.haho.ai/v1` API-t használja, nem helyi Ollama inference-t.
- `uv` és a repository lockfile szerinti Python-környezet.
- ClamAV telepítve, a `clamscan` elérhető a `PATH`-on, és az aláírás-adatbázis frissítve `freshclam` paranccsal. A worker 48 óránál régebbi adatbázissal nem adhat tiszta verdictet. Egyedi binárisútvonal esetén a `HG_CLAMSCAN_PATH` változó használható.
- Helyi, replica-setes Mongo tesztadatbázis és a futó Habi fejlesztői szerver.

macOS-en telepítés: `brew install clamav`, majd a Homebrew által jelzett `freshclam.conf` beállítása és `freshclam` futtatása. A tartós szolgáltatás aláírás-adatbázis frissítését ütemezni kell; enélkül a scanner 48 óra után megállítja a feldolgozást. A worker minden riportot fail-closed módon kezel, ha a scanner vagy adatbázis hiányzik, az adatbázis régi, vagy a scanner nem ad megbízható exit code-ot; a PDF nem kerül ki a karanténból.

## Szintetikus acceptance indítása

1. A repo gyökerében töltsd be a `.env.test.example` változóit, indítsd el a MongoDB-t `npm run db:test:start`, majd indítsd a Next szervert `npm run dev:test` paranccsal.
2. Külön terminálban:

   ```sh
   cd worker
   set -a; source .env.test.example; set +a
   uv sync --frozen
   uv run python -m habi_worker.cli run-service
   ```

3. Külön repo-root terminálban, ugyanazzal a `.env.test.example` beállítással futtasd a `npm run test:workflow:local` folyamatot. Ez kizárólag az explicit `habi_workflow_test` localhost adatbázist törli, 001–009 migrációt futtat, majd új szintetikus adatokat tölt vissza.
4. A worker JSON állapotüzeneteit figyeld. API- vagy függőséghibánál a job késleltetetten visszakerül a sorba; hálózati kiesés nem jelenik meg hamis üzleti hibaként. Az átmeneti hibák retryja 5 másodperctől legfeljebb 5 percig növekvő backoffot használ, majd tovább vár és próbálkozik. Csak végleges input/jogosultság/forrás hibák zárják le a jobot.
5. Leállítás: worker és app `Ctrl-C`, majd `npm run db:test:stop`.

A `.env.test.example` értékei kizárólag localhoston és szintetikus adatokkal használhatók. Más környezetben új, véletlen bearer tokent kell generálni és külön out-of-band csatornán kezelni; a tokent ne commitold és ne másold ticketbe vagy chatbe.

## Tartós macOS Production worker

A Production worker külön, gitignored `worker/.env.production.local` fájlt használ 0600 jogosultsággal. Ebben van a Habi API origin, a worker service ID/bearer, `HG_SHARED_AI_BASE_URL`, `HG_SHARED_AI_API_KEY`, `HG_SHARED_AI_MODEL=auto`, a prompt/release metaadat, a host lock és a ClamAV útvonala. Atlas-, session- vagy felhasználói SSO-kulcs tilos a worker környezetében. A Hetzner kulcs csak a worker folyamatnak adható, Vercelbe vagy böngészőbe nem kerülhet; a Habi worker bearer hash-ét a Habi Vercel Production `HG_WORKER_BEARER_SHA256` változója ellenőrzi.

A `launchd/com.doneisbetter.habi-worker.plist` fájlt a `~/Library/LaunchAgents` könyvtárba kell telepíteni. A `scripts/run-worker-production.sh` beolvassa a lokális titkos env fájlt, majd a lockfile-os szolgáltatást indítja. Állapot: `launchctl print gui/$(id -u)/com.doneisbetter.habi-worker`; leállítás: `launchctl bootout gui/$(id -u)/com.doneisbetter.habi-worker`. A stdout és stderr a `~/Library/Logs/habi-worker*.log` fájlokba kerül; token, prompt és személyes forrásszöveg nem kerülhet bele.

## Hibák és helyreállítás

- `HOST_LOCK_BUSY`: már fut egy worker ugyanazzal a lockfile-lal. Állítsd le a másik példányt; ne töröld a lockot élő worker mellett.
- `WORKER_API_TIMEOUT`: a Habi API nem válaszolt időben (a coach kontextus és a válasz lezárása 25, minden más hívás 8 másodpercig vár). Ha ugyanaz a job ismétlődően ezzel defereli magát, az nem átmeneti hálózati hiba: nézd meg a Vercel `habi.api.slow` eseményeit az adott műveletre (`worker.job.context`).
- `WORKER_API_UNAVAILABLE`, `SHARED_AI_UNAVAILABLE`, `SHARED_AI_CAPACITY` vagy ClamAV hiány: a worker késleltetve újrapróbálja vagy a Habi jobot defereli. A Hetzner job-létrehozás idempotenciakulccsal védett; a polling legfeljebb 300 másodpercig tart, majd a Habi recovery út dönt a retryról.
- `SHARED_AI_AUTHORIZATION_FAILED`, `SHARED_AI_TEXT_CHAT_NOT_PERMITTED`: állítsd le és javítsd a szolgáltatásspecifikus kulcsot/jogosultságot; ne próbálkozz másik projekt kulcsával.
- `SHARED_AI_RESULT_INVALID`, `SHARED_AI_JOB_EXPIRED`, `SHARED_AI_JOB_FAILED` vagy `SHARED_AI_INPUT_TOO_LARGE`: nincs válasz elfogadva; ellenőrizd a Habi worker jobját és az engedélyezett forráscsomag méretét.
- `AUTH_REVOKED`, `SOURCE_INVALIDATED`, `INVALID_INPUT`: a job terminális lehet; ellenőrizd a szerver oldali jogosultságot vagy az inputot. Ne reseteld számlálóit közvetlen DB-módosítással.
- `REVISION_CONFLICT`: a lease lejárt vagy új fence nyert. A régi worker nem írhat; kérjen új jobot.
- Malware verdict: az upload nem lesz olvasható, a blob törlése szükséges; a job okkódja `MALWARE_DETECTED`.
- Árva vagy beragadt job: diagnosztizáld a job státuszát, attempts/fence/leaseUntil mezőit és a redaktált worker logot. Ugyanazt a workflow/API recovery utat használd; kézi counter reset vagy bulk requeue tilos.

Worker JSON log nem ír promptot, személyes forrásszöveget, PDF-t vagy nyers credentialt. A Hetzner job API aszinkron sorának elérhetősége korlátozott; a job eredménye körülbelül 15 percig érhető el, ezért nem ez a Habi kanonikus tárolója. Habi ellenőrzi a source revisionöket és claim-citációkat mentés előtt. A transport teszt nem igazolja a magyar modellminőséget: eddigi szintetikus magyar válasz nem volt használható, ezért a hasznos válaszminőség külön értékelést igényel. Camera-képek Habi-ban nincsenek; a riport PDF ClamAV vizsgálata változatlan és nem AI moderáció.


## Magyar AI-edző útvonal

A hosted worker AI-edző beszélgetéseihez állítsd be: `HG_SHARED_AI_DIALOGUE_TASK=text_chat_hu`, `HG_SHARED_AI_DIALOGUE_MODEL=auto`. A többi értelmezési job továbbra is `text_chat` útvonalon fut. Az indulás ellenőrzi a jogosultságot és a feladaton belül engedélyezett modelleket; nincs csendes visszaesés az angol feladatra. A `habi.worker.shared_ai.ready` esemény tartalmazza a `dialogueTask` és `dialogueModel` mezőt, beszélgetésszöveg és kulcs nélkül.

A magyar szolgáltatás kísérleti. Az adapter 128 kimeneti tokent kér, az üzenetek UTF-8 méretét ellenőrzi, a próbálkozásokhoz helyet hagy, és csak a ténylegesen átadott forrásokra hivatkozik. A kanonikus állapotjelzés kérdéscímkéit rövidíti, minden válaszértéket megtartva. Szabad szöveget és felhasználói üzenetet nem csonkít. A túl hosszú üzenet megmarad az előzményekben, és rövidítést kérő válasz jelenik meg automatikus újrapróbálkozás helyett. A feldolgozott magyar API-eredményt törli a szolgáltatásból.

A 128 token magyarul kb. 270–310 karakter. Ha a modell válasza a korlát miatt megszakad (`finish_reason: length`), a worker a legutolsó teljes mondatig tartja meg (legalább 20 karakter; a „1.” listajel, a sorszám és a tizedespont nem mondatvég; megszakadt JSON-t soha nem vág), és `habi.worker.output.trimmed` eseményt naplóz hosszakkal, szöveg nélkül. Ha nincs teljes mondat, marad a régi újrapróbálás, majd `SHARED_AI_RESULT_INVALID`. Korábban minden hosszabb válasz kétszer megszakadt (az újrapróbálás ugyanazt a 128 tokent kapja), ezért az AI-edző nem válaszolt.

Szintetikus élő ellenőrzés: `PYTHONPATH=worker worker/.venv/bin/python worker/evaluations/coach_hungarian.py --task text_chat_hu` a repository gyökeréből, a worker környezetével. A teszt külön jelöli a forgalmat; éles működésben a `HG_SHARED_AI_REQUEST_PURPOSE` ne legyen beállítva. A kapcsolat működése nem jelent nyelvi vagy szakmai minőségi jóváhagyást.

A hosted AI-edző kérdést először a `habi_worker/coach_router.py` szabályai válaszolják meg (ismétlés, edzésútmutató, mentett állapotjelzés, nyugtázás); a magyar modell csak a maradékot kapja. Ha a modell válaszát az ellenőrzés kétszer elutasítja, a worker szabályalapú `habi-rules-fallback@1` választ ad a korábbi `SHARED_AI_RESULT_INVALID` hiba helyett. Ha az API a játékos üzenetéhez `safety.text` mezőt ad (a szerzői biztonsági szöveg), a worker pontosan ezt küldi vissza modell nélkül; fájdalomra, rosszullétre vagy a listán kívüli reménytelenségre utaló üzenetnél a szabályok és a tartalék válasz is tartózkodik. A telepítés sorrendje: előbb az API (a `safety` mező a `CoachWorkerContext` sémában), utána a worker újraindítása. Külön kapcsoló nincs: a visszaállítás a `coach_router.route` hívás eltávolítása a `service_runtime._answer_for_context` v2 ágában.

A valós használat összetétele (szabály vagy modell, válaszidő, elutasítási okok, hibák) tartalom nélkül: `python3 worker/evaluations/log_mix.py --since-start`. A szabályok teljes szövege felülvizsgálatra: `python3 worker/evaluations/copy_packet.py` (a `docs/ai-coach-copy-review-2026-10-31.md` fájlt írja).
