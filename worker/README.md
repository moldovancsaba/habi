# Habi helyi AI-worker

## Szerep és határok

A Mac worker kifelé hívja a Habi API-t; nem csatlakozik közvetlenül MongoDB Atlashoz, nem kap felhasználói SSO credentialt, és nem fogad be tetszőleges hálózati kapcsolatot. A helyi modell a rögzített `qwen2.5:7b`; a modell digestjét és a prompt SHA-256 értékét a `contracts/runtime-manifest.json` rögzíti.

A `run-service` a Habi worker API-t használja: egy jobot claimel, lease alatt időnként heartbeatet küld, majd betölti az engedélyezett kontextust, és eredményt küld vissza. A személyes magyarázat forrásrefjeit a szerver újraellenőrzi; állításokat tartalmazó modellválasz emberi coach review-ra vár. Riportnál a worker a karanténban tartott PDF-et letölti, ellenőrzi a hash-t és ClamAV-val vizsgálja; csak `clean` eredmény után válik a riport olvashatóvá. Ismeretlen vagy hibás scanner-válasz esetén a riport karanténban marad.

## Módok

- `local_synthetic`: Ollama-verzió, modell, prompt hash, inference és kizárólagos hostzár ellenőrzése. Csak `development` + `HG_SYNTHETIC_DATA_ONLY=true`; felhő-, adatbázis- és felhasználói credentialt nem fogad el.
- `local_test`: localhoston futó Habi API-val dolgozó end-to-end worker. Kizárólag `test`, localhost HTTP, szintetikus DB és a repository `.env.test.example` tokenje engedélyezett.
- `hosted`: HTTPS Habi API és operátori konfiguráció kell. A nyers worker bearer csak a Macen marad; Vercelre kizárólag SHA-256 verifier kerül. E mód konfigurálása/indítása nincs része a helyi acceptance próbának.

## Helyi előfeltételek

- A helyi Ollama elérhető `127.0.0.1:11434` címen, a manifest szerinti modell digesttel.
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

## Hibák és helyreállítás

- `HOST_LOCK_BUSY`: már fut egy worker ugyanazzal a lockfile-lal. Állítsd le a másik példányt; ne töröld a lockot élő worker mellett.
- `WORKER_API_UNAVAILABLE` vagy Ollama/ClamAV hiány: a worker várakozik, a job retryra kerül. Helyreállás után ugyanaz a job új lease-t kap.
- `AUTH_REVOKED`, `SOURCE_INVALIDATED`, `INVALID_INPUT`: a job terminális lehet; ellenőrizd a szerver oldali jogosultságot vagy az inputot. Ne reseteld számlálóit közvetlen DB-módosítással.
- `REVISION_CONFLICT`: a lease lejárt vagy új fence nyert. A régi worker nem írhat; kérjen új jobot.
- Malware verdict: az upload nem lesz olvasható, a blob törlése szükséges; a job okkódja `MALWARE_DETECTED`.
- Árva vagy beragadt job: diagnosztizáld a job státuszát, attempts/fence/leaseUntil mezőit és a redaktált worker logot. Ugyanazt a workflow/API recovery utat használd; kézi counter reset vagy bulk requeue tilos.

Worker JSON log nem ír promptot, személyes forrásszöveget, PDF-t vagy nyers credentialt. A worker service loop és a cloud API integráció ettől még nem igazolt Vercel/Atlas környezetben; az első end-to-end bizonyítékot kizárólag a helyi szintetikus acceptance futtatás adja.
