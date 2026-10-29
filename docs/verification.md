# Habi — ellenőrzési napló

## Check-in trend refresh and coach timeline wording · 2026-10-29

- Change: findings 1 and 4 of the entry below. `CheckinTrends` (`src/app/checkin-graphics.tsx`) now takes a new clock reading when the newest completion time of its check-ins changes (`latestCompletion` in `src/lib/workflows/checkin-chart.mjs`), so a check-in or answer saved in the same page session appears without a reload. On the coach timeline (`src/app/metro-timeline.tsx`) a saved answer is labelled “Beküldött napi válasz” and shows its question and answer instead of an undescribed “Naplóesemény”, and the result card says “A napi válaszok rögzítve.” rather than the second-person “válaszaid”.
- Automated: `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` with `HG_WORKER_BEARER_SHA256` from `.env.test.example` — 236 passed, 0 failed (two added tests cover the clock key and invalid timestamps). Without that variable, ten worker-claim tests fail with `DEPENDENCY_UNAVAILABLE`, with or without this change. `npm run lint`, `npm run typecheck`, `npm run build` and `git diff --check` passed.
- Browser acceptance on the production build, isolated database `habi_chart_test`, synthetic accounts only: the player opened Állapotjelzés with an empty trend (“nincs rögzített válasz”), answered question 1 and then 2 without reloading, and each answer and its newer timestamp appeared on the chart at once. After finishing all five answers the coach's Idővonal listed five described “Beküldött napi válasz” rows and “A napi válaszok rögzítve.”; neither “Naplóesemény” nor “válaszaid” appeared.
- Production: released as commit `b20e648752ea385350b2c59b80b4f334337dbe0a`; Vercel deployment `dpl_5yEJD3Uw1fQRbG5XwHC3zqg6s5Wx` (`habi-pja1xnilu-narimato.vercel.app`) is READY in `narimato/habi`, built from that commit and aliased to `habigoal.com`, `www.habigoal.com` and `habi.doneisbetter.com`. The canonical homepage references that deployment ID. `/`, `/admin`, `/api/health` and `/api/ready` returned 200; anonymous `/api/v1/me` and `/api/v1/timeline` returned 401; the Vercel error log for the deployment was empty. The repository has no `.github/workflows`, so no GitHub CI ran for this push (the last run was 2026-06-29); the local gate above is the only automated check.
- Not verified: the unfixed build was not re-run in this pass, so the before state rests on the two earlier reproductions recorded below. The owner's live SSO session was not exercised, and nothing was clicked in Production.
- Still open: findings 2 (unreproduced 500s) and 3 (decision record) below.

## Coach-wide oversight of player activity · 2026-10-29

- Change: coaches with access to a player see every participant's AI questions, replies, feedback, corrections and exclusions, plus operational activity, on the Idővonal and in a read-only transcript view; successful player-scoped commands append canonical `events` and actor-linked `audit` records in their own transaction (`src/lib/database/coach-activity.mjs`). API manifest `2.5.1`. Released as commit `0f627be28428a59857afdd928849dcc8ae23b5bb` (pushed to `main` on the owner's instruction; GitHub reported the branch-protection pull-request and “CI / web” rules as bypassed).
- Production: Vercel deployment `dpl_HbSSkqVLpFHBccmQv9jFLNsaSqav` (`habi-jpmsq47ei-narimato.vercel.app`) is READY in `narimato/habi`, built from that commit, aliased to `habigoal.com`, `www.habigoal.com` and `habi.doneisbetter.com`. The canonical homepage references that deployment ID. `/`, `/admin`, `/api/health` and `/api/ready` returned 200; anonymous `/api/v1/me`, `/api/v1/timeline` and the player `ai-coach` route returned 401; `www` redirects (308) to the apex. The served client chunk contains the read-only observer wording, and the deployment's error-level runtime log was empty shortly after release. No migration and no worker change were part of this release, so the worker was not restarted. No authenticated Production session was exercised.
- Automated: `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — 234 passed, 0 failed, 0 skipped. Worker `unittest` — 72 passed. `npm run lint`, `npm run typecheck`, `npm run build` and `git diff --check` passed.
- Browser acceptance on the production build (`next start`), isolated local database `habi_oversight_test`, synthetic accounts only; not a walkthrough of the owner's live SSO session. A synthetic player completed two check-ins and asked an AI question; the coach's Idővonal showed the check-in start/close, the daily answers, the AI question and the recorded-activity rows (draft saved, check-in saved, AI conversation saved). The coach opened the player's actual thread read-only: no message box, pending-answer progress visible.
- Isolation, checked over HTTP: the owner and both same-tenant coaches read the thread (200); a parent and a player of the other tenant get 404 and see no AI items on their timeline; a coach POST into the player's thread returns 404 and adds no turn, thread or job.
- Live refresh: a question created from a separate client appeared on the already-open coach timeline within about 16 s without a reload. At 375 px the timeline and the AI panel have no horizontal overflow.
- Fixed during this acceptance: the read-only view addressed the coach in the first person (“Üzeneted”, “A kérdésed mentve van”, “a saját edzői nézetedhez tartozik”). It now names the author (“Játékos üzenete”, “A kérdés mentve…”) and drops the own-view privacy line; the owner's own view is unchanged (checked in the browser). Files: `src/app/ai-coach.tsx`, `src/app/ai-answer-progress.tsx`.
- Not verified: no worker ran, so no AI answer was generated or displayed; plan decisions, reports, publications and unpublished coach material are covered by integration tests only, not walked in the browser; Hungarian answer quality is unchanged and still experimental.
- Found, not fixed (none is in this change set):
  1. Released since `ada3df7`: the check-in trend chart pins “now” when the page mounts (`src/app/checkin-graphics.tsx:141-143`), and `buildCheckinChart` drops records completed after it. A check-in completed in the same page session therefore shows “nincs rögzített válasz” until a reload. Reproduced twice.
  2. Two HTTP 500 `INTERNAL_ERROR` responses (`ai-coach.read`) hit the player's own thread polling in the first seconds after the very first question on a fresh database. Not reproduced afterwards: 120 sequential and 40 parallel HTTP reads, 240 cold-start reads on a second fresh database, 900 direct concurrent workflow reads; the Mongo log has no errors. The API boundary deliberately logs no exception text, so there is no stack. The panel keeps the thread and polls again.
  3. `contracts/decisions.json` D-HG-019 still says only an explicitly shared turn enters human review. Reading is not review, but the owner's oversight instruction is not recorded as its own decision; the file is hash-pinned, so it was left untouched.
  4. Cosmetic on the coach timeline: result cards say “A napi válaszaid rögzítve.” (second person) and each saved answer appears as an undescribed “Naplóesemény”.

## Hungarian AI-coach route connected · 2026-10-29

- Owner explicitly requested connecting `text_chat_hu` after its experimental quality status had been explained. Released commit `66a6380865d3702ebfcb23a562017c49e64586e5`; this also releases the previously saved message-history/memory changes and additive migration 019. The service remains experimental; connection is not a language-quality approval.
- Production deployment `dpl_Hc857uMBRXSLWUY5xwYbC6ZiBZqp` is Ready and the canonical homepage serves that deployment. `/api/health` and `/api/ready` returned 200; anonymous `/api/v1/me` returned 401.
- Worker production configuration uses `HG_SHARED_AI_DIALOGUE_TASK=text_chat_hu` and `HG_SHARED_AI_DIALOGUE_MODEL=auto`; test-purpose marking is unset for production. Restarted worker startup confirmed `dialogueTask=text_chat_hu`, `dialogueModel=auto`. General interpretation jobs continue to use `text_chat`.
- Validation: 229 application tests and 72 worker tests passed; lint, typecheck, production build and diff checks passed. Synthetic-provider browser acceptance passed for sending, corrections, original history, exclusion, reopening, cross-chat preferences and role isolation.
- A separate synthetic local-browser → real Hungarian API → worker completion → database → browser check passed and persisted an answer with model artifact `hf.co/unsloth/Qwen3-4B-Instruct-2507-GGUF:Q3_K_M`. This was synthetic local data, not a production user conversation. The returned wording still showed the model's relevance limitation; no broad support-quality pass is claimed.
- Scope: no production synthetic player records were created, no chatbot server policy was changed and no English model default was overridden. Rollback the coach route by setting the worker dialogue task to `text_chat` and restarting the worker. The additive database migration preserves existing documents.

## Check-in answer graphics and shared metro trends · 2026-10-27

- Restored the original answer-dependent battery, moon, focus bars, mood face, and training-load symbols to check-in result cards, latest-answer summaries, and history. The coach/parent Állapotjelzések screen now includes the same reusable metric trend view as the player's tools, with 14/28/42-day controls, exact answer labels, colored metro routes, and accessible timestamped answer lists. Multiple submissions on one day remain separate; missing answers or calendar days break the route. No score, average, or inferred evaluation is added.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, 176 passed, 0 failed, 0 skipped. Four added tests cover graphic-level mapping, timestamp order and same-day records, gaps, and invalid/old/future data. Lint, typecheck, production build, and diff check passed.
- Local Chromium verification used a synthetic coach session in the isolated `habi_graphics_test` database and synthetic intercepted check-in responses. Metric switching and period selection worked. Desktop (1440 px) and mobile (390 px) screenshots were inspected; the 390 px page had no horizontal overflow. The chart itself scrolls horizontally. No Production record was created during this browser check.
- Commit `ada3df7` is READY as Production deployment `dpl_Bkcqgycuh5RWfzBHDcgLt4wCsXAU`, aliased to `habigoal.com`. The canonical home page returned HTTP 200 with this deployment ID and the delivered client chunks contained the new graphics/metro view. Health and readiness returned HTTP 200. Authenticated Production visual interaction remains unverified. No migration is required; rollback is redeploying the preceding application release. Existing uncommitted worker changes were excluded.

## Review of the last five delivered commits · 2026-10-27

- Reviewed `afab153`, `cc87390`, `3ad06b2`, `b486c45`, and `c3d21c2`. The player-wide coach question logic had been applied to `createSharedPlan` instead of `askQuestion`: plans sent an empty source list and were rejected, while conversation questions still required a check-in and used only that check-in. Restored the plan's pinned source and applied player-wide context to coach questions. Parent questions retain explicit sources. The question handler also respects the existing busy state.
- Metro trend stations and connectors now inherit the metric line color; timestamp and answer text retain their own text colors.
- Added five tests that execute the actual workspace handlers with synthetic state and mocked HTTP. Four failed before the fixes; all five pass afterward. `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, 172 passed, 0 failed, 0 skipped. `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` — PASS.
- Verification used the local checkout and an isolated localhost replica-set database with synthetic data. Existing uncommitted shared-AI worker work was preserved and excluded from the release. The exact release archive also passed all 172 application tests, lint, and all 18 committed worker tests. No migration is required; rollback is reverting the workspace code changes.
- Production logs confirmed `plan.create` HTTP 400 `INVALID_INPUT` on the preceding deployment. Fix commit `3d857e9219d133c3400850d559d89bf6c7495737` is now READY as Vercel deployment `dpl_GoDBPiJTPM6SF2W8dm9K2uE6FLK6`. The canonical `habigoal.com/` and `/admin` both returned HTTP 200 with that deployment ID; `/api/health` and `/api/ready` returned HTTP 200. An authenticated Production plan submission remains unverified; reload the page to receive the corrected client.

## Játékosi állapotjelzések metróvonalas trendnézete · 2026-10-27

- A trendek már nem ferde vonalú általános grafikonként jelennek meg. Minden mérőszám saját, függőleges metróútvonalat kap: egyenes fővonal, a mérőszám színével jelölt 8 px-es állomások, rövid vízszintes csatlakozók, majd a tényleges rögzítési idő és válasz. A sorrend a mentett időbélyegeket követi; hiányzó napot, értéket vagy trendirányt nem talál ki.
- A 14/28/42 napos választás, a válaszonkénti megoszlás és a legutóbbi válasz időpontja megmarad. Az útvonal minden mérőszámhoz ugyanazt a `--metro-*` geometriát használja.
- `npm run lint` — PASS, exit 0; `npm run typecheck` — PASS, exit 0; `npm run build` — PASS, exit 0; `git diff --check` — PASS, exit 0. Környezet: helyi Habi checkout, Next.js 16.4.3. Nincs adatbázis-migráció vagy adattartalom-változás.
- Production: commit `b486c45fda8b7058107b6e3c84579c1c8824a2c6`, Vercel deployment `dpl_7rK4pCEAG699oYHxBA28pZEJ1wCW`, `READY`; a `https://habigoal.com/` HTTP 200-zal ezt a deploymentazonosítót szolgálja ki, az `/api/health` és `/api/ready` HTTP 200. A bejelentkezett böngészős vizuális ellenőrzés nem történt meg ebben a kiadásban. Visszaállítás az előző Production alkalmazásverzióra történik.

## Saját cél cseréje és visszaállítása · 2026-10-27

- A célcsere egyetlen, az aktív játékosi SSO-munkamenetben végrehajtott, idempotens naplóírás: az új célrekord a korábbi cél azonosítójára hivatkozik. Nem történik külön „régi cél lezárása” és „új cél létrehozása” kérés, tehát ezek között nincs részleges sikerállapot.
- A korábbi cél megmarad az idővonalon és a célok listájában, „Lecserélt saját cél” állapottal. A visszaállítási művelet az aktuális célt lecseréli a kiválasztott korábbi szöveget tartalmazó új verzióra; semelyik naplórekord nem törlődik vagy íródik felül.
- `node --test tests/goal-lineage.test.mjs` — PASS, 3/3; `npm test` — PASS, 146 pass / 0 fail / 1 Atlas-only skip; `npm run lint` — PASS, 208 fájl; `npm run typecheck` — PASS. Környezet: helyi szintetikus tesztek. A Production health/readiness 200, de ez nem hitelesített UI-írási bizonyíték.
- Hiba esetén az idempotens kérés újrapróbálható ugyanazzal a kulccsal; az alkalmazás újrapróbáláskor mindig a mentés eredményét kéri le. Rollback: az alkalmazáskód visszaállítása. A naplóban létrehozott célverziók megmaradnak; azokat nem töröljük automatikusan.

## Saját célok újranézési ciklusa · 2026-10-27

- A cél létrehozásakor választható 7, 14 vagy 28 napos újranézés, illetve a jelzés kikapcsolása. Visszatekintés mentésekor a ciklus újra beállítható. Az esedékes cél a játékos áttekintésén jelenik meg, amikor a Habi meg van nyitva; nincs push, e-mail vagy külső értesítés. Az új dátum célazonosítóhoz kötött naplóesemény, a régi cél- és naplóbejegyzéseket nem módosítja.
- `node --test tests/goal-review.test.mjs tests/goal-export.test.mjs` — PASS, exit 0; 6 passed, 0 failed.
- `npm test` — PASS, exit 0; 143 passed, 0 failed, 1 Atlas-only replica-set integration test skipped (no isolated Atlas test URI in this run).
- `npm run lint` — PASS, exit 0; Biome checked 206 files. `npm run typecheck` — PASS, exit 0. `npm run build` — PASS, exit 0. `git diff --check` — PASS, exit 0.
- Környezet: helyi Habi checkout, szintetikus tesztadatok; Production adatot vagy SSO-munkamenetet nem használtunk. A hitelesített böngészős mentés és a Production esedékességi jelzés még nincs ellenőrizve.
- Visszaállítás: korábbi Production release-re történő visszaállítás. Nincs külön migráció vagy Atlas-sémaváltozás.

## Saját cél exportja és tényszerű állapotjelzés-összegzés · 2026-10-27

- A játékos a saját céljánál szövegfájlt tölthet le. Alapból csak a cél szövege, állapota és létrehozási ideje kerül bele; külön jelöléssel a célhoz pontosan kapcsolt módosítások, állapotváltások és visszatekintések is hozzáadhatók. A fájl a böngészőben készül, az export nem ír vissza a szerverre.
- A játékosi grafikon minden mérőszámnál tényszerű összegzést mutat: a meglévő válaszok darabszámát válaszonként és az utolsó választ annak időpontjával. Nem állít javulást/romlást, nem számol átlagot vagy pontszámot, és nem pótolja a hiányzó napokat.
- A jelenlegi naplómodell nem kapcsol gyakorlási rekordot célhoz. Az ilyen rekordokat az export nem társítja önkényesen. Nincs adatmodell- vagy adatbázis-migráció.
- `node --test tests/goal-export.test.mjs` — PASS, 4/4; `npm run lint` — PASS, 194 fájl; `npm run typecheck` — PASS; `npm test` — PASS, 128 pass / 0 fail / 1 Atlas-only skip; `npm run build` — PASS; `git diff --check` — PASS. Környezet: helyi Habi build, szintetikus unit tesztek.
- A cél-exportot a `63a1939` Production deployment (`dpl_7scA22esJeQM7sNYxv12Vd6N81jp`) szolgálja ki. A tényszerű összegzés kódja a következő `main` Production builddel kerül ki; a push utáni deployment-azonosítót és route-ellenőrzést később rögzítjük. Visszaállítás alkalmazáskód rollbackkel; felhasználói adatot egyik funkció sem módosít.

## Idővonal nap szerinti szűrése · 2026-10-27

- Az **Előzmények** nézet napválasztója az eszköz helyi naptári napjának kezdetétől a következő helyi nap kezdetéig szűri az idővonalat, beleértve a nyári időszámítás napjait is. A check-in eredménylista, a naplórekordok és a metróvonal ugyanazt a napablakot használják; a **Teljes idővonal** törli a szűrést. A lapozási kurzor aláírt, és nem használható másik napablakkal.
- A `GET /api/v1/timeline` és a játékosi check-in eredménylista opcionális `from`/`to` időhatárokat fogad. A timeline a kérést a snapshot idejénél nem engedi későbbre olvasni. A dátummező nem kér és nem tárol külön időzóna-beállítást.
- `npm test` — PASS, 119 pass / 0 fail / 1 skipped (izolált Atlas replica-set integration URI nélkül); `npm run lint` — PASS, 188 fájl; `npm run typecheck` — PASS; `npm run build` — PASS; `git diff --check` — PASS.
- `set -a; source .env.test.example; set +a; npm run test:workflow:local` — BLOCKED, exit 1 az edzői PDF vírusvizsgálatánál: a szintetikus feltöltés 60 másodperc után is `pending` állapotban maradt, így a ClamAV worker végponttól végpontig nem volt elérhető ebben a környezetben. A szintetikus tesztadatbázis migrációja és seedelése lefutott; Production adatot nem érintett.
- A napválasztó Production kiadása: commit `3a996de09d85d3ca159bf70c37e6b5f762bed3dc`, Vercel deployment `dpl_FrcNHxA2YvHYefX31whfjH6NuXog`, `READY`, a `narimato/habi` Production projektben. `habigoal.com/`, `/admin`, `/api/health` és `/api/ready` HTTP 200; `/legacy` HTTP 307 a `/?view=legacy` natív munkaterületre, amely HTTP 200; névtelen `/api/v1/timeline` HTTP 401-et ad, ahogy a védett API-nak kell. Bejelentkezett böngészős ellenőrzés még hátravan.
- A napi összefoglaló kártya fejlesztése ehhez a naplóbejegyzéshez még nincs kiadva. Nincs adatbázis-migráció; visszaállítás a kód visszavonásával vagy előző Production deploymentre rollbackkel történik. A megőrzött eseményadatokat ez a változás nem módosítja.

## Mobil munkaterület-fejléc és műveleti visszajelzés · 2026-10-26

- A fejléctördelés keskeny nézetben most külön sorba rendezi a szerepkör-váltót; szélesebb nézetben a cím, a szerepkör és a kilépés gomb külön rácsoszlopot kap. Így a fejléc elemei nem fedik egymást.
- A sikeres műveleti üzenet korábban egyszerre jelent meg a fejléc piros hibaállapotában és az oldal kék állapotjelzésében. A fejlécből eltávolítottuk a másolatot; az oldal egyszer, szemantikai állapotával egyező színben jeleníti meg a sikert vagy hibát.
- `npm run lint` — PASS, exit 0; `npm run typecheck` — PASS, exit 0; `npm test` — PASS, 115 pass / 0 fail / 1 skip (Atlas replica-set próba kihagyva, mert nem volt izolált URI); `npm run build` — PASS, exit 0; `git diff --check` — PASS, exit 0.
- A javítást a `226ed49` commitból a `dpl_23pDjdriYkpJbfCkYgEMQdV6JZnp` READY Production deployment szolgálja ki. `habigoal.com` `/`, `/legacy`, `/admin`, `/api/health` és `/api/ready` útvonalai HTTP 200-at adtak; a gyökéroldal HTML-je az új deploymentazonosítót tartalmazta. A bejelentkezett SSO-munkamenetű vizuális ellenőrzés még hátravan, mert az ellenőrző böngésző kijelentkezett. Visszaállítás az előző Production deploymentre rollbackkel lehetséges; adatbázist ez a felületjavítás nem módosít.

## Szerepköri munkaterület és edzői felmérés éles kiadása · 2026-10-26

- Commit: `c7c706a` (`Implement Habi role workspace and coach report flow`), `main`; a GitHubra sikeresen feltolva.
- Vercel: a `narimato/habi` projekt Production deploymentje `dpl_AwA6kVqxx1BHs3vSUVPrCBZNBfd1`, állapota `READY`, a commit SHA `c7c706a8e6451b328c8404cd3dadf1d55b1b7f7a`.
- A projekt igazolt éles domainjei: `https://habigoal.com`, `https://www.habigoal.com`, `https://habi.doneisbetter.com`. A `habigoal.com` `/`, `/legacy` és `/admin` útvonalai HTTP 200-at adtak. A `/api/health` és `/api/ready` HTTP 200; névtelen `/api/v1/me` HTTP 401 `AUTHENTICATION_REQUIRED` választ adott, ami a védett API elvárt viselkedése.
- Az éles hostot a `/admin` HTML `data-dpl-id` értéke is az új deploymenthez (`dpl_AwA6kVqxx1BHs3vSUVPrCBZNBfd1`) kötötte. Ez azonosítja a kiszolgált buildet; nem helyettesíti a bejelentkezett böngészős vizuális átvételt.
- A lokális szintetikus HTTP → Atlas-test replica → helyi worker elfogadási folyamat lefedte az edzői PDF feltöltést, ClamAV vizsgálatot, kézzel rögzített mezők jóváhagyását, majd az ellenőrzött extractionre hivatkozó helyi AI-értelmezést. A teljes parancs eredménye PASS; további lint, typecheck, unit suite és production build eredményét fent rögzítettük.
- Ismert korlát: éles SSO-val bejelentkezett böngészőben nem végeztünk műveletet, és nem töltöttünk fel valódi sportolói felmérést. A személyes SSO/UI és valódi adatokkal végzett folyamat éles tesztje ezért nincs igazolva. Visszaállítás az előző, READY Habi production deploymentre történő Vercel rollbackkel lehetséges; adatbázis-sémát ez a kiadás nem módosított.

## Habigoal munkaterületek és edzői felmérés → helyi AI · 2026-10-26

- A `/` munkaterület most az elfogadott wireframe szerkezetének szerepköri nézeteit szolgálja ki: Áttekintés, Napló, Állapotjelzés, Beszélgetések, Idővonal, Riportok és tervek, Felmérések és Tudástár. A képernyők a Habi jogosultság-ellenőrzött API-jait és a kiválasztott játékos valós adatait használják; a prototípus fiktív Dani adatai nem kerülnek át.
- Az edzői Felmérések nézeten végigjárható a PDF feltöltés → ClamAV vizsgálat → kézi mező/oldal/nyers érték rögzítése → coach review → jóváhagyott extractionből forrásolt helyi AI-értelmezés. A UI a job állapotát lekérdezi; hálózati megszakításnál vár, és visszakapcsolódás után folytatja a lekérdezést.
- `npm run lint` — PASS, exit 0; `npm run typecheck` — PASS, exit 0; `npm test` — PASS, 115 pass / 0 fail / 1 skip (az izolált Mongo replica-set integration kihagyva, mert ebben a parancsfutásban nem volt `HABI_TEST_MONGODB_URI`); `npm run build` — PASS, exit 0; `git diff --check` — PASS, exit 0.
- `set -a; source .env.test.example; set +a; npm run test:workflow:local` — PASS, exit 0. Environment: localhost Next.js 16.4.3, szintetikus `habi_workflow_test` Mongo replica set, helyi Qwen 2.5 7B worker és ClamAV; Production Atlas/SSO-adatot nem használt. A folyamat ellenőrizte a jelentés biztonsági vizsgálatát, coach által bevitt mezők jóváhagyását, a jóváhagyott extractionre hivatkozó coach értelmezési kérés API → worker → eredmény útját, valamint a többi check-in, role visibility, plan, publication, feedback, follow-up és tenant isolation acceptance lépést.
- Környezetbeli korlát: ez lokális szintetikus acceptance, nem bizonyítja az új felület éles böngészős vizuális vagy Vercel Production működését. A változás nem módosít adatbázis-sémát; rollbackhez az app és a acceptance script előző commitra állítható. Éles kiadás után még szükséges a bejelentkezett coach munkamenetben a kérdőívfeltöltés és szerepköri képernyők kézi vizuális ellenőrzése.

## Coach player scope, save error and metro history · 2026-10-26

- Production request logs showed coach `record.create` and `checkin.results.list` requests returning `404 NOT_FOUND` for a value copied from the coach actor ID. The workspace had substituted the coach's own ID when the coach membership correctly had no single `playerId`; that ID is not a player record.
- The workspace now loads the authenticated, tenant-scoped player roster from `GET /api/v1/players`, requires an explicit selected player, and shows the selected player's display name when supplied or the exact player ID when no name exists. It no longer converts a missing player association into the coach's actor ID.
- Coach check-in history reads now use the tenant coach role against an existing player, while player and parent requests remain restricted to their session player. Coach observation writes validate the active tenant-level coach membership and target player existence; they no longer require a fabricated coach-to-player membership.
- Replaced the plain history list with accessible expandable metro stations: a continuous line, role-colored branches, centered desktop line, left rail on small screens, and keyboard-operable station summaries. No player name is inferred from SSO identity or email.
- Local checks: `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed. A live authenticated save and visual browser review are still needed after deployment.

## Canonical host and signed-in workspace · 2026-10-26

- Root cause: Habi session cookies use the secure `__Host-` prefix and are scoped to the host that issued them. Opening the app on a Vercel deployment URL or a legacy alias therefore showed the workspace shell while API requests such as `/api/v1/me` had no Habi session and returned `401 AUTHENTICATION_REQUIRED`.
- Fix: Next.js Proxy redirects all non-local, noncanonical hosts to `https://habigoal.com`, preserving the requested path and query. The redirect destination is fixed in code; incoming host values are never used to construct it. Localhost remains usable for development.
- Verification: `npm run lint` passed; `npm test` passed (114 passed, 1 skipped); `npm run typecheck` passed; `npm run build` passed; `git diff --check` passed. The dedicated cases cover canonical/local host pass-through, alias and Vercel hostname redirects, OAuth callback query preservation, malformed paths, and untrusted host input.
- Production: commit `5995fbc` is deployed as `dpl_7mUfDVmYXH3FzsL4AeQjGGJQUpoW` (Ready), aliased to `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. Live `HEAD` requests to both the deployment URL and `habi.doneisbetter.com` returned HTTP 308 to `https://habigoal.com/api/v1/me?probe=host`, preserving path and query.
- Recovery: open or refresh `https://habigoal.com`. If the browser only has a session cookie on a different host, sign in once on the canonical domain; the browser cannot send another host’s host-only cookie.

## Check-in wizard restoration and production save bug · 2026-10-26

- Production check-in UI had drifted from the approved interaction: the role workspace rendered all seven legacy questions in a two-column grid. Restored the start card and one-question-at-a-time progress/skip/back flow, using only the five canonical metrics in `contracts/instrument.json`.
- Production runtime logs showed `checkin.answer.create` returning `409 REVISION_CONFLICT` on later answers. The UI incorrectly copied the answer record's revision into `expectedRevision`; the API's session revision advances separately. The client now increments its expected session revision after every successful answer and displays a clear conflict message if a stale write still occurs.
- Code-fix Production deployment: `dpl_8QkZPBUhbmK7CcugLSuofXQEgVty`, commit `8363e7f`, READY, aliased to `habigoal.com`. `/` returned HTTP 200 after deployment. No database migration or administrative data write was made.
- Local validation: `npm run lint`, `npm run typecheck`, `npm test` (110 passed, 1 skipped), `npm run build`, and `git diff --check` all passed. The workflow logic tests cover accepted answer revisions and stale revision rejection; the previous production runtime logs supplied the failing sequence.
- Remaining live check: sign in and complete a partial or full check-in in the browser, then confirm it appears in the journal. Rollback is the preceding Vercel Production deployment; no schema or persisted record rollback is needed.

## SSO browser MVP production release and runtime logging · 2026-10-26

- Production deployment `dpl_6i4T3VvT6Rz8TR6KyD7qw22hML7E` from commit `887fd9d` is Ready and aliased to `www.habigoal.com`, `habigoal.com`, and `habi.doneisbetter.com`.
- Live smoke checks from the Habi workspace: `/` → 200; `/api/health` → 200; `/api/ready` → 200 (Atlas readiness); signed-out `/api/app` → 401 with only `AUTHENTICATION_REQUIRED`; `/auth/login?returnTo=%2F` → 302 to DoneIsBetter SSO with browser-bound state and PKCE parameters. Environment: production HTTPS. No production user records were written.
- The apex OAuth callback redirect preserves `/api/oauth/callback` and its query string when forwarding to `www`. This checks URL routing only; a real SSO callback/session, authenticated save/reload/logout, and verified transfer of existing records still require the owner’s live browser session and legacy cookie.
- The Vercel runtime log query for this deployment returned no error/fatal events in the smoke-check window. Expected handled 4xx errors now use informational-level diagnostics; 5xx and fail-closed dependency failures remain error-level. The check confirms current deployment behavior, not future availability.
- Validation before release: `npm run lint` exit 0 (155 files); `npm run typecheck` exit 0; `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` exit 0 (112/112, 0 skipped); `npm run build` exit 0; `git diff --check` exit 0. The change was committed as `887fd9d` and pushed to `origin/main`.
- Runtime log improvement is code-only and has no database/data rollback effect. To revert it, restore the prior logging behavior in `src/lib/api/route-boundary.mjs` and deploy; expected 4xx events would again be classified as errors by the default logger.

## SSO-only browser MVP and verified legacy transfer · 2026-10-26

- Implemented in the Habi worktree: `/auth/login`, `/api/oauth/callback`, owner session/logout, SSO-only `/api/app`, and one-use legacy handoff. Existing records link only when the legacy browser cookie is verified on `habi.doneisbetter.com`, the handoff is bound on canonical Habi, and DoneIsBetter verifies identity plus Habi permission. No email matching is used.
- Local verification: `npm run lint` — exit 0; `npm run typecheck` — exit 0; `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — exit 0, 112/112 pass, 0 skipped; `npm run build` — exit 0 with routes `/api/auth/legacy-handoff`, `/api/auth/legacy-handoff/accept`, and `/api/oauth/callback`; `git diff --check` — exit 0. Environment: local Habi worktree, isolated MongoDB replica set.
- Vercel Production settings verified by key without printing values: SSO browser mode, production environment, `https://www.habigoal.com` app origin, `https://habi.doneisbetter.com` transfer origin, database `habi`, disabled external AI, synthetic-only false, and the exact registered callback. SSO client secret and session HMAC are stored as sensitive Vercel variables. Existing `HG_ATLAS_URI` was preserved.
- Migration 010 applied to the existing Production `habi` database and recorded in `_habi_migrations`. The four auth/owner-control collections and required indexes are present. `habi_states` stayed at 37 documents and `habi_content` at 1 before and after. No user record contents were read or changed.
- Verified Vercel domain metadata: `habigoal.com` (308 to `www.habigoal.com`) and `www.habigoal.com` are assigned to `narimato/habi`; `habi.doneisbetter.com` remains on the same project for legacy-cookie handoff.
- Still unverified: the new Production deployment, HTTP callback relay through the apex redirect, a real browser SSO login, `/api/app` save/reload/logout under that SSO session, and transfer by a real legacy cookie. The code is not delivered as a live SSO experience until those are proven.

## Interaktív browser-owned MVP felület · 2026-10-26

- A gyökérútvonal új Habi felületet szolgál ki: napi állapotjelzés, korábbi állapotjelzések és öt verziózott gyakorlat. A napi jelzés a meglévő `/api/app` route-on keresztül, revision-ellenőrzéssel menti az adatot a jelenlegi böngésző-tulajdonoshoz.
- Helyi szintetikus végponttól végpontig próba: Chrome-ban a hét kérdés megválaszolása után `GET /api/app` → `PUT /api/app` mentés sikeres; a Napló mutatta mind a hét rögzített választ; frissítés után az aznapi bejegyzés újra betöltődött. A próba a már futó, izolált localhost `habiTestRs` teszt replica setben mentett; Production adatot nem írt.
- `npm test`: PASS, 90/91; 1 meglévő Atlas-integrációs próba kihagyva, `0` fail. `npm run lint`: PASS, Biome 148 fájl. `npm run typecheck`: PASS. `npm run build`: PASS, Next.js 16.4.3. `git diff --check`: PASS.
- Korlátok: másik eszköz/böngésző nem kap hozzáférést SSO nélkül; player/parent/coach workflow, Mac AI-worker, teljes régi HABI funkciókészlet és személyes pilot nincs ebben az MVP-ben. A kliens megmutatja és megőrzi a böngészői dirty állapotot; szinkronütközésnél frissítést kér, nem próbálja automatikusan felülírni a szerver rekordját.
- Production: `dpl_2MSrz9Vt9pdx1VaTHeJqrWeuHGG8` (`READY`, `https://habi-7ykv8yrad-narimato.vercel.app`) és a Git-integrációs build `dpl_FViqWRELAafghhU2PamK7kSmncL3` (`READY`), mindkettő a `b5cf47d` forrásból; a `habi.doneisbetter.com` alias aktív.
- Élő ellenőrzés: `GET /` → 200, UTF-8 HTML; `GET /api/health` → 200. A Chrome-ban hidratálás után az új „Ma / Napló / Gyakorlatok” felület jelent meg; `/api/app` betöltése sikeres, a teszt Chrome-profilban 0 korábbi bejegyzés látszik. Ez a profil nem tartalmazta a tulajdonos korábbi böngésző-cookie-ját, ezért a másik eszköz/böngésző adatai nem kerültek elő. Production rekordot nem írtunk.
- Vercel build: Next.js 16.4.3 sikeresen fordította a kliensfelületet és az API route-okat; `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` és `git diff --check` mind PASS. A teszt-suite 90/91 pass, 0 fail; az egy kihagyás a meglévő Atlas-integrációs próba izolált Mongo URI nélkül.
- Visszaállítás: a Vercel korábbi Production deploymentjének visszaállítása. A browser-owner adatmodell nem változott, migráció nem futott.

## Élő MVP ellenőrzés · 2026-10-26

- `main` és `origin/main`: `3ddbbf3 Clarify Habi production MVP status` (az UI bevezető commitja: `b417686`, helyi adat fallback: `962f674`).
- Vercel Production deployment: `dpl_6yhyapMfEZGNc8XMYXRGK6DUpyXJ`, állapot `Ready`, alias: `https://habi.doneisbetter.com`.
- Production build: `npm run build` — PASS; Vercel Production deployment state `Ready`.
- Élő, böngészőben ellenőrzött UI: `/` új Habi kezdőképernyőt jelenít meg (nem irányít át); `/api/health` → 200; `/api/ready` → 200; `/api/app` → 200; `/api/v1/me` → 503, a szerepkörös API-k az MVP-ben szándékosan fail-closed állapotban maradnak.
- Az ellenőrző Chrome-profilban a kezdőképernyő üres állapotot mutatott: ehhez a profilhoz nem talált mentett Habi-adatot sem az API, sem a helyi böngészőtár. Ez nem igazolja, hogy más eszköz vagy más böngésző-cookie rekordjai betöltődnek. Az élő ellenőrzés nem írt felhasználói rekordot; a korábbi `habi_states` formátum, cookie-hash tulajdonoskulcs és tartalomgyűjtemény migráció nélkül marad.
- A `codex/habi-ground-up` Preview deployment a vizsgálat idején `QUEUED` állapotban maradt, ezért hosted Preview adatírási teszt nem futott. A Production változtatás a tulajdonos korábbi, kifejezett `main`/Production utasítására került ki; Preview hiánya kockázati megjegyzés, nem sikeres Preview bizonyíték.
- Visszaállítás: a Vercel projekt korábbi Production deploymentjének aliasra történő visszaállítása. Az adatbázison nem történt migráció, törlés vagy tesztírás.

## Új Habi kezdőképernyő · 2026-10-26

- A `b417686` a `/` útvonalat az új Habi Next.js kezdőképernyőre állítja; többé nem irányít át a régi kliensre. A meglévő napló továbbra is elérhető a `Megnyitom a naplómat` hivatkozással.
- A kezdőképernyő a `/api/app` meglévő browser-owner munkamenetét olvassa, és csak mentett állapotjelzések, feladatok, beszélgetések darabszámát és a legutóbbi dátumot mutatja. Üres adatoknál üres állapotot jelenít meg, nem készít mintaadatot.
- Ha a távoli API nem érhető el, vagy a korábbi kliens `habi-cloud-dirty=1` jelzővel nem szinkronizált helyi változást jelez, a felület a `habi-app-v1` böngészőbeli állapotot használja; ezt az állapotot külön jelöli. A kezdőlap nem ír adatot.
- Éles böngésző ellenőrzés: a Habi címen a gyökérképernyő magyar címsorral és napló összesítővel jelenik meg; `/api/app` 200. A Habi szerepkörös végpontjai továbbra is fail-closed állapotban vannak, a teljes új player/parent/coach munkafolyamat UI-ja nincs ebben az MVP-ben.

## API UTF-8 javítás · 2026-10-26

- A `/api/app` korábban `application/json` Content-Type-ot küldött charset paraméter nélkül; egyes közvetlen mobilböngészős megjelenítések UTF-8 helyett egybájtos kódolással dekódolták az ékezeteket.
- A katalógus forrása UTF-8, az API válasza UTF-8-ként dekódolva helyes magyar karaktereket tartalmazott. A javítás explicit `Content-Type: application/json; charset=utf-8` fejlécet ad a sikeres és alkalmazásszintű hibaválaszhoz.
- A `ec3afa0` javítás Productionbe került. Élő ellenőrzés: HTTP 200, `Content-Type: application/json; charset=utf-8`; UTF-8 dekódolással a `Válassz egyetlen, gyakorolható célt` szöveg helyes, a `VÃ¡lassz` mojibake-szöveg hiányzik.

## Aktuális ágállapot · 2026-10-25

A jelenlegi, módosított API-kontraktus verziója 2.4.8. A T-HG-130 alatti végrehajtás a korábbi 2.4.1 verzióra vonatkozott.

### Friss helyi szintetikus ellenőrzés

| Parancs / próba                                                            | Eredmény                                                     | Környezet és korlát                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set -a; source .env.test.example; set +a; npm test`                       | PASS, 95/95, 0 skip                                          | Helyi MongoDB replica set; API/domain/auth/kontraktus, unconfigured Preview fail-closed és Mongo-perzisztencia tesztek. A Mongo gyermektesztek egyedi, eldobható `_test` adatbázist használtak.                                                                                                                                                                                                                            |
| `npm run test:workflow:local`                                              | PASS, exit 0                                                 | Localhost-only Mongo replica set, 001–009 migrációk és szintetikus seed; check-in/snapshot, versioned player practice feedback, parent + coach observations, source-grounded question → Mac worker → result and reloadable thread history, PDF quarantine/ClamAV scan, manual extraction review, coach material publication, plan acceptance/follow-up, cursor paging, write denial, role visibility and cross-tenant 404. |
| `npm run lint`; `npm run typecheck`; `git diff --check`                    | PASS, 0 warning/error                                        | Habi worktree; Biome 140 source/test files.                                                                                                                                                                                                                                                                                                                                                                                |
| `npm run build`; `npm run start:test`                                      | PASS                                                         | Next.js 16.4.3 production build runs locally on loopback with synthetic-only config; no hosted/Atlas data used.                                                                                                                                                                                                                                                                                                            |
| Worker: `uv run python -m unittest discover -s tests -v`                   | PASS, 16/16                                                  | Local Python worker config, host lock and pinned local model/prompt checks.                                                                                                                                                                                                                                                                                                                                                |
| Mac worker service + helyi Ollama                                          | PASS, a job `succeeded`; modellválasz `no_evidence`, 0 claim | A szintetikus rekordhoz nem állt rendelkezésre megalapozott állítás; a worker nem fabrikált következtetést. Ez a job-pipeline működését igazolja, a válasz szakmai minőségét nem.                                                                                                                                                                                                                                          |
| Böngésző, `http://127.0.0.1:3000`                                          | PASS, synthetic player + parent workflow                     | A játékos megnyitotta a migrált, öt elemű gyakorlatkönyvtárat, visszajelzést mentett, majd újratöltés után a feljegyzés visszaállt. A szülő újratöltés után látta a másik jogosult szülő beszélgetését.                                                                                                                                                                                                                    |
| Reszponzív és billentyűzetes UI                                            | PASS                                                         | 360/390/430/768/1024/1440 px szélesség; nincs vízszintes túlcsordulás, a vizsgált interaktív célok legalább 44 px magasak, Tab-fókusz 3 px-es látható körvonalat ad. Fizikai eszközteszt és 200%-os szövegnagyítás még hátravan.                                                                                                                                                                                           |
| Vercel Preview `https://habi-git-codex-habi-ground-up-narimato.vercel.app` | Deployment Ready; Atlas ping PASS                            | A `707cbca` deployment `/` 200, `/api/health` 200, `/api/ready` 200; ez bizonyítja az Atlas-kapcsolatot a Preview deploymentből. `/api/v1/me` 503 `DEPENDENCY_UNAVAILABLE`, mert `HG_ENVIRONMENT` és SSO runtime-konfiguráció hiányzik; termék API-k ezért fail-closed állapotúak. Hosted role workflow nem igazolt. `habi.doneisbetter.com` továbbra is a régi Production deploymentet szolgálja ki.                      |
| Kérdés API szerződésfix                                                    | PASS reprodukcióval                                          | Javítva a Job dokumentumból hiányzó `uploadId`, a csak Jobba beszivárgó `threadId`, a worker aktív játékosi státuszra vonatkozó hibás feltételezése, valamint az Interpretationből hiányzó `turnRevision`.                                                                                                                                                                                                                 |

A szintetikus Mongo-adatbázis a teszt előtt újraépült; user adatot nem használt. A régi, 2026-10-25-i korábbi bejegyzések a korábbi scope-ra vonatkozó történeti bizonyítékok. A régi HABI-képességek teljes migrációját a `docs/legacy-feature-migration.md` rögzíti; az ott hiányzóként jelölt funkciók még nem teljesültek.

A T-HG-130 és T-HG-131 alatti további régi bejegyzések az akkori állapot történeti bizonyítékai. Az alábbi friss ellenőrzési táblázat a jelenlegi, módosított worktree-re vonatkozik.

## MongoDB-kapcsolat konfigurálása · 2026-10-26

- A Vercel `habi_mongodb_uri` Development értékét nem írtuk ki; ideiglenes, `0600` fájlból olvastuk be és töröljük a próba végén.
- A Habi-fiók kapcsolata MongoDB-hez sikeres volt (`ping`). A korábbi, csak olvasási felderítés szerint a `habi_preview` üres; a jelenlegi Production adatbázis `habi`, 37 `habi_states` és egy `habi_content` dokumentummal. Csak gyűjteményneveket, hozzávetőleges dokumentumszámot és mezőtípusokat olvastunk; adatot nem írtunk, migrációt vagy seedet nem futtattunk.
- A `narimato/habi` Preview, `codex/habi-ground-up` branch: `HG_ATLAS_URI` titkos env és `HG_ATLAS_DATABASE=habi_preview`. A Production env: `HG_ATLAS_URI` titkos env és `HG_ATLAS_DATABASE=habi` (2026-10-26 frissítve a tulajdonos MVP-adatcélja szerint). A régi `habi_mongodb_uri` változó változatlan.
- A `707cbca` commit új Preview deploymentje felvette az env-változókat; `/api/ready` 200 igazolja a hosted Atlas pinget. A `/api/v1/me` 503 azért marad, mert a teljes runtime konfigurációból hiányzik a `HG_ENVIRONMENT` és a DoneIsBetter SSO-konfiguráció; production vágás nem történt.

### MVP-adatkompatibilitás és élő állapot · 2026-10-26

- A termelési MongoDB-cél `habi`; az új MVP browser-owner compatibility route kódja be van állítva, de a legutóbbi main/production release váltás még nem történt meg. `https://habi.doneisbetter.com` a branch Preview ellenőrzéséig továbbra is a régi Production deploymentet szolgálja ki.
- A compatibility route az eredeti `habi_states` és `habi_content` adatokat használja; nincs tenant/actor import vagy Production migration.
- A production SSO nélküli MVP indulását a validált `HG_MVP_MODE=legacy-browser` konfiguráció engedélyezi. Az új több-szereplős API-k továbbra is fail-closed; csak a régi browser-owned adatút és readiness engedélyezett.

## Browser-owner MVP integráció · 2026-10-26

**Felhasználói folyamat:** a `habi.doneisbetter.com/` belépő az eredeti Habi kliensre vezet → a kliens `GET /api/app` hívással betölti a katalógust és az adott HttpOnly browser-cookie hash-éhez tartozó állapotot → ugyanazon az API-n, revision-feltétellel ment → újratöltéskor ugyanaz a cookie ugyanazt az állapotot olvassa vissza.

| Próba                            | Eredmény                                                                                                                                                     | Környezet                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `npm test`                       | PASS, 90/91; 1 meglévő Atlas-integrációs próba kihagyva                                                                                                      | Unit, domain, API boundary, browser-owner state, config és legacy static asset checks. Nincs hosted user data. |
| `npm run lint`                   | PASS, 146 fájl, hiba nélkül                                                                                                                                  | Habi repo                                                                                                      |
| `npm run typecheck`              | PASS, exit 0                                                                                                                                                 | Habi repo                                                                                                      |
| `npm run build`                  | PASS, Next.js 16.4.3                                                                                                                                         | Local production build                                                                                         |
| Browser → API → Mongo round-trip | PASS: root 307 `/legacy/index.html`-re; static UI 200; GET katalógust és session cookie-t adott; PUT után GET ugyanazt a revision-1 payloadot olvasta vissza | Helyi `habi_legacy_mvp_test` DB a localhost Mongo replica seten; csak szintetikus tesztpayload                 |
| Stale revision write             | PASS, HTTP 409                                                                                                                                               | Ugyanaz a lokális tesztadatbázis                                                                               |
| Cross-origin write               | PASS, HTTP 403                                                                                                                                               | `Origin: https://attacker.example`, az állapotot nem írta át                                                   |
| Multi-role API                   | PASS, localhost válasz 401; hosted MVP boundary teszt 503-at igazol                                                                                          | Teszt identity nincs; Production/Preview role-végpontok tiltva maradnak                                        |
| Mintatörténet-generálás          | PASS, eltávolítva az automatikus `seedSampleHistory()` hívás és függvény                                                                                     | MVP nem gyárt hiányzó napi rekordot                                                                            |

Az új Habi Production környezeti változói (`HG_MVP_MODE=legacy-browser`, origin, külső AI tiltás, synthetic=false, Atlas database=`habi`) és a Preview megfelelője (`habi_preview`) be vannak állítva, de az aktuális deployment még nem tartalmazza az MVP-integrációs commitot. A `habi.doneisbetter.com` jelenleg továbbra is az előző production release-t szolgálja ki. A cutover előtt az új Preview deploymenten újra végig kell futtatni a hosted read/write/reload és cross-origin denied próbát; utána mehet a felhasználó által kért `main`/Production release.

## T-HG-131 · Nem-SSO szerepköri munkafolyamat · történeti induló állapot · 2026-10-25

API-kontraktus 2.4.8. A munkafában szerepelnek szerepköri terv/utánkövetés, kérdés/thread/job, idővonal, coach-anyag verziózás/publikálás, PDF chunk-feltöltés, GridFS karantén, report-scan job, extraction mező-review és helyi Mac worker folyamat. A claim body-hashhez kötött, lease tokenje szerveroldali verifierből származik, a worker fence-et és heartbeatet használ. A worker kontextus a kanonikus schema ellenőrzésén megy át, a jelentés csak sikeres ClamAV clean verdict után válik olvashatóvá.

| Ellenőrzés                             | Állapot                                  | Megjegyzés                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kód / API / migráció / szerződés       | Implementálva                            | Új migráció 009; API-, domain- és response manifest frissítve.                                                                                                                                                                                                                                                                                                                                                                                           |
| Helyi Mongo/HTTP acceptance            | PASS a friss, szintetikus workflow-ra    | A napló tetején felsorolt teljes helyi role workflow, worker, report scan/review, plan/material és thread-history ellenőrzés.                                                                                                                                                                                                                                                                                                                            |
| Mac worker + Ollama                    | Kérdés-job round-trip igazolt            | A worker `no_evidence` eredményt adott a synthetic fixture-re; ez biztonságos elutasítás, nem modellminőségi bizonyíték.                                                                                                                                                                                                                                                                                                                                 |
| ClamAV                                 | PASS a szintetikus report acceptance-ben | ClamAV 1.5.4; `freshclam` letöltötte és validálta az adatbázisokat (daily 28164, main 63, bytecode 339). A worker 48 óránál régebbi vagy hiányzó signature DB mellett nem ad tiszta verdictet. A korábbi `ERROR: NULL X509 store` frissítési üzenet mellett a letöltött adatbázisok tesztje sikeres volt; az upstream [macOS Homebrew issue](https://github.com/Cisco-Talos/clamav/issues/1421) hasonló, sikeres frissítés melletti üzenetet dokumentál. |
| SSO / Vercel / Atlas / személyes pilot | Későbbi fázis                            | SSO, hosted secrets/DB, consent/retention és személyes pilot nincs ebben a lokális acceptance scope-ban.                                                                                                                                                                                                                                                                                                                                                 |

**A jelenlegi worktree még nem production/release-ready.** A friss localhost acceptance lefedi az első tartós role workflow-t. Az örökölt HABI-funkciók nagy része még nincs átültetve (lásd `docs/legacy-feature-migration.md`); SSO, elkülönített hosted adatbázis/env, consent/retention jóváhagyás, preview verification és domain-cutover még hiányoznak. A régi `main` mentés változatlan; rollback a korábbi deploymentre/domainre visszaállás, Mongo-migráció esetén csak előre javító migráció használható.

## T-HG-130 · Szintetikus szerepköri workflow tesztkész állapot · 2026-10-25

| Parancs / próba                                            | Eredmény              | Környezet és korlát                                                                                                                        |
| ---------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `set -a; source .env.test.example; set +a; npm test`       | PASS, 93/93, 0 skip   | Lokális Mongo replica set; contract, auth, persistence, race/idempotency és domain esetek.                                                 |
| `npm run test:workflow:local`                              | PASS, exit 0          | Szintetikus tesztadatbázis-visszaállítás → 001–004 migráció → szintetikus seed (2 tenant, 6 identitás) → HTTP-folyamat.                    |
| `npm run db:test:start && npm run db:test:stop`            | PASS, exit 0          | A helyi MongoDB 8.0.24 replica elindult, majd admin shutdown paranccsal tisztán leállt; a tesztadatfájlok az ideiglenes mappában maradtak. |
| `npm run lint`                                             | PASS, exit 0          | Biome, 84 source/test file; no warning/error.                                                                                              |
| `npm run typecheck`                                        | PASS, exit 0          | TypeScript, exit 0.                                                                                                                        |
| `set -a; source .env.test.example; set +a; npm run build`  | PASS, exit 0          | Next.js 16.4.3; every API route is dynamic; no build-time error output.                                                                    |
| `worker`: `uv run python -m unittest discover -s tests -v` | PASS, 16/16           | Local Mac worker config, lock and model contract tests.                                                                                    |
| `worker`: `verify-local` + `smoke-local`                   | PASS                  | Ollama 0.40.3, `qwen2.5:7b`, pinned digest/prompt; synthetic inference only.                                                               |
| Browser at `http://127.0.0.1:3000`                         | PASS, visual/AX smoke | Hungarian synthetic workspace rendered; synthetic player session and daily check-in start controls worked; logout revoked the session.     |

A helyi szintetikus HTTP-folyamat ellenőrzi a játékos bejelentkezését, a check-in session létrehozását, a válaszok mentését, az idempotens újraküldést, a stale revision elutasítását, a lezárt snapshot és session revision egyezését, a szülői és edzői olvasást, a kétféle megfigyelés rögzítőjét és forrását, az edzői megfigyelés pontos revisionjának publikálását, a szerepkör szerinti láthatóságot, az aláírt cursor lapozását és a módosított cursor elutasítását, a check-in válasz általános record úton történő létrehozásának tiltását, valamint a tenantok közötti 404 izolációt. Az adatbázis egy eldobható localhost replica set, nem Atlas.

A T-HG-130 végrehajtásakor a kanonikus API-manifest a Habi API **2.4.1** verzióját rögzítette. A szerződés szerint check-in válasz kizárólag a revisionnel védett check-in útvonalon hozható létre. Az általános record írás nem kerülheti meg a session revision- és eredmény-snapshot logikáját.

**Ready now at T-HG-130:** synthetic acceptance testing of the earlier check-in, observation, publication and authorization slice at `127.0.0.1:3000` using the instructions in `README.md`. This historical scope does not certify the later implementation.

**Not covered by T-HG-130:** DoneIsBetter callback/session issuance, live SSO permissions, Atlas/Vercel deployment, consent/retention evidence and personal pilot approval. The non-SSO implementation is documented under T-HG-131 and remains untested. No secrets were read or changed; no deployment or hosted DB operation occurred.

## T-HG-129 · Mac Ollama runtime és synthetic-only worker smoke · 2026-10-25

| Parancs / próba                                                                      | Eredmény                         | Környezet és korlát                                                                                                                                              |
| ------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uv sync --frozen`                                                                   | PASS, exit 0                     | `worker/`, Python 3.10 virtuális környezet, lockfile szerint.                                                                                                    |
| `uv run python -m unittest discover -s tests -v`                                     | PASS, 16 próba                   | Worker konfiguráció, hostzár, model/prompt drift és hibás inference válasz próbák.                                                                               |
| `set -a; source .env.example; set +a; uv run python -m habi_worker.cli verify-local` | PASS, exit 0                     | Helyi Ollama HTTP API: szerver `0.40.3`, `qwen2.5:7b` digest `sha256:845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e`, prompt SHA-256 egyezett. |
| `set -a; source .env.example; set +a; uv run python -m habi_worker.cli smoke-local`  | PASS, exit 0, inference `passed` | Rögzített szintetikus ellenőrző prompt a lokális modellre; elvárt exact marker válasz. Felhasználói adat nem volt a kérésben.                                    |

A local worker mód csak development + synthetic-only konfigurációval indul, loopback Ollama hostot követel, és hibázik, ha cloud, Atlas, user SSO vagy külső provider secret kerül a folyamat env-jébe. A lokális advisory lock 0600-as fájlon, nem blokkoló `flock`-kal zárja ki a második worker példányt. A kimeneti JSON nem tartalmaz promptot vagy generált szöveget. A runtime manifest már a ténylegesen látott daemon/model/prompt értékeket pineli.

Ez a modell- és futtatási bizonyíték, nem Habi job-feldolgozás. Worker service-token, cloud job API, lease/heartbeat, jogosultságfrissítés, kontextusbetöltés, eredménybeküldés és tartós retry még nincs megvalósítva. Nincs Atlas/Vercel kapcsolat, telepítés vagy személyes adat. Rollback: worker helyi CLI/config kód visszavonása és runtime-manifest korábbi verzióra állítása; perzisztens termékadat nem változott.

## T-HG-128 · Szerveroldali session- és scope-guard · 2026-10-25

| Parancs / próba                                                                     | Eredmény                      | Környezet és korlát                                                                |
| ----------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 85 pass, 0 fail, 0 skip | Izolált, egynode-os lokális MongoDB replica set; teszt-DB törlődött a suite végén. |
| `npm run lint`                                                                      | PASS, exit 0                  | Biome, 60 forrás-/tesztfájl.                                                       |
| `npm run typecheck`                                                                 | PASS, exit 0                  | TypeScript.                                                                        |
| `npm run build`                                                                     | PASS, exit 0                  | Next.js 16.4.3; hosted route inventory változatlan.                                |
| `git diff --check`                                                                  | PASS, exit 0                  | Lokális munkafa.                                                                   |

`authenticateHabiRequest()` ellenőrzi az opaque sessiont, az aktív actort és annak `accessRevision` értékét, a sessionben rögzített tenant/role/player pontos aktív membershipjét, tenant- és player-állapotot, valamint a session lejáratát és idle ablakát. Módosító HTTP-metódusnál pontos same-origin Origin és sessionhöz kötött CSRF header kell. Sikeres kérésnél feltételes session-touch történik, és csak minimális, immutable actor/tenant/role/player scope tér vissza. Felfüggesztett actor vagy érvénytelen membership esetén a guard előbb visszavonja a credentialt, majd a sessiont, és egységes 401-et ad. Négy helper-próba futott; a DB-replica suite a korábbi T-HG-127 handler-integrációkat is ellenőrizte.

A guard még nincs üzleti API-route-ba bekötve, így egyetlen jelenlegi product endpointot sem véd; ez helper-szintű bizonyíték, nem kész auth middleware vagy végponti jogosultságvédelem. Nem történt élő SSO/Atlas/Vercel kapcsolat, deploy vagy személyes adatkezelés. Kódon kívüli adatváltozás nincs. Rollback: a guard/helper teszt kódrevertje, perzisztens hatás nélkül.

## T-HG-127 · SSO login-indítás és biztonságos logout route · 2026-10-25

| Parancs / próba                                                                     | Eredmény                      | Környezet és korlát                                                               |
| ----------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 81 pass, 0 fail, 0 skip | Izolált, egynode-os lokális MongoDB replica set; teszt-DB törlődik a suite végén. |
| `npm run lint`                                                                      | PASS, exit 0                  | Biome, 58 forrás-/tesztfájl.                                                      |
| `npm run typecheck`                                                                 | PASS, exit 0                  | TypeScript.                                                                       |
| `npm run build`                                                                     | PASS, exit 0                  | Next.js 16.4.3; dinamikus `/auth/login` és `/auth/logout` route-ok.               |
| `git diff --check`                                                                  | PASS, exit 0                  | Lokális munkafa.                                                                  |

`GET /auth/login` ugyan-origin, szűrt `returnTo` értékkel indít OIDC discoveryt, szerveroldalon menti az egyszer használható state/nonce/PKCE tranzakciót, és Secure/HttpOnly/SameSite=Lax browser-binding cookie-val külső SSO-ra irányít. A válasz no-store és `Referrer-Policy: no-referrer`; discovery-hibánál nem marad félbehagyott login tranzakció. `POST /auth/logout` pontos Origin-egyezést és sessionhöz kötött CSRF tokent kér, előbb visszavonja a titkosított SSO credentialt, majd a sessiont, végül lejáratja mindkét auth cookie-t. A login és logout route-ra külön fake SSO/in-memory HTTP-próbák futottak.

Ez nem teljes bejelentkezés: `/auth/callback`, OIDC code/ID-token ellenőrzés route-szinten, app-permission és identity/membership bekötés, session-kiadás és request auth middleware még nincs. A login gomb ezért marad letiltva. Nem történt élő SSO, Atlas, Vercel vagy deployment hívás, és nem dolgoztunk fel személyes adatot. Nincs tartós adatváltozás a kódon kívül; migráció nincs. Rollback: az új login/logout route-ok és handlerek kódrevertje. A már létrejött 10 perces login tranzakciók TTL-lel lejárnak.

## T-HG-126 · sessionhöz kötött titkosított SSO credential lifecycle · 2026-10-25

| Parancs / próba                                                                     | Eredmény                      | Környezet és korlát                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 75 pass, 0 fail, 0 skip | Izolált, egynode-os lokális MongoDB 8.0.24 replica set; teszt-DB törölve a suite végén. |
| `npm run lint`                                                                      | PASS, exit 0                  | Biome, 52 forrás-/tesztfájl.                                                            |
| `npm run build`                                                                     | PASS, exit 0                  | Next.js 16.4.3; route inventory változatlan.                                            |
| `npm run typecheck`                                                                 | PASS, exit 0                  | TypeScript.                                                                             |
| `git diff --check`                                                                  | PASS, exit 0                  | Lokális munkafa.                                                                        |

Migration 003 kétszeri futtatása, checksums, strict Mongo validator, session-unique/TTL indexek és plaintext token elutasítása ellenőrizve. Két egyidejű refresh kérelem ugyanazt az egy provider hívást eredményezte; a lease/CAS egy tokenpárt mentett, a másik kérés a friss encrypted access tokent használta. SSO elutasítás visszavonta, logout helper visszavonta és a credential újraolvasását tiltotta. A credential expiry a session expiry-vel egyezik.

Ez helyi DB+fake SSO bizonyíték. Nincs Habi Atlas, hosted SSO, callback/login/logout HTTP route vagy auth middleware; credential modulet még nem hívja termék-route. Nem történt deploy vagy személyes adatkezelés. A refresh rotation szolgáltatói hívása és Mongo commit között marad egy remote/local dual-write ablak; crash vagy elveszett válasz esetén, ha a provider a régi tokent már érvénytelenítette, a felhasználónak újból be kell jelentkeznie. Rollback: `003-session-sso-credentials` down-migration nélkül marad; kódrevert mellett a nem használt, session-TTL-es titkosított rekordok TTL-lel ürülnek, nem törlünk migrációs ledger-t.

## T-HG-125 · SSO refresh token protokoll és titkosítási alap · 2026-10-25

| Parancs / próba     | Eredmény                      | Környezet és korlát                                                                                                                                 |
| ------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`          | PASS, 60 pass, 0 fail, 1 skip | Lokális Node suite; az izolált Mongo replica-set próba kihagyva, mert nincs `HABI_TEST_MONGODB_URI`. SSO válaszok kontrollált fake fetchből jöttek. |
| `npm run lint`      | PASS, exit 0                  | Biome, 48 forrás-/tesztfájl.                                                                                                                        |
| `npm run build`     | PASS, exit 0                  | Next.js 16.4.3; API route inventory nem változott.                                                                                                  |
| `npm run typecheck` | PASS, exit 0                  | TypeScript.                                                                                                                                         |
| `git diff --check`  | PASS, exit 0                  | Lokális munkafa.                                                                                                                                    |

Az auth request kéri az elfogadott DoneIsBetter guide `offline_access` scope-ját; a code exchange validálja a nem üres refresh tokent és pozitív `expires_in` mezőt. A refresh grant kizárólag JSON POST-tal, no-store és 5 másodperces timeouttal fut; rotált refresh tokent ad vissza. Az AES-256-GCM helper HKDF kulcsot, egyedi 96 bites IV-t, auth tag-et és issuer/client/actor kötésű associated data-t használ; kulcs-, payload-, tenant/persona-scope és módosítási esetek teszteltek. Nincs nyers token logolva.

Ez nem credential persistence vagy hosted auth: a helper még nincs session/database mezőhöz vagy API route-hoz kötve, nem történt éles SSO/Atlas/Vercel hívás, nincs személyes adat, consent/pilot vagy deploy. Következő lépés a verziózott, sessionhöz kötött titkosított credential tárolás és refresh-verseny/idempotencia viselkedés szerződésének létrehozása; csak ezt követően lehet callback route-ot bekötni. Rollback: kód/helper teszt és OIDC scope visszavonása; nincs tartós adatváltozás.

## T-HG-124 · Habi belépőképernyő · 2026-10-25

| Parancs / próba                      | Eredmény                                                          | Környezet és korlát                                                                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lokális production server smoke      | PASS, `/` HTTP 200                                                | Lokális, szintetikus adatra korlátozott környezet; a Habi SSO nincs bekötve.                                                                                                                                                |
| Viewport ellenőrzés                  | PASS, 360/390/430/768/1024/1440 px, nincs vízszintes túlcsordulás | Chrome headless, lokális build; 390 px szélességen 200%-os gyökér-betűméret mellett is nincs vízszintes túlcsordulás.                                                                                                       |
| Képernyőolvasási szemantika / fókusz | Részleges, manuális DOM-ellenőrzés                                | Egyetlen `h1`, `lang="hu"`, `aria-labelledby`-del címkézett fő szakasz, `role="status"`; a bejelentkezés gomb letiltott, ezért nincs aktív fókuszálható vezérlő. Fizikai eszköz és teljes képernyőolvasó-próba nem történt. |

A főoldal egyértelműen Habi-ként azonosítja a terméket, magyar belépőszöveget és a hiányzó SSO-folyamat állapotát mutatja. Szerepválasztás, hamis bejelentkezés, mintajátékos vagy személyes adat nincs. A gomb szándékosan letiltott; azt SSO route/session integráció tényleges elkészülte után lehet aktiválni. Ez kizárólag a belépőfelület bizonyítéka, nem backend/API/Atlas/worker integráció vagy személyes pilot. Rollback: a `src/app/page.tsx`, `page.module.css` és `layout.tsx` változásainak revertje; nincs perzisztens adatváltozás.

## T-HG-121 · Közös vizuális forrás hash-pinelése · 2026-10-25

| Parancs / próba     | Eredmény                      | Környezet és korlát                                                                                                                                    |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`          | PASS, 54 pass, 0 fail, 1 skip | Lokális Node suite; plusz a központi CSS SHA-256 és forráscommit ellenőrzése. A Mongo replica-set integráció kihagyva, nincs `HABI_TEST_MONGODB_URI`.  |
| `npm run lint`      | PASS, exit 0                  | Biome.                                                                                                                                                 |
| `npm run typecheck` | PASS, exit 0                  | TypeScript.                                                                                                                                            |
| `git diff --check`  | PASS, exit 0                  | Lokális munkafa.                                                                                                                                       |

A Habi `global.css` byte-pontosan egyezik a Habigoal v101 kanonikus `wireframes/global.css` fájllal. A `design/design-system-manifest.json` rögzíti a `ef6eea568961327026bddbbcea1faa2728e6006d` forráscommitot és SHA-256-ot; a regressziós teszt bármilyen eltérésnél hibázik. Nincs képernyőkomponens-módosítás, live UI, böngészős accessibility audit vagy szolgáltatásintegráció. A CSS manifest/test eltávolítása kódrevert, tartós mellékhatás nélkül.

## T-HG-120 · Rögzített timeline DTO-validálás és loader · 2026-10-25

| Parancs / próba           | Eredmény                      | Környezet és korlát                                                                                                                                                       |
| ------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                | PASS, 53 pass, 0 fail, 1 skip | Lokális Node suite; Atlas replica-set integráció kihagyva, mert nincs `HABI_TEST_MONGODB_URI`. Az új loader fetchét kontrollált fake válasz adta.                         |
| `npm run lint`            | PASS, exit 0                  | Biome; 44 forrás-/tesztfájl.                                                                                                                                              |
| `npm run typecheck`       | PASS, exit 0                  | TypeScript, `tsc --noEmit`.                                                                                                                                               |
| Böngészőmodul build-próba | PASS, exit 0                  | Ideiglenes `use client` import route sikeresen buildelt a loaderrel/Ajv sémával; a próbafájlt utána eltávolítottuk, a produkciós build nem tartalmazza ezt a próbaoldalt. |
| `git diff --check`        | PASS, exit 0                  | Lokális munkafa.                                                                                                                                                          |

A `contracts/api-response-schemas.json` a kanonikus API 2.2.0 timeline read DTO-kat rögzíti; `api-response-manifest.json` rögzíti a `cc90a71cbf4196e61b91bd848474bc0d81330537` forrás-commitot és a SHA-256 digestet. Az Ajv 2020 validátor elutasítja a hiányzó `accessRevision` mezőt és a nem engedélyezett nested mezőket. A `loadTimelinePage` query allow-listet épít, same-origin `no-store` transporton kér, a pinned sémával validál, majd meghívja a view-model adaptert. A tesztek a transzportopciókat, mezőleképezést, folytatás/cursor állapotot és fail-closed viselkedést ellenőrzik.

Ez csak kliensmodulok közti izolált bizonyíték fake API-válasszal és a Next.js browser-boundary build-próba. Nincs Habi üzleti API-route, hosted SSO/middleware, valódi UI, Atlas, deploy vagy személyes adat; tehát nem igazolja az end-to-end jogosultságot vagy adatfolyamot. Visszaállítás: kód/séma/manifeszt/dokumentáció commit revertje, nincs perzisztens hatás.

## T-HG-118 · Product API responses require validation · 2026-10-25

| Command / test      | Result                               | Environment and limits                                                                 |
| ------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| `npm test`          | PASS, 49 passed, 0 failed, 1 skipped | Local Node suite; isolated Mongo replica-set test skipped because no URI was supplied. |
| `npm run lint`      | PASS, exit 0                         | Biome.                                                                                 |
| `npm run typecheck` | PASS, exit 0                         | TypeScript.                                                                            |
| `npm run build`     | PASS, exit 0                         | Next.js 16.4.3; no build-time DB probe or route error.                                 |

`requestHabiApi` refuses `/v1/*` requests before fetch if no caller-supplied response validator is present. A validator returning false or throwing produces a generic contract error without leaking its detail. Input-method/body/header errors are checked before the validator requirement, and server error responses remain distinguishable without treating their payload as success DTOs.

This does not provide a canonical DTO schema registry or UI integration; screens must bind validators to the accepted contract before calling the client. No Atlas/SSO/deploy/personal-data operation. Rollback is a code revert with no persistent impact.

## T-HG-117 · Same-origin böngészős API transport · 2026-10-25

| Parancs / próba     | Eredmény                      | Környezet és korlát                                            |
| ------------------- | ----------------------------- | -------------------------------------------------------------- |
| `npm test`          | PASS, 48 pass, 0 fail, 1 skip | Node unit suite; isolated Mongo integration skip, no test URI. |
| `npm run lint`      | PASS, exit 0                  | Biome, 41 source/test files.                                   |
| `npm run typecheck` | PASS, exit 0                  | TypeScript.                                                    |
| `npm run build`     | PASS, exit 0                  | Next.js 16.4.3, no build-time route probes/errors.             |

`src/lib/client/api-client.mjs` only allows same-origin `/api/`, `/auth/`, `/v1/` paths, same-origin cookies, no-store fetch, no redirects, and a small CSRF/idempotency/revision header allow-list; browser Authorization bearer headers are rejected. Network, abort, HTTP and protocol errors remain separate. It does not retry. Tests cover success/options, body/header behavior, path/credential restrictions, offline/abort, redacted server failures and one-call-only writes.

This is a transport primitive, not a connected screen or authenticated workflow. Successful DTO payloads are not yet schema-validated. No Atlas/SSO/deployment/personal-data operation. Rollback is a code revert with no persistent impact.

## T-HG-116 · Request correlation and redacted API failure logging · 2026-10-25

| Command / probe               | Result                                     | Environment and limits                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                    | PASS, 42 passed, 0 failed, 1 skipped       | Local Node suite; isolated Mongo replica-set integration skipped because no test URI was supplied.                                                                                               |
| `npm run lint`                | PASS, exit 0                               | Biome, 39 source/test files.                                                                                                                                                                     |
| `npm run typecheck`           | PASS, exit 0                               | TypeScript.                                                                                                                                                                                      |
| `npm run build`               | PASS, exit 0                               | Next.js 16.4.3; no build-time route errors or readiness probes.                                                                                                                                  |
| Local production-server smoke | PASS, `/api/health` 200; `/api/ready` 503  | Synthetic-only runtime config, no Atlas URI; each response had a unique `X-Request-ID`, readiness body was `DEPENDENCY_UNAVAILABLE`, and the server emitted a content-free correlated 503 event. |

Both operational routes use the shared API boundary. Known/unknown exceptions map to the stable public envelope; normal 5xx dependency responses also produce safe structured events. Query/body, exception detail, driver text, URI, and credentials are not logged. The readiness 503 is expected because this local smoke intentionally had no Atlas target; it is not evidence of a live Atlas failure.

This change does not provide live Atlas/SSO verification and is not yet applied to future business routes. Rollback is a code revert with no persistent database effect.

## T-HG-114 · Idővonal DTO → view-model adapter · 2026-10-25

| Parancs / próba     | Eredmény                      | Környezet és korlát                                                                                |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm test`          | PASS, 35 pass, 0 fail, 1 skip | Synthetic DTO fixture; Mongo replica-set integráció kihagyva, mert nincs `HABI_TEST_MONGODB_URI`.  |
| `npm run lint`      | PASS, exit 0                  | Biome.                                                                                             |
| `npm run typecheck` | PASS, exit 0                  | TypeScript.                                                                                        |
| `npm run build`     | PASS, exit 0                  | Next.js 16.4.3; a route inventory nem változott.                                                   |

Az adapter a szerződött `submittedAt → at`, `actorRole → role`, `kind → type` mappinget végzi; megőrzi ID/revision/processId/replyTo/relatedId, server-process `closedAt`, edges, continuations, nextCursor, snapshotAt és explicit accessRevision állapotot. Nincs storage-only tenant/retention/audit field, email, text, title vagy author másolás. Hiányzó Processből nem következtet lezárásra. A malformed page/node/process elutasított, nem csendben elhagyott. A view model és a tömbjei immutable.

Nincs API-handler, Atlas/SSO kapcsolat, személyes adat, UI bekötés vagy böngésző→API→adatbázis integráció. Visszaállítás: tiszta kódcommit-revert, nincs perzisztens mellékhatás. HO-04 adapter unit szinten teljesült; szerver DTO és képernyő-integráció továbbra is nyitott.

## T-HG-113 · SSO permission outage grace · 2026-10-25

| Parancs / próba     | Eredmény                      | Környezet és korlát                                                                                            |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm test`          | PASS, 32 pass, 0 fail, 1 skip | Node.js local unit/domain suite; a Mongo replica-set integráció kihagyva, mert nincs `HABI_TEST_MONGODB_URI`.  |
| `npm run lint`      | PASS, exit 0                  | Biome.                                                                                                         |
| `npm run typecheck` | PASS, exit 0                  | TypeScript.                                                                                                    |
| `npm run build`     | PASS, exit 0                  | Next.js 16.4.3.                                                                                                |

Az új permission policy adapter minden hívásnál először a friss SSO-ellenőrzést próbálja. SSO-hálózati/kiesési hibánál legfeljebb 60 másodperces approved cache kizárólag normál `read` műveletet tarthat fenn; hiányzó, lejárt vagy jövőből származó timestamp elutasított. `write`, `publish` és `worker_context` offline mindig `SSO_DEPENDENCY_UNAVAILABLE`; sikeres friss revocation törli a korábbi cache-engedélyt. Fetch timeout/network hibák stabil unavailable hibakódra normalizálódnak; váratlan checker hiba általános, zárt `SSO_PERMISSION_CHECK_FAILED` választ ad. A cache issuer/subject/client scope-ra különül, process-local és 256-entry boundot alkalmaz; csak hash-kulcsot és minimális engedélyállapotot tárol.

A próbák fake permission checkerrel futottak; nem történt SSO/Atlas/Vercel kapcsolat, secret olvasás, deploy vagy személyes adatkezelés. Ez a kód még nincs auth middleware-be kötve, ezért a termékrequestekre nem állítunk aktív jogosultságvédelmet. Rollback: új adapter és teszt törölhető; nincs adatbázis- vagy user-state változás. SSO credential lifecycle döntés továbbra is kell a hosted friss permission ellenőrzésekhez.

## T-HG-112 · JWKS kulcsrotáció és session ID kontraktus · 2026-10-25

| Parancs / próba     | Eredmény                              | Környezet és korlát                                                                                                                                                   |
| ------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`          | PASS, exit 0; 27 pass, 0 fail, 1 skip | Az Atlas replica-set integration case kihagyva, mert ebben a futásban nem volt `HABI_TEST_MONGODB_URI`; JWKS-próba generált RSA kulcspárral és fake fetch-sel futott. |
| `npm run lint`      | PASS, exit 0; 31 fájl                 | Biome, figyelmeztetés nélkül.                                                                                                                                         |
| `npm run typecheck` | PASS, exit 0                          | TypeScript.                                                                                                                                                           |
| `npm run build`     | PASS, exit 0                          | Next.js 16.4.3; auth route továbbra sincs a route inventoryban.                                                                                                       |
| `git diff --check`  | PASS, exit 0                          | Nincs whitespace-hiba.                                                                                                                                                |

Az ismeretlen `kid` egyszeri JWKS-frissítése csak jól formált RS256 JWT fejlécre indul; hibás token nem generál hálózati kérést, az ismeretlen kulcs frissítés után elutasított marad. Minden JWKS HTTP-kérés no-store és legfeljebb öt másodperces. A session ID Base64URL-ről hexre változott, mert a Base64URL véletlen érték `_` vagy `-` karakterrel kezdődhetett, amely megsértette a közös alfanumerikus kezdőkarakterű ID-sémát. Ez a szerződés alapján intermittáló session-kiadási hibát okozhatott.

Nem történt SSO/Atlas/Vercel hívás, deploy vagy adatváltozás. Rollback: az új helper és a session ID kód visszaállítható; ez csak újonnan létrejövő sessionazonosítók alakját érinti, a meglévő session rekordokat nem migrálja. A hosted SSO-folyamat és a permission credential lifecycle továbbra is blokkolt a szükséges 60 másodperces ellenőrzési megoldásról szóló döntésig.

## T-HG-110 · OIDC és session alapprimitívek · 2026-10-25

| Parancs / próba                                                                     | Eredmény                    | Környezet és korlát                                                                                                                                               |
| ----------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, exit 0; 36/36, 0 skip | Node.js 24.20; lokális MongoDB 8.0.24 egynode-os replica set; 9 Mongo-integrációs alteset. OIDC HTTP-függőségek fake fetch-sel; nincs élő SSO/Atlas/hosted próba. |
| `npm run lint`                                                                      | PASS, exit 0; 31 fájl       | Biome, figyelmeztetés nélkül.                                                                                                                                     |
| `npm run typecheck`                                                                 | PASS, exit 0                | TypeScript, `tsc --noEmit`.                                                                                                                                       |
| `npm run build`                                                                     | PASS, exit 0                | Next.js 16.4.3; route inventory változatlan, auth függvények még nincsenek bekötve.                                                                               |
| `git diff --check`                                                                  | PASS, exit 0                | Nincs whitespace-hiba.                                                                                                                                            |

OIDC: felfedezési issuer pontos egyezés és az issuer HTTPS originjén belüli endpointok; S256 authorization URL; JSON `client_secret_post` tokencsere; JWKS-alapú, kizárólag RS256 aláírás és `iss/aud/azp/exp/iat/nonce` ellenőrzés; userinfo és `approved` + `user|admin` app-permission ellenőrzés; minden hálózati kérés öt másodperces timeouttal, `no-store` beállítással. A session alapréteg 256 bites opaque tokent, csak HMAC-SHA256 hash tárolást, sessionhöz kötött CSRF tokent, 8 órás abszolút és 30 perces inaktivitási határt, touch/revoke műveletet ad. A `(issuer,subject)` feloldó csak aktív helyi actort, aktív nem lejárt membershipet, aktív tenantot és tenanton belül létező playert fogad el; email-alapú összefűzés nincs.

Nincs még route-level flow, ismeretlen `kid` esetén egyszeri JWKS refresh, permission-token lifecycle, session-authorization middleware, idempotens logout/scope rotáció, SSO kliensregisztráció vagy live login. A 60 másodperces permission recheckhez szükséges credential-modellről döntésre várunk. Nincs Atlas/Vercel művelet, token secret Vercelből olvasás, felhasználói adat vagy deploy. Rollback: a mostani kódcommit visszaállítható; az új, belső transaction collection adatot csak az adott 10 perces TTL ablakban tarthat. Session kód még nem része egy elérhető route-nak.

## T-HG-109 · Login-tranzakciós alap · 2026-10-25

| Parancs / próba                                                                     | Eredmény                           | Környezet és korlát                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, exit 0; 26/26, 0 skip        | Node.js 24.20; lokális MongoDB 8.0.24 egynode-os replica set, kizárólag eldobható szintetikus `_test` DB. 8 Mongo integrációs alteset. SSO/Atlas/hosted route nincs hívva. |
| `npm run lint`                                                                      | PASS, exit 0; 25 forrás-/tesztfájl | Biome; nulla lint/format hiba.                                                                                                                                             |
| `npm run typecheck`                                                                 | PASS, exit 0                       | TypeScript, `tsc --noEmit`.                                                                                                                                                |
| `npm run build`                                                                     | PASS, exit 0                       | Next.js 16.4.3/Turbopack; az új auth route még nincs bekötve.                                                                                                              |
| `git diff --check`                                                                  | PASS, exit 0                       | Nincs whitespace-hiba.                                                                                                                                                     |

Elkészült a 36 termékszerződés szerinti collectiontól különálló `auth_transactions` belső tároló, szigorú Mongo validatorral, state-hash és aktív browser-binding egyedi indexszel, valamint tízperces TTL indexszel. Az új `002-auth-transactions` forward migration hozzáadja ezt a tárolót; a már kiadott `001-initial-schema` fájl változatlan. A state egyszer használható, browser-bound és lejáratot ellenőrző atomic `findOneAndUpdate` útvonalat kapott. A második login ugyanazon browser bindinggel az első tranzakciót invalidálja. `returnTo` csak same-origin relatív útvonal lehet; az authorize URL S256 PKCE paramétereket épít.

Ez csak a szerveroldali tranzakciós alap és helyi próba. Hosted `/auth/login` és `/auth/callback`, OIDC discovery/token/JWKS ellenőrzés, app-permission, identity/membership adapter, session/CSRF/logout/scope váltás, SSO kliensregisztráció és live login még nincs. A Habi SSO client/secret és új Atlas cél nincs igazolva; titkos Vercel értéket nem olvastunk, és nem futott távoli migráció/deploy. Rollback: az új kiadást vissza lehet állítani; a már alkalmazott 002 collection/index eltávolítása nem automatikus, a tízperces tranzakciótár elhagyható vagy külön reviewed forward migrationnel takarítható. Nincs személyes adat vagy éles felhasználói hatás.

## T-HG-108 · Perzisztencia, migráció és seed · 2026-10-25

| Parancs / próba                                                                     | Eredmény                                                             | Környezet és korlát                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                            | PASS, exit 0; 50 csomag, 0 audit finding                             | Node.js 24.20.0 / npm; lockfile szerinti tiszta install.                                                                                                                                       |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, exit 0; 20 test, 0 skip; ezen belül 7 MongoDB integrációs eset | Lokális MongoDB 8.0.24 egynode-os replica set, kizárólag szintetikus fixture. A szerver API, Atlas-kapcsolat, SSO és személyes adat nincs tesztelve. A 27 domain referencia-szcenárió is PASS. |
| `npm run db:migrate:test` explicit localhost `_test` célon                          | PASS, exit 0; `001-initial-schema` alkalmazva                        | 36 collection, contract validator és indexek. A parancs csak localhost és `HG_ENVIRONMENT=test` értéknél engedélyezett; Vercel/Atlas címet elutasít.                                           |
| `npm run db:seed:test` kétszer                                                      | PASS; első futás 4 insert, második 0                                 | Két szintetikus tenant és két játékos; tenantonként azonos játékos-ID, eltérő timeZone marker. A DB-t a próba után eldobtuk.                                                                   |
| `npm run db:migrate:test` konfigurációs guard nélkül                                | Várt elutasítás, exit 1                                              | `LOCAL_TEST_MIGRATION_ONLY`; DB-kapcsolat nem nyílt.                                                                                                                                           |
| `npm run lint`                                                                      | PASS, exit 0; Biome 22 fájl                                          | Hiba és figyelmeztetés nélkül.                                                                                                                                                                 |
| `npm run typecheck`                                                                 | PASS, exit 0                                                         | TypeScript statikus ellenőrzés.                                                                                                                                                                |
| `npm run build`                                                                     | PASS, exit 0; Next.js 16.4.3                                         | `/`, `/_not-found` statikus; `/api/health` és `/api/ready` dinamikus.                                                                                                                          |

Megvalósítás: 36 collectionre Ajv 2020 teljes sémavalidáció és MongoDB `$jsonSchema` validátor; pinned source manifest/digest; versioned `001-initial-schema` migration; tenant-szűrt repository olvasás; revision CAS; majority/snapshot tranzakciós idempotency receipt, body-hash conflict, 24h replay window és expired receipt törlése (a TTL monitor késésétől függetlenül); deterministic `$setOnInsert` seed. Same-key párhuzamos kérések és lejárt kulcs utáni új művelet is replica-seten futott.

Nem készült Atlas-provisioning vagy remote/production migrációs parancs. Nem kötöttük a generikus adaptert üzleti API-handlerekhez; ezekhez továbbra is auth/authorization middleware kell. MongoDB mentésből visszaállítás, távoli deployment, SSO, GridFS és szerepköri E2E még nincs igazolva. A migráció felfelé idempotens, automatizált down-migration nincs; visszajavítás külön forward migration vagy jóváhagyott backup restore.

## T-HG-107 · Atlas kapcsolati alap és readiness · 2026-10-25

| Parancs             | Eredmény                          | Bizonyíték és korlát                                                                                                                                |
| ------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`          | PASS, exit 0; 8 Node tesztcsoport | Atlas-konfiguráció fail-closed, szintetikus mód tiltása, readiness 200/503 és hiba-redakció; 27 domain referencia-szcenárió. Nincs élő Atlas-hívás. |
| `npm run lint`      | PASS, exit 0                      | Biome 13 forrás-/tesztfájlon; figyelmeztetés nélkül.                                                                                                |
| `npm run typecheck` | PASS, exit 0                      | TypeScript ellenőrzés.                                                                                                                              |
| `npm run build`     | PASS, exit 0                      | Next.js 16.4.3; `/api/health` és `/api/ready` dinamikus kérésidejű route.                                                                           |

Kód: `mongodb@7.7.0`, `server-only@0.0.1`; szerverpéldányon újrahasznált, maximum öt kapcsolatos MongoClient pool, rövid connection/server-selection/queue timeoutokkal. `/api/health` liveness és `/api/ready` Atlas ping-alapú readiness különválasztva. A readiness nem ad vissza belső driverhibát vagy secretet. Az aktív Next.js 16 Cache Components konfigurációban a GET handler request-time adatbázis-hozzáférése automatikusan dinamikussá teszi az útvonalat; az alkalmazás `dynamic='force-dynamic'` szegmensflaget nem használ.

Az új `HG_*` Atlas-konfiguráció nincs beállítva, ezért Atlas-kapcsolat, migráció, index, seed, domain repository, SSO, deploy vagy személyes adatművelet nem történt. A pool korlát induló érték; Vercel párhuzamos példányszám és Atlas connection budget alapján még mérendő. A legacy `habi_mongodb_uri` értékét nem olvastuk.

## T-HG-105 · `codex/habi-ground-up` · 2026-10-25

### Lokális forrás- és buildellenőrzés

| Parancs                                                                           | Eredmény                  | Bizonyíték és korlát                                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                          | PASS, exit 0              | 31 npm csomag auditálva; 0 sebezhetőségi találat; a lockfile tiszta telepítést ad.                                        |
| `npm test`                                                                        | PASS, exit 0; 5 teszteset | 4 konfigurációs teszt és 27 domain-referencia forgatókönyv; egyik sem élő API/Atlas/SSO bizonyíték.                       |
| `npm run lint`                                                                    | PASS, exit 0              | Biome 8 Habi runtime/test fájlon, hiba vagy figyelmeztetés nélkül.                                                        |
| `npm run typecheck`                                                               | PASS, exit 0              | TypeScript statikus ellenőrzése.                                                                                          |
| `npm run build`                                                                   | PASS, exit 0              | Next.js 16.4.3 / Turbopack. `/` és `/_not-found` statikus; `/api/health` futásidőben kiszolgált dinamikus route.          |
| `uv sync --frozen` + `uv run python -m unittest discover -s tests -v` (`worker/`) | PASS, exit 0; 6/6         | Worker konfigurációt és credential-határokat ellenőrzi; poller, Ollama inference és valódi hostzár nem része a csomagnak. |

A `contracts/check-contracts.py` és a `check-handoff.py` a Calvus dokumentációs/forrástárban fut, mert azok a teljes dokumentumkészletet és prototípust ellenőrzik. Eredmény: 78 API-művelet, 13 read DTO, 59 gap link, 12 függőségi munkacsomag és 25 konfigurációs kulcs PASS. A Calvus saját repository-gate-je külön marad.

### Vercel felderítés (T-HG-105 állapot)

- A `habi` projekt env-listáján a titkos `habi_mongodb_uri` Development, Preview és Production célra is be van állítva. Az értékét nem olvastuk; nem igazolt tesztadatbázisnak, ezért nem használtuk.
- A `habigoal` projekt három MongoDB env-kulcsa csak Preview célra van beállítva. Egy Preview deployment HTTP 302 védelmi átirányítást adott; ebből sem az alkalmazás, sem az Atlas-adatbázis elkülönítése nem ellenőrizhető.
- Ekkor még nem volt `.vercel`-kapcsolat; env-értéket nem húztunk le, Atlas-hoz nem csatlakoztunk, migrációt/seedet/deployt nem futtattunk.

### Pontos készültség

Működik: tiszta Next.js alkalmazásváz, fail-closed indulási konfiguráció, személyes adatot nem kérő elérhetetlenségi oldal, no-store dinamikus liveness végpont, szintetikus konfigurációpróbák, API/domain szerződés és worker konfigurációpróbák.

Nem működik még: SSO, üzleti API-handler, Atlas repository, GridFS, migrációk/indexek/seed, tartós job/lease, Mac worker poller, Ollama inference, teljes szerepköri folyamat, böngésző–API–Atlas–worker integráció, személyes adatos teszt vagy pilot.

Ezek a T-HG-105 időbélyegzett eredményei; a következő bejegyzés frissíti a Vercel-link állapotát.

## T-HG-106 · Habi célprojekt rögzítése · 2026-10-25

- A felhasználó pontosította: Habi a termék neve és a leszállítandó környezet; Habigoal a kliensbemutató prototípus és a specifikációs forrás. A régi alkalmazás forrásfája lecserélendő, nem megőrzendő célállapot.
- A Habi repository a `narimato/habi` Vercel projekthez lett lokálisan kapcsolva. `.vercel/project.json` project ID: `prj_2a7wlyOX1Iasat3qhRsUn0Wu7QMk`; `.vercel/` gitignore alatt van.
- `vercel env ls` csak a `habi_mongodb_uri` nevet mutatta, Development/Preview/Production célokkal. Titokértéket nem olvastunk, env pullt nem futtattunk.
- Ez a legacy Mongo-változó nem igazolja a Habi runtime konfigurációját: a `HG_*` Atlas/SSO/session kulcsok, az új adatbázis-célnév és a DoneIsBetter appkliens nincsenek igazolva. DB-kapcsolat, migration, seed, személyes adat és deploy nem történt.
- A Habi kódág továbbra is lokális `codex/habi-ground-up`; a main és élő deployment jelenleg régi snapshotot szolgál ki. Ez átmeneti tényállapot, nem elfogadott cél.

### Még hátralévő, nem teljesített ellenőrzés

- A lokális forráspróbák és gate-ek újrafuttatása a T-HG-106 dokumentációs módosítások után.
- A Vercel projekt `frameworkPreset=Other`; Next.js beállítás és Habi buildbeállítás verifikálása deploy előtt.
- Az új Habi Preview/Production konfiguráció és dedikált Atlas adatbázis előkészítése; a régi URI átnevezése/újrakötése nem tekinthető biztonságos konfigurációnak.
- A teljes szerepköri folyamat, SSO, API, Atlas/GridFS és worker end-to-end próbája továbbra sincs megvalósítva.
## T-HG-123 · API 2.3.0 timeline-tulajdonlás és jogosultság-ellenőrzött rekordbetöltés · 2026-10-25

Kanonikus forrás: Calvus `1f4c2fa45af5a4b8bf46e1eb6e9f2ae2948fb787`, API 2.3.0. A pinelt válaszséma tartalmazza az idővonal oldal/esemény/folyamat DTO-kat, a pontos `playerId`, `sourceKind`, `resourceRef{id,revision}` mezőket, valamint az allow-listed `RecordReadDTO`-t és annak hivatkozott sémáit. A séma digestje: `6f2d7ff05020b32f007201d350839ec6c96396957c54976a2d3bc2292ac01415`.

- `npm test`: PASS, 56 sikeres / 0 hibás / 1 kihagyott próba. A kihagyott esethez `HABI_TEST_MONGODB_URI` szükséges; az új tesztek szintetikus API-fixture-t használnak.
- Az idővonal-loader az adapter előtt validálja a pinelt 2.3 oldalt, és megőrzi a játékos-/forrás-/erőforrás-hivatkozást.
- A `loadTimelineRecord` az eseményből vett pontos referenciával hívja a jogosultság-ellenőrzött `/v1/players/{playerId}/records/{id}` útvonalat. Tartalmat csak érvényes DTO és egyező `playerId`, rekordazonosító, valamint revision esetén ad vissza. Eltérésnél és hibás eseménynél zártan hibára fut.
- Ez kliensoldali szerződés- és loaderpróba, nem igazolja a telepített végpontot, szerveroldali jogosultságot, UI-integrációt, Atlas-t, SSO-t vagy személyesadat-feldolgozást. A backendnek ettől függetlenül kell tagságot és játékos-scope-ot ellenőriznie. Nem történt deploy vagy távoli adatelérés.

## T-HG-132 · Admin permission gate and verified role invitations · 2026-10-26

> Historical snapshot: statements below describe the worktree before the role-workflow implementation was completed. The current state and latest evidence are in T-HG-136.

| Check                                                                               | Result                      | Scope                                                                                                  |
| ----------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 118 tests, 0 failures | Isolated local Mongo replica-set integration; migration 011 applies twice safely. Synthetic data only. |
| `npm run lint`                                                                      | PASS, exit 0                | Biome over `src` and `tests`.                                                                          |
| `npm run typecheck`                                                                 | PASS, exit 0                | TypeScript.                                                                                            |
| `npm run build`                                                                     | PASS, exit 0                | Next.js 16.4.3; includes `/admin`, `/api/admin/*`, and `/invite/claim`.                                |
| `git diff --check`                                                                  | PASS, exit 0                | Local worktree.                                                                                        |

The callback now records the verified issuer/subject and Habi app permission in the SSO owner session. Only an SSO `admin` permission creates the session-bound admin grant; no email address is hard-coded. Invitation tokens are random, seven-day, one-use links with only keyed hashes stored. Claim binds the invite to the exact verified identity and creates identity/actor/membership/player/role-session within one Mongo transaction. Focused tests cover token tampering, admin denial, invite expiry/revocation, role scope and same-identity retry. These are code/local DB proofs, not hosted SSO or a live user-flow proof.

**Not delivered to Production:** the changes remain uncommitted; migration 011 is not applied there; no active tenant or approved retention/controller policy references are established; role API operations remain fail-closed in the current SSO-browser runtime; the local admin interface supports roster lookup and invitation/membership revocation; the root page still displays the old diary UI; and no production role workspace is connected. No Atlas records were changed. A real invitation cannot be issued until the tenant/policy inputs and role runtime cutover are resolved.

## T-HG-133 · Initial tenant identifier `habi` · 2026-10-26

> Historical snapshot: the tenant was not yet initialized at this point. The MVP bootstrap now uses the explicit draft policy references described below; see T-HG-136.
- Added the non-secret Vercel Production setting `HG_TENANT_ID=habi` to the explicitly linked `narimato/habi` project. Verified the variable name and Production target with `vercel env ls`; secret values were not read.
- Updated SSO runtime validation to require a valid `HG_TENANT_ID`. Admin invitation lookup now exposes only the configured tenant, and invitation creation rejects any different tenant identifier. The admin empty-state explains that tenant creation and approved data policies are still required.
- This change is local and has not been deployed. No Atlas record or migration was written. The `habi` tenant identifier is configured, but a valid tenant document cannot be created until its approved retention and controller policies are supplied. The intended admin account is `moldovancsaba@gmail.com`; admin access remains based on the verified DoneIsBetter Habi application `admin` permission, never an email allowlist.

| Check                                                                               | Result                      | Scope                                                           |
| ----------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 118 tests, 0 failures | Local synthetic replica set only; no production data touched.   |
| `npm run lint`                                                                      | PASS, exit 0                | Biome checked 169 source/test files.                            |
| `npm run typecheck`                                                                 | PASS, exit 0                | TypeScript.                                                     |
| `npm run build`                                                                     | PASS, exit 0                | Next.js 16.4.3; `/admin`, invitation, and claim routes compile. |
| `git diff --check`                                                                  | PASS, exit 0                | Current local worktree.                                         |

Owner selected “Draft policies for my review” on 2026-10-26. Two Hungarian policy drafts were prepared in `docs/policies/`. They propose operational retention values for review, explicitly mark the controller/processor model and lawful bases unresolved, and cannot be used as active tenant policy IDs. No tenant record was created and no personal data was enabled.

## T-HG-134 · Local synthetic Habi MVP and Funnel smoke test · 2026-10-26

| Check                                                                       | Result         | Scope                                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:workflow:local` with `.env.test.example`                      | PASS, exit 0   | Local replica set database `habi_workflow_test`, synthetic tenant/player/parent/coach records only.                                                                                                      |
| `worker/.env.test.example` + `uv run python -m habi_worker.cli run-service` | PASS           | Local-test worker claimed and completed one `personalInterpretation` and one `reportScan` job. ClamAV returned `clean`; the Qwen local model returned a `no_evidence` result for the synthetic question. |
| `verify-local` and `smoke-local` with `worker/.env.example`                 | PASS, exit 0   | Verified Ollama `0.40.3`, `qwen2.5:7b` digest `845dbd…697e`, prompt hash, and one synthetic local inference.                                                                                             |
| Anonymous request to Funnel `/api/tags`                                     | Expected 401   | Public URL maps to `127.0.0.1:11435`; gateway denies a request without its bearer credential.                                                                                                            |
| Authenticated Funnel `/api/chat` with synthetic prompt                      | PASS, HTTP 200 | Model `qwen2.5:7b` returned exact marker `HABI_FUNNEL_TEST_OK`; the credential was read from its owner-only file and never printed.                                                                      |

The first acceptance attempt stopped before workflow execution because its homepage assertion expected client-rendered text in the server response. The test now checks the stable server-rendered app shell; the full acceptance was rerun successfully. Expected denials during the successful run included the designed 403/404/409 cases.

This verifies the local synthetic Habi workflow and separately verifies that the existing authenticated Tailscale Funnel gateway can reach Ollama. The Funnel is currently the **ClassScout** gateway, not Habi configuration. Habi's tested worker still calls its local loopback Ollama directly; no Habi worker traffic was sent through Funnel. No Vercel/Atlas data, real identities, personal records, or Production deployment were used. The test app and worker were stopped after the run; the MongoDB listener was already running before the test and was left alone.

### T-HG-135 · Local AI evidence-contract correction · 2026-10-26

The `no_evidence` result above was traced to a model-format mismatch: Qwen returned a bare source ID while the worker correctly requires an exact `{id, revision, span}` reference. The worker prompt now states the exact object shape, exact manifest matching, and allowed claim kinds; the validator remains strict and does not accept bare IDs.

| Check                                                                               | Result                                               | Scope                                                                                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 118 tests                                      | Isolated local replica set and synthetic fixtures.                                                                         |
| `npm run lint`                                                                      | PASS, exit 0                                         | Biome checked 169 source/test files.                                                                                       |
| `npm run typecheck`                                                                 | PASS, exit 0                                         | TypeScript.                                                                                                                |
| `npm run build`                                                                     | PASS, exit 0                                         | Next.js production build; admin, invite, API and worker routes compiled.                                                   |
| `uv run python -m unittest discover -s tests -v` (`worker/`)                        | PASS, 18 tests                                       | Synthetic fixtures and mocked model response; includes accepting an exact reference and rejecting a string-only reference. |
| `npm run test:workflow:local` with `.env.test.example` and the local worker         | PASS, exit 0                                         | Full synthetic browser/API/database/worker workflow; no production services or records.                                    |
| Worker interpretation log                                                           | PASS, `resultStatus=awaiting_review`, `claimCount=1` | Actual local `qwen2.5:7b` inference against the synthetic workflow question.                                               |
| Worker report-scan log                                                              | PASS, `verdict=clean`                                | Synthetic uploaded PDF scanned by local ClamAV `1.5.4/28164`.                                                              |
| `git diff --check`                                                                  | PASS, exit 0                                         | Current worktree.                                                                                                          |

The answer is source-backed but remains `awaiting_review`; it is not shown as an approved personal explanation. The test establishes that the model now returns a valid claim with a source reference through the local worker path. It does not test Habi over Funnel: the worker and Ollama are on the same Mac and use loopback, while the existing public Funnel belongs to the separate ClassScout Ollama gateway. The temporary app and worker were stopped after the run; the pre-existing local synthetic MongoDB process was left running.

## T-HG-136 · Production Habi workspace and admin release candidate · 2026-10-26

The production target remains Vercel project `narimato/habi`, with `https://habigoal.com` as the canonical Habi product origin. The release switches the hosted runtime to `role-workflow`, replaces the root legacy diary view with the Habi role workspace, and makes `/admin` the separate SSO-admin-only console. The owner has stated that legacy records do not need to be migrated. No old records are deleted by this release.

The admin console includes an explicit, idempotent “Prepare Habi MVP” action. After the verified DoneIsBetter account has the Habi `admin` permission, it applies the versioned additive schema migrations and creates tenant `habi` only if absent, with the two clearly named MVP draft policy references. It does not overwrite a tenant with different policy references. The owner selected draft policies for MVP review and stated GDPR is not a blocker for MVP functional testing; these references do not claim legal approval or configure a final retention/controller decision.

| Check                                                                               | Result                      | Scope                                                                                    |
| ----------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 120 tests, 0 failures | Isolated local replica set; synthetic records only.                                      |
| `npm run lint`                                                                      | PASS, exit 0                | Biome checked 172 files.                                                                 |
| `npm run typecheck`                                                                 | PASS, exit 0                | TypeScript.                                                                              |
| `npm run build`                                                                     | PASS, exit 0                | Next.js production build includes `/`, `/admin`, bootstrap, invitation and claim routes. |
| `uv run --frozen python -m unittest discover -s tests -v` (`worker/`)               | PASS, 18 tests              | Worker contract and local model-runtime fixtures.                                        |
| `git diff --check`                                                                  | PASS, exit 0                | Current worktree.                                                                        |

Historical release candidate note. The completed production checks and remaining admin action are recorded in T-HG-137.

## T-HG-137 · Production release, local worker and admin reauthentication · 2026-10-26

Production commit `f3b2cc1` is deployed to `https://habigoal.com`. The root serves the new role workspace and `/admin` serves the separate SSO-admin console. Legacy diary data does not need to be moved; this release does not delete it.

| Check                                                                               | Result                      | Evidence/scope                                                                                                                                           |
| ----------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                      | PASS, exit 0                | Biome checked 172 source/test files.                                                                                                                     |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 120 tests, 0 failures | Isolated local Mongo replica set; synthetic data.                                                                                                        |
| `npm run build`                                                                     | PASS, exit 0                | Next.js production build includes `/admin` and the Habi workspace.                                                                                       |
| `uv run --frozen python -m unittest discover -s tests -v` (`worker/`)               | PASS, 18 tests              | Worker contract/runtime unit tests.                                                                                                                      |
| Worker `verify-local`                                                               | PASS                        | Qwen `qwen2.5:7b`, expected local model digest and prompt hash verified without printing credentials.                                                    |
| Production `GET /`, `GET /admin`, `GET /api/health`, `GET /api/ready`               | PASS, HTTP 200              | Vercel production domain and deployment `dpl_3tjGFXU3QfoUMao7ZqvxzGPqFC7E`.                                                                              |
| Production SSO sign-in route                                                        | PASS                        | Admin reauthentication link includes `prompt=login`, returns to `/admin`, and opens the DoneIsBetter login screen. No password was entered by the agent. |
| Local Mac LaunchAgent                                                               | PASS, running               | `com.doneisbetter.habi-worker`; logs show hosted mode and model verification. Initial missing Homebrew PATH was corrected in the launch script.          |
| Hosted worker claim API                                                             | PASS, HTTP 204              | Vercel request logs show repeated authenticated `POST /api/v1/worker/jobs/claim`; 204 means the worker is connected and no eligible work was waiting.    |

The admin screen previously showed an access-denied state without a way to reauthenticate. It now explains that the current SSO account lacks the Habi admin claim and provides **Újra bejelentkezem adminisztrátorként**, which requests a fresh DoneIsBetter login and returns to `/admin`. In the managed browser, `/admin` currently renders the sign-in option. A successful admin SSO login, tenant bootstrap, first invitation and role claim remain pending the owner completing sign-in as the DoneIsBetter account with the Habi `admin` permission. No Production tenant or role records were created by anonymous checks; no legacy records were modified.

## T-HG-138 · First-login SSO migration deadlock · 2026-10-26

The owner reported `INTERNAL_ERROR` for callback request `bdb24b20de75383486ecb60c09264dc3`. Vercel logs mapped it to Production `GET /api/oauth/callback` at `2026-10-26T14:53:48Z`. The session writer had begun storing the verified issuer, subject, and Habi permission role, while the Production Mongo validator still required migration 011. Since 011 had been gated behind successful admin login, the callback could not finish the login required to run that migration.

The callback now runs the two ordered, versioned session prerequisites after OIDC identity and Habi permission validation, but before creating the identity link or session. It does not run the full migration set, create tenant `habi`, assign roles, or import/delete old records. Migration selection rejects duplicate or unknown IDs; migration checksums and normal idempotency remain enforced. The tenant bootstrap remains an explicit admin action after login.

| Check                                                                               | Result                                                                                           | Environment                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `npm run lint`                                                                      | PASS, exit 0; 172 files                                                                          | Local                                                                           |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 121 tests, 0 failures; includes the isolated callback-prerequisite schema/idempotency case | Disposable local Mongo replica set                                              |
| `npm run typecheck`                                                                 | PASS, exit 0                                                                                     | Local                                                                           |
| `npm run build`                                                                     | PASS, exit 0; callback and admin routes included                                                 | Local production build                                                          |
| Production deployment `dpl_5CAdY57PGmJEYVucP8UwXfeuiRQo`                            | READY; commit `0c58afd`                                                                          | Vercel Production project `narimato/habi`; aliased to `https://habigoal.com`    |
| Production `GET /`, `/admin`, `/api/health`, `/api/ready`                           | PASS, HTTP 200                                                                                   | `https://habigoal.com`                                                          |
| Production callback without a login transaction                                     | PASS, HTTP 303 to `/?signin=failed`                                                              | Expected fail-closed response; does not prove a real SSO login                  |
| Live authenticated SSO callback                                                     | Not yet re-verified                                                                              | Requires the owner to complete DoneIsBetter sign-in after Production deployment |

Rollback is an application deployment rollback only. Keep applied additive migration records and collections; do not delete migration ledger entries or old diary data.

## T-HG-139 · Repeated SSO callback denial · 2026-10-26

After the owner reported a sign-in loop, Production logs showed repeated `/api/oauth/callback` responses with `APP_PERMISSION_DENIED` (including request IDs `72qkx-1793027975355-e3c1b2446055`, `26st9-1793027967982-72a70b52cf72`, and `fcmrk-1793027953590-5c308d3d1262`). These callbacks returned 303 without creating an owner session. Subsequent `/api/admin/me` and `/api/v1/me` requests correctly returned 401. The callback is rejecting the identity because the DoneIsBetter permission check does not report an approved Habi app permission; this is not a Mongo migration error.

The callback now returns to the original safe same-origin page with a fixed failure code. An `/admin` sign-in attempt returns to `/admin`, where the UI explains that DoneIsBetter must grant this account Habi access and the `admin` permission before retrying. Authorization remains fail-closed; no email allowlist or fallback role was added. This UI fix cannot grant the external SSO permission.

| Check                                                                               | Result                            | Environment                                                  |
| ----------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| `npm run lint`                                                                      | PASS, exit 0; 172 files           | Local                                                        |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 121 tests, 0 failures       | Disposable local Mongo replica set                           |
| `npm run typecheck`                                                                 | PASS, exit 0                      | Local                                                        |
| `npm run build`                                                                     | PASS, exit 0                      | Local production build                                       |
| DoneIsBetter app permission for the owner                                           | BLOCKED; provider returned denial | Must be granted in DoneIsBetter before another login attempt |

## T-HG-140 · Visible sign-in denial and account switch · 2026-10-26

The owner showed that Production was landing on `/?signin=failed&reason=APP_PERMISSION_DENIED`, while the root role workspace ignored that query state. The page therefore displayed only the ordinary sign-in card and offered no account-switch or local sign-out action.

The root and admin sign-in screens now render a prominent, accessible permission-denied message; offer a DoneIsBetter account selector (`prompt=select_account`); retain explicit retry; and provide **Kilépés a Habiból**, which clears Habi-local sessions/cookies. Local Habi sign-out does not claim to end the user's separate DoneIsBetter provider session. The access decision remains fail-closed. Unit coverage verifies the account-selection prompt in the generated authorization request.

## T-HG-141 · Restore the accepted metro UI across the app · 2026-10-26

The owner reported that pages were missing the accepted UI elements. The accepted CSS tokens and motif existed, but the signed-in history screen rendered a flat list rather than the approved relationship-aware metro route, and the current player identity was not consistently visible. The workspace now renders a responsive, keyboard-operable route from the authorized timeline's actual process, reply, relation, and edge data; marks events with the submitting role; and lets the user inspect each event. It identifies the selected player by name when provided and always shows the full player ID. Parent/coach roster selection is explicit. Admin and invitation claim pages now carry the same role badges and route motif; admin invitations collect the player's display name.

The player name is optional, additive data. Migration 012 updates the strict player/invitation validators without rewriting existing player documents. Existing records are retained. No timezone prompt is shown in the invite UI.

| Check                                                                          | Result                                                                                   | Environment                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `npm run lint`                                                                 | PASS, exit 0; 178 files                                                                  | Local                                                     |
| `npm run typecheck`                                                            | PASS, exit 0                                                                             | Local                                                     |
| `npm run build`                                                                | PASS, exit 0; `/`, `/admin`, `/invite/claim`, player roster and timeline routes included | Local production build                                    |
| `git diff --check`                                                             | PASS, exit 0                                                                             | Local                                                     |
| Authenticated player save / browser visual review at mobile and desktop widths | Not verified in this change                                                              | Requires an authenticated Habi account and browser review |

The build emitted two `player.list` `INTERNAL_ERROR` log entries while statically generating pages, although it completed successfully and included `/api/v1/players` as a dynamic route. This is not evidence of a successful live roster request and needs runtime verification after deployment.

| Production check                                                | Result                                                                                 | Environment                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Deployment `dpl_142xeVFejXbDh1wms96D7F8vvTjT`                   | READY; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com` | Vercel project `narimato/habi`, Production                                     |
| `GET /`, `/admin`, `/invite/claim`, `/api/health`, `/api/ready` | PASS, HTTP 200                                                                         | `https://habigoal.com`                                                         |
| Anonymous `GET /api/v1/players`                                 | PASS, HTTP 401                                                                         | Expected authentication boundary                                               |
| Production signed-out home and admin gate                       | Rendered in browser; both show the updated Habi presentation and sign-in path          | Desktop browser, unauthenticated                                               |
| Authenticated roster, event graph and save flow                 | Not verified                                                                           | Requires an authorized Habi role session; anonymous checks cannot establish it |

## T-HG-142 · Switch among granted player, parent and coach roles · 2026-10-26

The owner needs one verified Habi identity to act in each role assigned to that identity. `GET /api/v1/me` now returns the caller's active, same-tenant memberships and linked player labels. The workspace shows a role/player selector only when more than one valid membership exists. `POST /api/v1/me/scope` accepts a membership ID plus its player ID, never a client-selected role or tenant. In one Mongo transaction it verifies the membership and player, updates the active session scope, and records a body-bound idempotency receipt. The existing SSO/session cookie is kept; following the switch, the client clears old player data and reloads the new role's authorized roster. No invitation or role was created for the owner during this change.

The player-list `GET` route now explicitly uses request-time headers. Before this, local Next static generation attempted to execute its database-backed GET route and logged `player.list` internal errors; with the runtime API in place the production build completes without those errors.

| Check                                                    | Result                                                                                                   | Environment                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `npm run lint`                                           | PASS, exit 0; 179 files                                                                                  | Local                                                     |
| `npm run typecheck`                                      | PASS, exit 0                                                                                             | Local                                                     |
| `npm run build`                                          | PASS, exit 0; includes `/api/v1/me/scope`; no `player.list` error logs                                   | Local production build                                    |
| `git diff --check`                                       | PASS, exit 0                                                                                             | Local                                                     |
| Production deployment `dpl_21BGsq415UboqUcdmnqiCGDnAZ2L` | READY; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`; commit `dc52ef0` | Vercel project `narimato/habi`, Production                |
| `GET /`, `/admin`, `/api/health`, `/api/ready`           | PASS, HTTP 200                                                                                           | `https://habigoal.com`                                    |
| Anonymous `GET /api/v1/me/scope`                         | PASS, HTTP 405; route is POST-only                                                                       | `https://habigoal.com`                                    |
| Authenticated switch among multiple memberships          | Not yet verified                                                                                         | Requires an identity with at least two active memberships |

## T-HG-144 · Enter an assigned role workspace from SSO admin landing · 2026-10-26

The production admin landing showed the user's memberships as labels, without an action to start a role session. It now presents readable role cards and a **Belépés ebben a szerepben** button for every active membership. The button calls `POST /api/identity/activate-role`; the server derives the role, actor, tenant and player scope from the verified SSO identity and stored membership, then issues the Habi session cookie. Visible cards omit raw internal IDs. The in-workspace selector continues switching among memberships after entry.

| Check                                                     | Result                                                                                                   | Environment                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `npm run lint`                                            | PASS, exit 0                                                                                             | Local                                                   |
| `npm run typecheck`                                       | PASS, exit 0                                                                                             | Local                                                   |
| `npm run build`                                           | PASS, exit 0; includes `/api/identity/activate-role`                                                     | Local production build                                  |
| API contract manifest digest/version                      | PASS; API contract `2.4.12` matches its manifest                                                         | Local                                                   |
| Production deployment `dpl_CjEtdER6xdD7752YJjEUCuzYpVFi`  | READY; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`; commit `0551059` | Vercel project `narimato/habi`, Production              |
| `GET /`, `/admin`, `/api/health`                          | PASS, HTTP 200                                                                                           | `https://habigoal.com`                                  |
| `GET /api/identity/activate-role`                         | PASS, HTTP 405; route is POST-only                                                                       | `https://habigoal.com`                                  |
| Anonymous valid-shaped `POST /api/identity/activate-role` | PASS, HTTP 401                                                                                           | Expected SSO authentication boundary                    |
| Authenticated role activation and workspace entry         | Not yet verified                                                                                         | Requires the owner's authenticated DoneIsBetter session |

## T-HG-145 · Use verified SSO name and keep role/profile UI readable · 2026-10-26

The OIDC callback previously verified the SSO `userinfo.sub` but discarded the verified `name`; the player workspace consequently rendered “Név nincs megadva” and exposed internal player IDs in the selector and profile. The callback now prefers the verified userinfo name, falls back to the verified ID-token `name` claim, and fills only a blank player profile owned by that same Habi actor. It does not rename a parent-linked child and it does not overwrite an existing player display name. A subsequent SSO login is required to populate an already-existing blank profile. The UI shows readable role/player labels without database IDs. The metro route marker is now laid out inline with its role label instead of absolutely overlapping compact panels.

| Check                                            | Result                                                                                                                     | Environment                                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --test tests/browser-sso-session.test.mjs` | PASS, 6 tests; includes verified-name sync and revision increment                                                          | Local                                                                                                                                         |
| `npm run lint`                                   | PASS, 180 files                                                                                                            | Local                                                                                                                                         |
| `npm run typecheck`                              | PASS                                                                                                                       | Local                                                                                                                                         |
| `npm run build`                                  | PASS; Next.js production build                                                                                             | Local                                                                                                                                         |
| `git diff --check`                               | PASS                                                                                                                       | Local                                                                                                                                         |
| Git commit                                       | `485c167` pushed to `main`                                                                                                 | GitHub `moldovancsaba/habi`                                                                                                                   |
| Production deployment                            | READY, `dpl_FvyXCT5DUWc7swQhM2P3K6W4nR2p`; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com` | Vercel project `narimato/habi`, Production                                                                                                    |
| `GET /`, `/admin`, `/api/health`                 | PASS, HTTP 200                                                                                                             | `https://habigoal.com`                                                                                                                        |
| Authenticated name display after fresh SSO login | Pending                                                                                                                    | The owner must log out and sign in again; a logged-in role session cannot expose the provider name that was discarded by the earlier callback |

## T-HG-143 · Show own roles and request a self-invitation · 2026-10-26

The signed-in administrator landing page now displays the active player, parent, and coach memberships attached to the verified SSO identity. The admin page also shows those roles and offers a self-invitation form for a missing role. It uses the existing admin-only invitation route; the new membership is not active until the administrator opens and accepts the single-use invite while signed in with the same verified identity. Parent invitations require selecting an existing player. Player invitations create a player profile using the name entered. An already-active identical role/scope is disabled.

| Check                                                    | Result                                                                                                   | Environment                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `npm run lint`                                           | PASS, exit 0; 179 files                                                                                  | Local                                            |
| `npm run typecheck`                                      | PASS, exit 0                                                                                             | Local                                            |
| `npm run build`                                          | PASS, exit 0; `/api/admin/me` remains request-time                                                       | Local production build                           |
| `git diff --check`                                       | PASS, exit 0                                                                                             | Local                                            |
| Production deployment `dpl_8uQJGbesdyT16hXgAEDvAKMiGHk2` | READY; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`; commit `4973a35` | Vercel project `narimato/habi`, Production       |
| `GET /`, `/admin`, `/api/health`, `/api/ready`           | PASS, HTTP 200                                                                                           | `https://habigoal.com`                           |
| Anonymous `GET /api/admin/me`                            | PASS, HTTP 401                                                                                           | Expected authentication boundary                 |
| Logged-in account role display and invitation claim      | Not yet verified                                                                                         | Requires the owner's authenticated admin session |

# Parent question feedback and result visibility · 2026-10-26

- The production parent workspace previously placed the missing-check-in message in a page-level notice and discarded the `jobId` returned after question submission. The prerequisite is now explained beside the question field, and the send button stays disabled until the player has a visible daily check-in.
- After a question is accepted, success and error feedback remains beside the form. The result card is scrolled into view after submit and again when the job changes state or the answer becomes available.
- The workspace polls the existing authorized job-status endpoint, retries temporary network and server errors without marking the request failed, then fetches the interpretation. It shows queued, processing, coach-review, approved-answer, no-evidence, and terminal-error states in the same card. Authentication or access failures stop polling and explain the recovery action.
- Observation save feedback is also displayed beside its form. No API or data contract changed.

| Check                                                                        | Result                                                                                                           | Environment                                                                                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                               | PASS, exit 0                                                                                                     | Local Habi checkout; Biome, 180 files.                                                                                     |
| `npm run typecheck`                                                          | PASS, exit 0                                                                                                     | Local Habi checkout; TypeScript.                                                                                           |
| `npm run build`                                                              | PASS, exit 0                                                                                                     | Local Habi checkout; Next.js 16.4.3 production build.                                                                      |
| `git diff --check`                                                           | PASS, exit 0                                                                                                     | Local Habi checkout.                                                                                                       |
| Production release `cc980a1`                                                 | READY, deployment `dpl_5hetheSBra3EnHu1r1ecKK2DpiZJ`; aliases include `habigoal.com` and `habi.doneisbetter.com` | Vercel project `narimato/habi`, Production.                                                                                |
| `GET /`, `/api/health`, `/api/ready`                                         | PASS, HTTP 200                                                                                                   | `https://habigoal.com`; health and Atlas readiness confirmed.                                                              |
| Production error log scan, previous hour                                     | 7 errors, all `POST /api/v1/me/scope` returned 500; no question-flow verification evidence                       | Vercel project `narimato/habi`, Production. Role-scope errors are outside this UI change and remain an open investigation. |
| Authenticated parent question → local worker → coach review → visible answer | Pending                                                                                                          | Requires an active parent session, an available daily check-in, a running worker, and authorized coach review.             |

## Admin action button alignment · 2026-10-26

- Wrapped the admin landing page’s “open admin” and “request role” actions in a shared flex row with a consistent 12 px gap. At mobile widths, the actions stack with full-width buttons. This removes the touching/overlapping appearance in the owner’s screenshot.
- Local checks: `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- Production: commit `fdaa7ea` is Ready as deployment `dpl_8uezJLafqcpUVzkhGQp3h6DydWpK`, aliased to `habigoal.com`; live `/` and `/api/health` returned HTTP 200.

## Restore legacy tasks and coach survey entry · 2026-10-26

- The signed-in workspace now links **Feladatok és visszajelzések** to `/legacy`; a Next rewrite serves the existing legacy app at that exact URL. The `/api/app` read/write route uses the verified SSO owner while the hosted runtime is in `role-workflow` mode. No historical browser data is imported.
- The coach overview for the selected player includes **Kérdőívek és eredmények**: upload PDF up to 10 MB, wait for the local ClamAV result, enter field name/page/original value/unit, then review and approve the entered values. Tenant-level coach scope is now honored by upload access, report scan context, extraction creation, and publication checks; student and parent scope checks remain tenant/player-bound.
- `npm run test:workflow:local` | PASS, exit 0 | Isolated localhost Mongo replica set, synthetic actors only; covered a coach-originated upload, clean scan, manual extraction and approval, plus the complete role workflow.
- `npm test` | PASS, exit 0; 115 passed, 1 skipped | Local unit/domain/contract suite; the skipped case requires the optional Atlas test URI.
- `npm run lint` | PASS, exit 0 | Biome, 182 files.
- `npm run typecheck` | PASS, exit 0 | TypeScript.
- `npm run build` | PASS, exit 0 | Next.js 16.4.3 production build.
- `cd worker && uv run --frozen python -m unittest discover -s tests -v` | PASS, exit 0; 18 tests | Worker config, local Ollama contract and service runtime tests.
- `GET http://127.0.0.1:3000/legacy` | PASS, HTTP 200 | Local test app; exact user-facing path.
- `git diff --check` | PASS, exit 0 | Local Habi checkout.
- Production commit `97bc8ed39d1fd9494d611e4b44632b1c6da17afc` is Ready as deployment `dpl_EXrhgg1fAA41WpGBybn6huYjgoRA` in Vercel project `narimato/habi`; aliases include `habigoal.com` and `www.habigoal.com`.
- Live unauthenticated route checks: `GET /`, `/legacy`, `/api/health`, and `/api/ready` all returned HTTP 200 at `https://habigoal.com`. The homepage shows the DoneIsBetter sign-in entry. A signed-in Production report upload was not performed in this check; the matching authenticated coach flow was exercised against the isolated synthetic local stack above.

## Timeline question story, event times, and role-switch receipt · 2026-10-26

- The workspace now repeats the submitted question in the result card after the input clears. It refreshes the authorized timeline after submission and completion.
- Timeline message events include the actual question text. A completed `no_evidence` interpretation is shown to its authorized parent and coach as a separate linked event with the explicit result; no conclusion is invented. Other nonapproved personal answers remain hidden from parents.
- Timeline cards show the event's date and hour/minute. The value is derived from the persisted event timestamp; no timezone preference or setting was introduced.
- Production `POST /api/v1/me/scope` was returning `INTERNAL_ERROR`: the idempotency receipt omitted the required reference revision. The receipt now carries the active membership revision.
- API contract 2.4.13 now points the timeline operation at the exact response DTO schema, which permits the optional event summary. Manifest digests are updated.

| Check                                                                                           | Result                                                                                                                                | Environment                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                                  | PASS, exit 0; 183 files                                                                                                               | Local Habi checkout                                                                                                                      |
| `npm test`                                                                                      | PASS, exit 0; 116 passed, 0 failed, 1 Atlas-only skip                                                                                 | Local Habi checkout; no isolated Atlas test URI configured                                                                               |
| `npm run typecheck`                                                                             | PASS, exit 0                                                                                                                          | Local Habi checkout                                                                                                                      |
| `npm run build`                                                                                 | PASS, exit 0                                                                                                                          | Local Habi checkout; Next.js production build                                                                                            |
| `git diff --check`                                                                              | PASS, exit 0                                                                                                                          | Local Habi checkout                                                                                                                      |
| Targeted timeline regression                                                                    | PASS; parent question and no-evidence result are separate, linked events                                                              | Local test with synthetic records                                                                                                        |
| Production deployment for code commit `254667b`                                                 | READY; deployment `dpl_BZM4aSgnpfwDMhTbUKDGjrJ1NCD8`; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com` | Vercel project `narimato/habi`, Production                                                                                               |
| `GET /api/health`, `/api/ready`, `/api/v1/timeline`, `GET /api/v1/me/scope`                     | PASS: 200, 200, 401, 405 respectively                                                                                                 | `https://habigoal.com`; unauthenticated access boundaries are expected                                                                   |
| Production runtime errors for `/api/v1/me/scope` after release                                  | None found in the 30-minute window                                                                                                    | Vercel project `narimato/habi`; no authenticated switch attempt occurred in that window                                                  |
| Authenticated question → worker no-evidence result → timeline reload, and signed-in role switch | Not yet verified end-to-end                                                                                                           | Requires the owner's authenticated session and a live local worker; no authenticated browser session was available for this verification |


## Natív feladatok/visszajelzések és szerepkör-kérelem · 2026-10-26

- A `/legacy` átmeneti URL most a natív munkaterületi nézetre irányít. Mindhárom szerepköri munkaterületen natív **Feladatok és visszajelzések** nézet van. A nézet a kiválasztott játékos jogosultságával olvassa a terveket és utánkövetéseket; a javasolt terv elfogadható vagy elutasítható, az aktív feladathoz időbélyeges visszajelzés menthető. A tervhez kötött visszajelzés az idővonal eseményei közé kerül.
- A hozzáférés nélküli, SSO-val bejelentkezett felhasználó kiválaszthatja a játékos/szülő/edző szerepkört és kérelmet küldhet. Az adminisztrátor áttekinti, szükség esetén játékost kapcsol hozzá, majd a meghívót a pontos SSO-identitáshoz köti. Az önkérelem nem ad automatikus szerepkört.
- Az új `013-role-requests` migráció az admin „Adatbázis frissítése” műveletén keresztül hozza létre a kérelmi kollekciót/sémát/indexet és bővíti a meghívó validátorát. Ezt a production DB-migrációt még nem futtattuk.
- Helyi ellenőrzés, Habi repository, 2026-10-26: `npm run lint` — PASS, exit 0; `npm test` — PASS, 117 passed / 0 failed / 1 skipped (izolált Atlas replica-set URI nélkül); `npm run typecheck` — PASS, exit 0; `npm run build` — PASS, exit 0. `npm run test:workflow:local` — BLOCKED, exit 1, mert a környezet `LOCAL_TEST_MIGRATION_ONLY` értékkel tiltja a workflow-szkriptet; adatbázis-reset nem történt. Hosted SSO, production DB-migráció és böngészős vizuális próba nincs igazolva.
- Visszaállítás: a kód visszaállítható és a Vercel korábbi deploymentje aktiválható. A 013-as migráció előrefelé kompatibilis; alkalmazás rollback esetén az új kollekció és index érintetlenül marad, kézi adat-visszaírás nem szükséges.

## Native player legacy workflows · 2026-10-26

The signed-in player workspace now exposes the five versioned legacy practices, durable practice feedback, player-owned goals with closure, simple routines with once-per-local-day completion, the three-prompt monthly reflection, four deterministic authored situation conversations, a private trusted-adult preparation note, and a 14/28/42-day view of actual completed check-in answers. The legacy redirect now selects these native features for a player; parent/coach roles land in native task feedback. The player entries use the existing SSO-authorized diary record endpoint and appear in the same player history. No old browser-owned data is imported.

This is a functional migration slice, not complete legacy parity. Durable records are diary entries rather than independent practice/goal/reflection domain entities. Continued drafts, old day-by-day archive, old text trend narrative, reminders/settings, HABI2, and full daily-context guided support remain unimplemented. The separate pain-support route is delivered; see its verification record below.

| Check                                           | Result                                                                                                                        | Environment                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `npm run typecheck`                             | PASS, exit 0                                                                                                                  | Local Habi checkout                              |
| `npm run lint`                                  | PASS, exit 0                                                                                                                  | Local Habi checkout; Biome, 187 files            |
| `npm test`                                      | PASS, 117 passed, 0 failed, 1 Atlas-only integration test skipped                                                             | Local Habi checkout; no isolated replica-set URI |
| `npm run build`                                 | PASS, exit 0                                                                                                                  | Local Habi checkout; Next.js production build    |
| `git diff --check`                              | PASS, exit 0                                                                                                                  | Local Habi checkout                              |
| Authenticated browser interaction on production | Not yet verified                                                                                                              | Requires the owner's active SSO session          |
| Production deployment for task/goal commit `5eb91d2` | READY; deployment `dpl_3bjexYAF8gUdfHD7Mbp8detdMYrs`; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com` | Vercel project `narimato/habi`, Production |

## Player task and goal workflows · 2026-10-26

- The player can select one of three self-chosen next steps tied to the most recently completed check-in, then record completion. The task does not invent advice from answers and duplicate selection/completion is prevented in the client by checking the durable event log.
- Player-owned goals now support edit, pause/resume, reflection, continue as a habit, and close. Every change is appended as a new diary record so earlier goal text and decisions remain in history. These are user-visible working operations, but the underlying records are still diary entries rather than a dedicated goal entity.
- Verification on the local Habi checkout: `npm run typecheck` PASS; `npm run lint` PASS (187 files); `npm test` PASS (117 passed, 0 failed, 1 Atlas-only skip); `npm run build` PASS; `git diff --check` PASS. The suite is repository-level; no production SSO interaction was performed.
- Production route verification after this release: `GET https://habigoal.com/legacy` redirects to `/?view=legacy` and the destination returns HTTP 200. An authenticated Production interaction was unavailable in this check.

## Player pain-support route · 2026-10-26

- The player tools now include a three-step, optional pain-support conversation based on the preserved Habi content. It helps a young athlete put location, timing, and activity context into their own words and tells them not to repeat a painful movement just to complete an exercise. The close-out encourages asking a trusted adult for help, especially if pain is strong or worsening.
- This route is not a diagnosis, treatment plan, or AI prompt. The composed sentence remains on screen only; it is not saved in the shared diary and is not sent to anyone. The guidance was checked against the preserved Habi copy and the [NHS young-person return-to-sport leaflet](https://www.wsh.nhs.uk/CMS-Documents/Patient-leaflets/Physiotherapy/6579-1-Return-to-sport-post-injury-top-tips-for-young-people.pdf), accessed 2026-10-26.
- Verification on the local Habi checkout: `npm run typecheck` PASS; `npm run lint` PASS (187 files); `npm test` PASS (117 passed, 0 failed, 1 Atlas-only integration test skipped); `npm run build` PASS; `git diff --check` PASS.
- Production deployment for commit `ecd9c8f`: READY; deployment `dpl_AErq8YT2RvK9B5YgWuiCjbTXvHGe`; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. `/legacy` redirects to the native workspace and it returns HTTP 200.
- Limitation: authenticated interaction with the deployed player flow was not performed in an owner browser session.

## Player daily and weekly reflections · 2026-10-26

- The player can choose a daily reflection (two prompts) or weekly reflection (three prompts), leave individual prompts unanswered, and save the completed reflection to the authenticated player diary. Saved entries appear in the reflection history with date and time.
- Verification on the local Habi checkout: `npm run typecheck` PASS; `npm run lint` PASS; `npm test` PASS (117 passed, 0 failed, 1 Atlas-only integration test skipped); `npm run build` PASS; `git diff --check` PASS.
- Limitation: drafts remain in the current page until submitted and do not yet resume after refresh. Authenticated production interaction requires an owner SSO browser session.

## Player 16-question monthly reflection · 2026-10-26

- Restored the original 16 authored monthly questions from the preserved Habi content. The player answers one question at a time, can go back, explicitly skip or select “not applicable,” reviews all 16 answers, optionally records a next-month focus and a note, then saves the complete versioned response to the authenticated diary. The app does not create an interpretation, score, or recommendation from these answers.
- Content is pinned in `src/lib/content/monthly-reflection-v1.json`; the record title includes its content version. Drafts do not yet resume after a full page reload.
- Verification on the local Habi checkout: `npm run typecheck` PASS; `npm run lint` PASS (188 files); `npm test` PASS (117 passed, 0 failed, 1 Atlas-only integration test skipped); `npm run build` PASS; `git diff --check` PASS.
- Production deployment and authenticated browser interaction are pending this change's release.

## Player reminder preferences · 2026-10-27

- The player can opt into a morning check-in reminder and an evening reflection reminder, set both times, and save those preferences to the authenticated player diary. The reminder is shown only while the app is open; it does not issue device, email, or WhatsApp notifications. A same-day dismissal is stored so the prompt does not keep returning after the page reloads. There is no timezone setting in the UI.
- Verification on the local Habi checkout: `npm run typecheck` PASS; `npm run lint` PASS (188 files); `npm test` PASS (117 passed, 0 failed, 1 Atlas-only integration test skipped); `npm run build` PASS; `git diff --check` PASS.
- Limitation: this first version uses the diary record store for preferences and only reads the initial records page on load; a dedicated settings endpoint is still needed to make preference lookup independent from diary pagination. Authenticated production interaction is pending this release.

## Structured monthly reflection persistence · 2026-10-27

- Added a versioned `monthly_reflections` domain collection with a unique player/month constraint and an API for authorized reads. Finalizing the 16-question reflection writes its structured response and complete question/answer timeline record in one transaction, then removes the matching draft. Repeated identical submissions are idempotent; conflicting or stale submissions do not create a second result. The form requires all questions to be answered, explicitly skipped, or marked not applicable.
- The timeline record preserves the original questions, answers, authored content version, optional focus and note, and submission timestamp. No score, trend, diagnosis, or generated recommendation is produced.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs node --test tests/database-persistence.test.mjs` — PASS, exit 0; 16 tests, including real migration, transaction, replay, timeline linkage, and draft removal against the disposable local replica set.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 162 passed, 0 failed, 0 skipped.
- `npm run lint` — PASS, exit 0; Biome checked 211 files. `npm run typecheck` — PASS, exit 0. `npm run build` — PASS, exit 0; includes `/api/v1/players/[playerId]/monthly-reflections`. `git diff --check` — PASS, exit 0.
- Environment: local Habi checkout, disposable localhost MongoDB replica set `habiTestRs`, synthetic identities and responses only. No Production records or user sessions were used. Migration `015-monthly-reflections` must be applied through the authenticated `/admin` database update before relying on this workflow in Production. No authenticated Production write has been verified.
- The source commit `3ec2b613e069e192255e8eed75a202e609426f84` reached the `narimato/habi` Production target as deployment `habi-f0iq49ded-narimato.vercel.app` (READY). `https://habigoal.com/` returned HTTP 200; the new unauthenticated monthly-reflection API returned HTTP 401 `AUTHENTICATION_REQUIRED`, confirming the route is live and protected. This is not proof of an authenticated write or applied database migration.
- Rollback: redeploy the preceding application version. The migration is additive; retain the collection, indexes, and migration ledger entry. Existing records are not rewritten or deleted.

## Resumable reflection drafts · 2026-10-27

- Added the player-only `GET`, `PUT`, and `DELETE /api/v1/players/{playerId}/drafts/{draftKey}` API for daily, weekly, and monthly reflection drafts. Writes use an idempotency key and `expectedRevision`; draft reads and writes require the exact active player identity and membership. Parent and coach roles cannot read or edit these private drafts.
- Added the `habi_experience_drafts` persistence contract and migration `014-experience-drafts`, including a unique draft key per tenant/player/actor and strict content-version-specific payload validation. Daily and weekly drafts save on request; each monthly answer autosaves its answer and next step. Finished reflections remove their corresponding draft.
- UI communicates draft loading/saving state and restores saved answers after reload. Older or unknown content versions are not silently applied.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs node --test tests/database-persistence.test.mjs` — PASS, exit 0; 15 tests, including the real local replica-set migration and draft persistence/revision/role-isolation checks.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 138 passed, 0 failed, 0 skipped.
- `npm run lint` — PASS, exit 0; Biome checked 192 files.
- `npm run typecheck` — PASS, exit 0.
- `npm run build` — PASS, exit 0; Next.js 16.4.3 build includes `/api/v1/players/[playerId]/drafts/[draftKey]`.
- `git diff --check` — PASS, exit 0.
- Environment: local Habi checkout, disposable localhost MongoDB replica set `habiTestRs`, synthetic accounts and payloads only. No Production records or user sessions were used.
- Production commit `1d097167642a064114d162f1a35258740310c10d` — READY as deployment `dpl_3Cea7WCqacmV4qMYc9CVs14tZ84b` in project `narimato/habi`; aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`.
- Live unauthenticated checks: `/`, `/admin`, `/?view=legacy`, `/api/health`, `/api/ready` — HTTP 200; `/legacy` — HTTP 307 to `/?view=legacy`; `GET /api/v1/players/test-player/drafts/daily-reflection` — HTTP 401 as required by the session boundary. An authenticated Production draft interaction was not performed.
- A verified Habi admin must run `/admin` → **Adatbázis frissítése** and confirm migration `014-experience-drafts`; until then, Production draft persistence is not ready. PDF malware-scan acceptance still requires an available ClamAV worker and is outside this draft test.

## Resumable player support conversations · 2026-10-27

- The four authored, three-step player situation conversations now save the selected situation and answers to the same player/SSO-owned draft API after each choice. **Később folytatom** pauses the screen without discarding the draft; reopening the page restores the paused conversation; **Beszélgetés elvetése** clears it; completing the dialogue saves its transcript to the player diary and clears the draft.
- Draft writes include the session-bound CSRF token, idempotency key, expected revision, and the `guided-situation-v1` content version. The server accepts only the four shipped situation IDs and zero-to-three choice indexes in range; parent and coach access remains denied. The accepted API version is 2.4.17, API schema version 2.4.12, and persistence schema snapshot version 2.4.4.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs node --test tests/database-persistence.test.mjs` — PASS, exit 0; 15 tests, including create/read/delete of a guided-conversation draft against the isolated local replica set.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 139 passed, 0 failed, 0 skipped.
- `npm run lint` — PASS, exit 0; Biome checked 192 files. `npm run typecheck` — PASS, exit 0. `npm run build` — PASS, exit 0; includes the existing authenticated player draft route. `git diff --check` — PASS, exit 0.
- Environment: local Habi checkout, disposable localhost MongoDB replica set `habiTestRs`, synthetic accounts and authored fixture choices only. No Production records or user SSO sessions were used. Production availability still requires deployment and the already-documented admin application of migration `014-experience-drafts`.
- Scope limit: this ports resumable pause/resume for the four existing authored situations. The full HABI2 conversation-first menu, free-text category routing, daily-context authored chat trees, summary/export, and shared return paths are still incomplete. No prior user data was imported.

## HABI2 authored topic conversations · 2026-10-27

- Added all seven Hungarian topic choices from the preserved HABI2 flow and mapped them to the three versioned, deterministic authored decision trees (dreams, pressure, connection). Each selected option is validated against the reachable branch on the server; arbitrary categories, skipped nodes, invalid options, and turns after a terminal outcome are rejected.
- The player saves the topic and each answer as a revision-fenced `guided-topic-conversation` draft. The conversation can be resumed after a page reload or discarded. At completion, the diary entry contains the topic, each authored question and selected answer, and the exact authored Habi outcome. Conversation content is not sent to a model or worker.
- API contract is `2.4.18`; request/response schema snapshot is `2.4.13`; persistence schema snapshot is `2.4.5`. No database migration is required beyond existing migration `014-experience-drafts`.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs node --test tests/database-persistence.test.mjs` — PASS, exit 0; 15 tests, 0 skipped. The integration test round-trips the new topic draft through the isolated local replica set and verifies its deletion.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 147 passed, 0 failed, 0 skipped.
- `npm run lint` — PASS, exit 0; Biome checked 197 files. `npm run typecheck` — PASS, exit 0. `npm run build` — PASS, exit 0; includes the authenticated player draft route. `git diff --check` — PASS, exit 0.
- Environment: local Habi checkout, disposable localhost MongoDB replica set `habiTestRs`, synthetic identities and authored fixture responses. No Production records or live SSO sessions were used.
- Rollback: redeploy the prior Production commit; the new draft key is contract-validated and shares the existing draft collection, so there is no new collection or destructive migration. Existing completed diary entries remain intact.
- Local full HTTP/worker acceptance was attempted with the repository's synthetic environment: `set -a; source .env.test.example; set +a; npm run test:workflow:local` — FAIL, exit 1. The PDF scan stayed `pending` for the 60-second acceptance window because the running Mac LaunchAgent is configured for `HG_ENVIRONMENT=production` and the production API; it cannot consume localhost test jobs. The production worker was left running and untouched. This is an environment/worker-boundary blocker for local end-to-end acceptance, not a failure in the authored tree/draft tests.
- Production deployment for commit `6693cdfa3378ab9efb58768b6d9be4cf64f42336` — READY as `dpl_5F7hsaczwaNNMXvUi42audNCrj4T` in Vercel project `narimato/habi`, aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`.
- Live unauthenticated checks: `/`, `/admin`, `/legacy` (redirects to `/?view=legacy`), `/api/health`, and `/api/ready` — HTTP 200. The signed-out `GET /api/v1/players/seed-player-001/drafts/guided-topic-conversation` returns HTTP 401 as required. The home HTML references the deployed JavaScript bundle containing `guided-topic-conversation`. No authenticated Production interaction was performed.
- Production admin state was not accessible in the current browser session; `/admin` redirected to DoneIsBetter sign-in. Migration `014-experience-drafts` therefore remains unconfirmed in Production and must be verified in `/admin` → **Adatbázis frissítése** before relying on persistent topic drafts. No Production records were changed.
- At the time of this release, remaining HABI2 scope was free-text topic/category routing, conversations driven by daily check-in context, summary/export, and remaining return paths. The following section records the separately implemented summary/export slice. No prior user data was imported.

## HABI2 conversation summary and text export · 2026-10-27

- A completed authored topic conversation now shows a readable summary and can be downloaded as a Hungarian UTF-8 text file before or after saving. The saved diary entry includes each authored Habi response, question, selected answer, and final outcome, so the conversation remains part of the player timeline.
- The export is deterministic and includes only the current authored exchange; it does not add dates, inference, or unrelated diary history. There is not yet a re-export action from a previously saved timeline card.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 148 passed, 0 failed, 0 skipped. The focused topic test checks summary content against each authored turn and the final outcome.
- `npm run lint` — PASS, exit 0; Biome checked 197 files. `npm run typecheck` — PASS, exit 0. `npm run build` — PASS, exit 0. `git diff --check` — PASS, exit 0.
- Environment: local Habi checkout and isolated localhost MongoDB replica set; synthetic identities and authored fixture answers only. No Production records or user SSO sessions were used.
- The broader synthetic HTTP/worker acceptance remains blocked at the PDF ClamAV step because the running LaunchAgent is configured for Production, not the localhost test service; it was left untouched. This conversation export does not use that worker.
- No API or persistence schema change and no Production data migration are introduced by this export. Commit `59ce12eae72b8d431fe4ceb4bdf471b6ed2cf8f8` is deployed as Production deployment `dpl_HQdC3FwYciiimS2nmxGTqMzsv9Vo` (READY); aliases include `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`.
- Live unauthenticated checks after deployment: `/` HTTP 200, `/legacy` HTTP 307 to `/?view=legacy`, `/api/health` HTTP 200, and `/api/ready` HTTP 200. No authenticated Production interaction was performed.

## Re-export a saved guided conversation from its timeline entry · 2026-10-27

- The player can now download the exact saved diary text from an expanded timeline card when the record is a guided conversation. This works for the topic flow and existing authored situation flow; the exporter does not reconstruct or rewrite the historical transcript.
- Only records already returned by the authorized timeline and linked-record APIs are eligible. Other diary or observation records do not show this download action.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 149 passed, 0 failed, 0 skipped. `node --test tests/guided-conversations.test.mjs` — PASS, 5 tests, 0 skipped. `npm run lint` — PASS with no warnings/errors; `npm run typecheck` — PASS; `npm run build` — PASS; `git diff --check` — PASS.
- Environment: local checkout and disposable localhost replica set with synthetic identities only. No Production records were changed or authenticated Production flows exercised.
- Commit `c79dac4eb77c211474017db14829c146dfe33c26` is live as Production deployment `dpl_7tWzzKxTFMo2BeQkCnr9YewF1Ewa` (READY). Live unauthenticated checks: `/` HTTP 200, `/legacy` HTTP 307 to `/?view=legacy`, `/api/health` HTTP 200, `/api/ready` HTTP 200. No authenticated Production timeline interaction was performed.

## Free-text start and preserved keyword routing for HABI2 conversations · 2026-10-27

- The player may enter a short opening message, then choose from topics ordered by the preserved HABI2 keyword groups. Matching is deterministic and local; it does not infer a feeling or send the message to AI. A legacy safety keyword routes directly into the authored support conversation. The selected topic and opening message are saved together in the revision-fenced player draft and included in the final diary transcript/export.
- Draft content version `guided-chat-v3` adds an optional opening message while continuing to read prior `guided-chat-v2` drafts. The API route and database collection are unchanged; no migration is added.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 151 passed, 0 failed, 0 skipped, including the isolated-replica-set save/read test for the v3 payload. `npm run lint` — PASS, no warnings/errors. `npm run typecheck` — PASS. `npm run build` — PASS. `git diff --check` — PASS.
- Environment: local Habi checkout, disposable localhost MongoDB replica set, synthetic player identities and fixture text. No Production data or authenticated session was used.
- Commit `629a124fbaceec8db488ba0ba0ce922383c257aa` is live as Production deployment `dpl_85ECdPEWweoL42vvGr6QJYHLvucH` (READY), with aliases including `habigoal.com`. Live unauthenticated checks: `/` HTTP 200, `/legacy` HTTP 307 to `/?view=legacy`, `/api/health` HTTP 200, `/api/ready` HTTP 200; the signed-out guided-topic draft endpoint returns HTTP 401. No authenticated Production conversation was performed.
- Local synthetic HTTP/worker acceptance is still blocked at ClamAV scan: the Production LaunchAgent cannot consume localhost test jobs. That worker was left untouched.

## Start a guided conversation from the player's latest check-in · 2026-10-27

- The player overview now shows the latest recognized check-in answers and an explicit **Beszélgetek a válaszaimról** action. It opens the authored guided conversation with those question/answer pairs in an editable opening. The text does not summarize or infer feelings; unknown answer codes are omitted. Nothing is submitted until the player chooses a topic and continues.
- `node --test tests/checkin-conversation-opening.test.mjs tests/guided-conversations.test.mjs` — PASS, exit 0; 9 passed, 0 failed. Tests verify exact factual opening text and that missing/unrecognized answers produce no invented text.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 153 passed, 0 failed, 0 skipped. `npm run lint` — PASS, exit 0; Biome checked 200 files. `npm run typecheck` — PASS, exit 0. `npm run build` — PASS, exit 0. `git diff --check` — PASS, exit 0.
- Environment: local Habi checkout, disposable localhost MongoDB replica set, synthetic player records only. No Production records or authenticated SSO session were used. Browser-level authenticated interaction was not performed.
- This is an additive client-side handoff to existing guided-topic draft flow; no endpoint, persisted contract, migration, or rollback data action is added. Rollback is redeploying the prior commit.
- Commit `5aba1b388cc4660d7de8f2f1f4124223d07bf38f` is live in Production deployment `dpl_8WMELks4cJaRoJ7Ak2m1Vk4Q3ChT` (READY), with the Habi production domain. Live unauthenticated route checks: `/` HTTP 200, `/legacy` HTTP 307 to `/?view=legacy`, `/api/health` HTTP 200, `/api/ready` HTTP 200. The deployed client bundle contains the new conversation action. An authenticated browser interaction was not performed.

## Review and choose how to use a trusted-adult preparation note · 2026-10-27

- The player can preview the exact three-field message before deciding what to do. From the preview they can return to edit, save the note to their private journal, or explicitly download a text file to share themselves. Habi does not send the text to anyone. Empty fields are identified as skipped; an entirely empty note cannot be previewed.
- `node --test tests/trusted-adult-message.test.mjs tests/checkin-conversation-opening.test.mjs` — PASS, exit 0; 4 passed. `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 155 passed, 0 failed, 0 skipped. `npm run lint` — PASS, exit 0; Biome checked 202 files. `npm run typecheck` — PASS, exit 0. `npm run build` — PASS, exit 0. `git diff --check` — PASS, exit 0.
- Environment: local checkout, disposable localhost MongoDB replica set, synthetic text only. No Production records or authenticated SSO sessions were used; no browser-level interaction was performed.
- No API or persisted contract change. A failure before save leaves the editor/preview intact; rollback is redeploying the previous commit.
- Commit `7d16d2c514ef294033c74469208f86b4fed3095a` is live as Vercel Production deployment `dpl_4wViwAAV83ZEdLCCkqxUTwPvDqKE` (READY), with aliases `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. Live unauthenticated checks: `/` HTTP 200, `/legacy` HTTP 307 to `/?view=legacy`, `/api/health` HTTP 200, `/api/ready` HTTP 200. The deployed client bundle contains the preview action. Authenticated browser use was not performed.

## Link daily check-in context to authored conversations and show no-evidence answers · 2026-10-27

- From the player's latest check-in, difficult focus or mood answers now offer the matching authored conversation as an explicit choice. The conversation draft and final diary timeline record retain the check-in ID, exact associated question, and exact answer. Resuming a draft preserves the link. The server verifies the check-in belongs to the same tenant and player and contains the expected focus/mood answer before accepting the linked draft.
- The timeline already stored the parent/coach question and its answer as related events, but the player timeline omitted `no_evidence` interpretations. The visibility rule now shows the question and no-evidence result to the player whose timeline it is, along with current approved explanations; in-review or stale explanations remain hidden. Timeline cards show local date and time.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs node --test tests/database-persistence.test.mjs tests/daily-situation-context.test.mjs tests/experience-drafts.test.mjs tests/timeline-question.test.mjs` — PASS, exit 0; 26 tests, including linked-check-in persistence/route match and question/no-evidence visibility for parent and player.
- Full checks after this change: `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS; 164 tests, 0 failed, 0 skipped. `npm run typecheck` — PASS. `npm run lint` — PASS. `npm run build` — PASS. `git diff --check` — PASS.
- Environment: local Habi checkout and disposable localhost MongoDB replica set with synthetic identities and check-in data. No Production records or authenticated Production session was used. A live authenticated UI interaction remains unverified.
- Changes are additive and use the existing timeline/draft collections; no database migration is required. Rollback is redeploying the previous commit. Production activation follows the existing push-to-main release flow; this verification note is not evidence of an authenticated Production test.
- Production delivery for code commit `dcf33e4` — Vercel deployment `dpl_JAUqMyavbWg8NcXo9VyaV1Qi1bbd` is **Ready** and aliased to `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. Live checks: canonical `/` returns HTTP 200; signed-out `/api/v1/timeline` returns HTTP 401 as expected. No authenticated timeline/player flow was available to verify in a browser.

## SSO login session validator repair · 2026-10-27

- Root cause from Production callback diagnostics: Atlas rejected owner-session creation (`stage=session_issue`, `database_rejected_operation`). Read-only inspection found the live `habi_sso_owner_sessions` validator did not allow optional `displayName`, although the callback persists the verified SSO display name. No session documents existed in that collection at inspection time.
- Added forward migration `016-sso-owner-session-display-name`; the callback applies it before creating the session. It updates only the collection validator and does not change stored user data.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs node --test tests/database-persistence.test.mjs` — PASS, exit 0; 16 tests. The integration case deliberately restores the older validator, applies migration 016, then confirms an SSO session including `displayName` is accepted.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 164 passed, 0 failed, 0 skipped. `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` — PASS, exit 0.
- Environment: local checkout and isolated localhost MongoDB replica set; no production database writes were made during verification. Commit `0a1252b` is live in Vercel Production as deployment `dpl_GY8wVdYDQrSvKBfTTbdSCEUbsQWh` (READY), aliased to `habigoal.com`. Live `/api/health` and `/api/ready` returned HTTP 200; `/auth/login` returned HTTP 302 to the configured DoneIsBetter SSO host and set the transaction cookie. A complete authenticated callback has not yet been exercised. The callback applies migration 016 before creating the owner session, so the validator repair is applied during the next valid SSO callback.

## Coach shared-plan creation · 2026-10-27

- Production logs for `plan.create` showed HTTP 400 `INVALID_INPUT`. The coach UI omitted the contract-required nullable `span` on the source reference. After correcting that payload, a database-backed test exposed a second issue: coach memberships are tenant-scoped (`playerId: null`), but plan creation required the coach membership to be player-scoped.
- The UI now sends `span: null` for a whole-record source reference. Plan creation accepts the active tenant coach membership, while still requiring an active player-scoped membership for player/parent action owners. No API or persisted-data contract changed.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs node --test tests/database-persistence.test.mjs` — PASS, exit 0; 17 tests. Added an isolated-replica-set test that creates a sourced plan as a tenant-scoped coach and confirms the saved plan.
- `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, exit 0; 165 passed, 0 failed, 0 skipped. `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` — PASS, exit 0.
- Environment: local Habi checkout and disposable localhost MongoDB replica set; no Production data was changed. Commit `a84112c` is live in Vercel Production as deployment `dpl_3CznDjhKoWwA644371FJy1nggJcg` (READY), aliased to `habigoal.com`. A real authenticated browser submission has not been performed by this verification run; the failure condition is reproduced and covered by the isolated database integration test.

## Coach questions across a player's collected Habi information · 2026-10-27

- The coach question form in **Felmérések** now asks about the player broadly, not only a selected survey. The coach conversation question uses the same path. The server pins at most the 20 most recent eligible sources for that tenant/player: player, parent, and coach records; completed daily check-ins and assessments; monthly reflections; plans and follow-ups; ready reports; verified extractions; and current ready explanations. Restricted reports, pending/rejected extractions, and stale or unreviewed explanations are excluded. The exact revision list is stored on both the turn and queued job; the worker rechecks authorization and revisions before reading them. Parent requests remain explicit-source only.
- Tests: `node --test tests/coach-context-sources.test.mjs` — PASS, 2 passed; the database integration assertion in `tests/database-persistence.test.mjs` verifies that an empty coach `sourceRefs` request resolves player-wide sources and persists the same pinned refs to both turn and job. `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` — PASS, 167 passed, 0 failed, 0 skipped. `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` — PASS.
- Environment: local checkout and disposable localhost MongoDB replica set; synthetic identities and records only. A live Ollama inference and authenticated Production browser question were not run, so response quality and the real-user experience are not claimed as verified here.
- No database migration is needed. API contract is now `2.4.20`; the existing QuestionInput schema already accepts an empty `sourceRefs` list. Rollback is redeploying the preceding Production deployment.
- Commit `cc87390d62a99fc626b04308bf3d893158d99278` is READY in Vercel Production as deployment `dpl_dbTDwdYD75by9ByjmgSWcXMpuzn4`, aliased to `habigoal.com`, `www.habigoal.com`, and `habi.doneisbetter.com`. Live `/api/health` and `/api/ready` returned HTTP 200, and the deployed client bundle contains the new coach question panel. Authenticated Production submission and local Ollama answer quality remain unverified.

## Shared Hetzner AI API integration · 2026-10-27

- The Habi hosted Mac worker discovers permitted `text_chat` and the model catalogue at startup. It creates asynchronous `/jobs` with `model=auto` by default, JSON response format, a deterministic source/job-revision idempotency key, and bounded polling/retries. The service-specific key is loaded from the ignored Hetzner private credential file into the ignored, mode-0600 Habi worker env. It is not in Vercel, source, browser code, or logs.
- The worker submits only the Habi API's requester-authorized source snapshots and exact source manifest for the current question. It records the actual returned model in the answer manifest. Habi's existing exact-citation validation and completion-time revision/lease checks remain authoritative; malformed, unsupported, timed-out, expired, or stale output cannot become an approved claim. Habi results remain stored by Habi, not in the shared service's short-lived job queue. Camera moderation is not applicable; Habi report uploads remain ClamAV scanned and manually reviewed.
- `cd worker && uv run --frozen python -m unittest discover -s tests -v` — PASS, 21 tests, including async queue submission/polling, `auto`, capability discovery, secret redaction, source revision model manifest and existing exact citation checks. Environment: local worker tests with synthetic fixtures and an HTTP test server.
- Live shared API smoke: `GET /job-types` and `GET /models` returned HTTP 200 for the Habi key; `text_chat` is permitted and the catalogue lists the currently ranked candidates. A synthetic Hungarian async job completed over `POST /jobs` + `GET /jobs/{id}`. The returned output was not usable as a grounded Habi answer, so transport is verified but Hungarian answer quality is not. No real Habi user/job data was sent.
- Production worker env was updated locally only (ignored file, mode 0600) and its LaunchAgent was restarted with the shared API configuration. Vercel Production settings were not changed. The live Habi-to-worker-to-Hetzer job path still requires an authenticated coach/parent request and is not claimed as completed by this synthetic API smoke.
- Rollback: restore the prior mode-0600 worker env values and restart the LaunchAgent; code rollback restores local Ollama hosted generation. This does not modify Habi or Atlas records. Open items: evaluate Hungarian quality with synthetic fixtures, verify provider retention/processing terms before a personal-data pilot, and observe one authenticated live Habi job.

## Prototype parity release — 2026-10-27

- Release commit: `2143a53fadd6b20299cb323c9670ea57c6faf051`. Clean committed snapshot: 190 app tests passed, none skipped; 18 worker tests passed. Typecheck, lint, production build and three-role synthetic browser walkthrough passed.
- Vercel production deployment: `dpl_33P9qHPuGfsfk5rFWNSbBsez1ARs` (`https://habi-c29ml3tof-narimato.vercel.app`), READY; deployment metadata matches the release commit.
- Canonical `https://habigoal.com/` serves that exact deployment. `/admin`, `/api/health`, `/api/ready` return 200. New knowledge, evidence-source and participant APIs return 401 anonymously. Deployed client chunks include native assessments, combined metro charts, interrupted check-in continuation and knowledge review.
- Authenticated flows were verified locally against the production build with isolated synthetic accounts; authenticated production data and real AI answer quality were not exercised.

## Contextual AI coach release — 2026-10-27

- Final release: `9f9dbc2a9d566cba81c5634f8fcfdaeab882d03f` (main feature commit `bcda96d2d9206a1b2579308e39836e9a6128fd90`). 201 app tests passed, none skipped, including live MongoDB persistence; 23 worker tests passed. Typecheck, lint, production build and a clean committed snapshot were verified.
- Three-role synthetic browser walkthrough against the production build: persistent global/contextual entry, actual shared-AI initial reply with exact citations, follow-up, private memory and correction, authored recommendations and trial/helpfulness feedback, original source inspection, mobile width, reload recovery, parent/coach access separation and review workspace; no browser exceptions. The generated follow-up included an inference and remained subject to review.
- Vercel `dpl_HQLmUZHrUqxTAH5CExqgdXBGrXhT` (`https://habi-l2xig9srp-narimato.vercel.app`) is READY and metadata matches the final release. Canonical `https://habigoal.com/` serves that deployment. `/admin`, `/api/health`, `/api/ready`: 200. Anonymous new AI APIs: 401. Served client includes AI entry, profile, confirmation, recommendation and review controls.
- Production LaunchAgent restarted; logs confirm `habi.worker.shared_ai.ready` and `habi.worker.service.started` in hosted mode with model auto. Production prompt hashes match the worker environment and runtime manifest.
- Real AI generation used isolated synthetic records. Authenticated production user flows and general professional answer quality are not asserted by these checks. The private schema installs idempotently on first authenticated AI use.

## AI-coach question sending — 2026-10-28

- Fix commit `cfdf3142cebe8e23183a3a31e317bc2f7ff72eb9`: the authored introduction opens immediately without an automatic generation job; questions can be submitted while other replies wait. Legacy automatic openings are superseded by the user's question, with their history retained. Stale polling results cannot overwrite state following a write. Cancelled generation releases the hosted worker at its next cancellation check.
- 203 app tests and 24 worker tests passed; focused final AI-coach suite 13/13, typecheck, lint and production build passed. Production-build browser test with generation deliberately withheld reproduced pending replies and verified send, second question, persistence and reload for player, parent and coach; no browser exceptions.
- Vercel deployment `dpl_E3SgsasgjHwYY6YxXUYFRP9GG59B` is READY and matches the fix commit. Canonical domain serves the exact deployment and updated UI text; health/readiness return 200 and anonymous AI access returns 401. Production worker restarted for cancellation handling.

## AI answer progress and recovery — 2026-10-28

- Release `eb02018ddde3f4fa1127c4c5a1c716902e612f32`: actual queue/provider/generation/checking/retry/completed stages, elapsed time, stale-heartbeat handling and earlier own-question counts. No invented percentage or ETA. Background progress is lease-fenced; endless transient retries stop after four claims.
- Invalid or truncated JSON gets one bounded recovery attempt within the provider's advertised output cap; complete fenced JSON is accepted, partial output is not patched into invented data. Compact source keys map back only to the exact authorized source manifest. Personal facts cannot cite a generic page as their sole evidence; displayed direct/general claims use verified source excerpts. Metric-specific questions receive only that metric from a check-in, with separately versioned authored help.
- If generation fails or has no verifiable claims, the UI explicitly labels the factual, cited source summary. It does not present the fallback as a generated personal interpretation. Recent substantive player data remains available despite newer chat messages.
- 205 app tests, no skips, and 31 worker tests passed; lint, typecheck and production build passed. A controlled provider failure exercised real HTTP retries, real worker heartbeats and a visible, cited fallback answer. Real-provider synthetic tests exposed an incorrect sleep/energy statement; the added guards reject it. Final browser test verified completed progress, the actual recorded sleep response and its accurate authored explanation on mobile. No production personal data was used for generation QA.
- Vercel `dpl_5SAhSP2oobGJKnPdG6zRxAUKrf9e` is READY and matches the release. Canonical `habigoal.com` serves the exact deployment and updated progress/fallback UI. Health/readiness return 200; anonymous AI access returns 401. Production worker restarted and shared AI capability startup verified.

## 2026-10-28 — Answer-first training attendance guidance

- Commit `659522f2c014e7dc269d36bee5d79c10e2896335`; production deployment `dpl_ErvjtfxJefXLSQv7Con6hhoCBKU5` is READY and serves https://habigoal.com.
- 210 application tests passed, zero skipped; 32 worker tests passed. Lint, typecheck, production build and diff whitespace check passed.
- Browser: player and coach questions completed through the worker; exact authored source opened; previous-day check-in remained dated in a closed “Mi alapján?” disclosure; “Válaszolok” focused an empty composer. All fixtures synthetic.
- Historical answer and manifest preservation, Budapest calendar boundary, future timestamp exclusion, attendance-vs-schedule intent and adult first-person identity covered by tests.
- Canonical HTML deployment ID and live client strings verified. `/api/health` and `/api/ready` returned 200; unauthenticated private coach request returned 401. Production worker restarted and reported hosted service startup with shared text_chat auto discovery. Local test server stopped.

## 2026-10-28 — Conversation continuity and repeated-question handling

- Commit `aed85774481ef005b60cc22ed5cb8898da24b8e6`; production deployment `dpl_9QNJpzMGDX2aEG1uN55PPgei8Tqh` READY on https://habigoal.com.
- 217 application tests passed, zero skipped; 34 worker tests passed. Lint, typecheck, production build and diff check passed.
- Browser sent three identical questions in one private thread for a player (training attendance) and coach (general sleep topic). One original full answer remained; second and third turns had different continuations and a single focused question. Reload preserved behavior and reply focused an empty composer. General-topic initial response used synthetic provider fallback; no live personal records used.
- Regression checks cover exact repeat normalization, arbitrary topics, repeated model claims under different questions, fresh source revisions, intervening user context, source-pinned context/complete, read pagination, answer preservation and cross-role denial.
- Live canonical deployment ID, conversation client strings, health/ready 200 and anonymous private-route 401 verified. Production worker restarted and reported hosted text_chat auto startup. Test web server and owned provider fixture stopped.

## 2026-10-28 — Plain check-in messages through the chatbot API

- Commit `cf9a1be524ce404539d60d3def9b0a0b9dfe0fbb`; deployment `dpl_84r7CqmozNnipXZJyWBKiW796DHn` READY on https://habigoal.com.
- 217 application tests passed with zero skipped; 45 worker tests passed. Lint, typecheck, production build and diff check passed.
- Live shared text_chat API browser tests used synthetic check-ins for coach and player. Both produced accepted natural Hungarian paragraphs with actual model `granite4:1b-h`, attributed report dates and correct person. Exact source references completed through the worker; raw answers remained under closed “Mi alapján?” evidence. The observed coach reply completed in 6 seconds; no latency guarantee is implied.
- Tests cover all 20 answer categories in both voices, exact-clause validation, changed facts/negation/causality/advice rejection, partial/unknown/unpinned sources, latest-source isolation, Budapest dates, fallback wording and separate strict JSON contracts for claims vs rewrite text.
- Canonical deployment ID and live plain-summary client verified. Health/ready returned 200; anonymous private route returned 401. Production worker restarted and reported hosted text_chat auto startup. Owned local test server stopped. Existing saved answers remain unchanged; new explanation requests use the rewrite path.

## 2026-10-28 — Metro timeline alignment and lane spacing

- Commit `31a8bc449de890c6964f3560d9e54885b167762c`; production deployment `dpl_GjhNKQPdVf44vMr2bMHYYJHmbQZf` READY on https://habigoal.com.
- 222 application tests passed, zero skipped. Lint, typecheck, production build and diff check passed. Pinned shared CSS/design-system test passes unchanged.
- Geometry regressions cover 100 sequential events reusing a lane, distinct overlapping lanes, measured desktop anchors/card edges, rounded endpoints and explicit process continuation. There is one decorative station per event, with role-coloured connectors to cards.
- Authenticated synthetic browser checks passed at 390/800/1440 pixels; keyboard expansion, simultaneous expansion/collapse, font reflow, a narrow container in a wide viewport, pagination from 50 to 55 events, and role filters all retain badge-centred stations and edge-aligned connectors. No browser errors or document-level horizontal overflow. All fixtures were synthetic.
- Canonical deployment ID, station/connector client markers and scoped container-query styles verified live. Health/ready returned 200; anonymous timeline returned 401. Local test server stopped. No API, database or worker changes were needed.
