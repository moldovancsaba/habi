# Habi — ellenőrzési napló

## Apex SSO callback és napi kérdés-layout javítás · 2026-10-26 · még nem telepítve

- A Vercel domain lekérdezése szerint a `habigoal.com` és `www.habigoal.com` is a `narimato/habi` projekthez tartozik. Az élő HTTP-próba: apex `/` → 200; `www` `/` → 308 a `https://habigoal.com/` címre; a callback útvonal próbakérése érvényes login-tranzakció nélkül `303 /?signin=failed` választ ad.
- A kódban a canonical app origin és az SSO callback ugyanarra az apex originre van kötve. A callback host-only böngésző-cookie-t kap, és a feldolgozási hibákhoz rögzített, személyes adatot nem tartalmazó okkódot ír a Vercel runtime logba.
- A hétkérdéses képernyő kártyája oszlopos elrendezést kapott, a kérdés és a válaszok tördelhetők, a fókuszjelölés látható. A régi adatátviteli üzenet és hivatkozás kikerült a kijelentkezett felületről.
- Ellenőrzés a helyi Habi checkoutban: `npm run lint` exit 0; `npm run typecheck` exit 0; `HABI_TEST_MONGODB_URI=mongodb://127.0.0.1:27099/?replicaSet=habiTestRs npm test` exit 0 (112/112, 0 skip); `npm run build` exit 0; `git diff --check` exit 0. Nincs Production adatírás.
- Korlát: jelenleg nem lett commitolva vagy telepítve. Az apex HTTP-próba az előző Production buildet vizsgálta; valós SSO callback/session, role UI, admin role/invitation workflow és mobil böngészős layout még nincs igazolva. A Production gyökér továbbra is a régi napi napló UI.
- Visszaállítás telepítés után: a megelőző Vercel Production deployment visszaállítása. E változtatások nem módosítanak adatbázist vagy rekordot.

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

| Parancs / próba | Eredmény | Környezet és korlát |
| --- | --- | --- |
| `set -a; source .env.test.example; set +a; npm test` | PASS, 95/95, 0 skip | Helyi MongoDB replica set; API/domain/auth/kontraktus, unconfigured Preview fail-closed és Mongo-perzisztencia tesztek. A Mongo gyermektesztek egyedi, eldobható `_test` adatbázist használtak. |
| `npm run test:workflow:local` | PASS, exit 0 | Localhost-only Mongo replica set, 001–009 migrációk és szintetikus seed; check-in/snapshot, versioned player practice feedback, parent + coach observations, source-grounded question → Mac worker → result and reloadable thread history, PDF quarantine/ClamAV scan, manual extraction review, coach material publication, plan acceptance/follow-up, cursor paging, write denial, role visibility and cross-tenant 404. |
| `npm run lint`; `npm run typecheck`; `git diff --check` | PASS, 0 warning/error | Habi worktree; Biome 140 source/test files. |
| `npm run build`; `npm run start:test` | PASS | Next.js 16.4.3 production build runs locally on loopback with synthetic-only config; no hosted/Atlas data used. |
| Worker: `uv run python -m unittest discover -s tests -v` | PASS, 16/16 | Local Python worker config, host lock and pinned local model/prompt checks. |
| Mac worker service + helyi Ollama | PASS, a job `succeeded`; modellválasz `no_evidence`, 0 claim | A szintetikus rekordhoz nem állt rendelkezésre megalapozott állítás; a worker nem fabrikált következtetést. Ez a job-pipeline működését igazolja, a válasz szakmai minőségét nem. |
| Böngésző, `http://127.0.0.1:3000` | PASS, synthetic player + parent workflow | A játékos megnyitotta a migrált, öt elemű gyakorlatkönyvtárat, visszajelzést mentett, majd újratöltés után a feljegyzés visszaállt. A szülő újratöltés után látta a másik jogosult szülő beszélgetését. |
| Reszponzív és billentyűzetes UI | PASS | 360/390/430/768/1024/1440 px szélesség; nincs vízszintes túlcsordulás, a vizsgált interaktív célok legalább 44 px magasak, Tab-fókusz 3 px-es látható körvonalat ad. Fizikai eszközteszt és 200%-os szövegnagyítás még hátravan. |
| Vercel Preview `https://habi-git-codex-habi-ground-up-narimato.vercel.app` | Deployment Ready; Atlas ping PASS | A `707cbca` deployment `/` 200, `/api/health` 200, `/api/ready` 200; ez bizonyítja az Atlas-kapcsolatot a Preview deploymentből. `/api/v1/me` 503 `DEPENDENCY_UNAVAILABLE`, mert `HG_ENVIRONMENT` és SSO runtime-konfiguráció hiányzik; termék API-k ezért fail-closed állapotúak. Hosted role workflow nem igazolt. `habi.doneisbetter.com` továbbra is a régi Production deploymentet szolgálja ki. |
| Kérdés API szerződésfix | PASS reprodukcióval | Javítva a Job dokumentumból hiányzó `uploadId`, a csak Jobba beszivárgó `threadId`, a worker aktív játékosi státuszra vonatkozó hibás feltételezése, valamint az Interpretationből hiányzó `turnRevision`. |

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

| Próba | Eredmény | Környezet |
| --- | --- | --- |
| `npm test` | PASS, 90/91; 1 meglévő Atlas-integrációs próba kihagyva | Unit, domain, API boundary, browser-owner state, config és legacy static asset checks. Nincs hosted user data. |
| `npm run lint` | PASS, 146 fájl, hiba nélkül | Habi repo |
| `npm run typecheck` | PASS, exit 0 | Habi repo |
| `npm run build` | PASS, Next.js 16.4.3 | Local production build |
| Browser → API → Mongo round-trip | PASS: root 307 `/legacy/index.html`-re; static UI 200; GET katalógust és session cookie-t adott; PUT után GET ugyanazt a revision-1 payloadot olvasta vissza | Helyi `habi_legacy_mvp_test` DB a localhost Mongo replica seten; csak szintetikus tesztpayload |
| Stale revision write | PASS, HTTP 409 | Ugyanaz a lokális tesztadatbázis |
| Cross-origin write | PASS, HTTP 403 | `Origin: https://attacker.example`, az állapotot nem írta át |
| Multi-role API | PASS, localhost válasz 401; hosted MVP boundary teszt 503-at igazol | Teszt identity nincs; Production/Preview role-végpontok tiltva maradnak |
| Mintatörténet-generálás | PASS, eltávolítva az automatikus `seedSampleHistory()` hívás és függvény | MVP nem gyárt hiányzó napi rekordot |

Az új Habi Production környezeti változói (`HG_MVP_MODE=legacy-browser`, origin, külső AI tiltás, synthetic=false, Atlas database=`habi`) és a Preview megfelelője (`habi_preview`) be vannak állítva, de az aktuális deployment még nem tartalmazza az MVP-integrációs commitot. A `habi.doneisbetter.com` jelenleg továbbra is az előző production release-t szolgálja ki. A cutover előtt az új Preview deploymenten újra végig kell futtatni a hosted read/write/reload és cross-origin denied próbát; utána mehet a felhasználó által kért `main`/Production release.

## T-HG-131 · Nem-SSO szerepköri munkafolyamat · történeti induló állapot · 2026-10-25

API-kontraktus 2.4.8. A munkafában szerepelnek szerepköri terv/utánkövetés, kérdés/thread/job, idővonal, coach-anyag verziózás/publikálás, PDF chunk-feltöltés, GridFS karantén, report-scan job, extraction mező-review és helyi Mac worker folyamat. A claim body-hashhez kötött, lease tokenje szerveroldali verifierből származik, a worker fence-et és heartbeatet használ. A worker kontextus a kanonikus schema ellenőrzésén megy át, a jelentés csak sikeres ClamAV clean verdict után válik olvashatóvá.

| Ellenőrzés | Állapot | Megjegyzés |
| --- | --- | --- |
| Kód / API / migráció / szerződés | Implementálva | Új migráció 009; API-, domain- és response manifest frissítve. |
| Helyi Mongo/HTTP acceptance | PASS a friss, szintetikus workflow-ra | A napló tetején felsorolt teljes helyi role workflow, worker, report scan/review, plan/material és thread-history ellenőrzés. |
| Mac worker + Ollama | Kérdés-job round-trip igazolt | A worker `no_evidence` eredményt adott a synthetic fixture-re; ez biztonságos elutasítás, nem modellminőségi bizonyíték. |
| ClamAV | PASS a szintetikus report acceptance-ben | ClamAV 1.5.4; `freshclam` letöltötte és validálta az adatbázisokat (daily 28164, main 63, bytecode 339). A worker 48 óránál régebbi vagy hiányzó signature DB mellett nem ad tiszta verdictet. A korábbi `ERROR: NULL X509 store` frissítési üzenet mellett a letöltött adatbázisok tesztje sikeres volt; az upstream [macOS Homebrew issue](https://github.com/Cisco-Talos/clamav/issues/1421) hasonló, sikeres frissítés melletti üzenetet dokumentál. |
| SSO / Vercel / Atlas / személyes pilot | Későbbi fázis | SSO, hosted secrets/DB, consent/retention és személyes pilot nincs ebben a lokális acceptance scope-ban. |

**A jelenlegi worktree még nem production/release-ready.** A friss localhost acceptance lefedi az első tartós role workflow-t. Az örökölt HABI-funkciók nagy része még nincs átültetve (lásd `docs/legacy-feature-migration.md`); SSO, elkülönített hosted adatbázis/env, consent/retention jóváhagyás, preview verification és domain-cutover még hiányoznak. A régi `main` mentés változatlan; rollback a korábbi deploymentre/domainre visszaállás, Mongo-migráció esetén csak előre javító migráció használható.

## T-HG-130 · Szintetikus szerepköri workflow tesztkész állapot · 2026-10-25

| Parancs / próba | Eredmény | Környezet és korlát |
| --- | --- | --- |
| `set -a; source .env.test.example; set +a; npm test` | PASS, 93/93, 0 skip | Lokális Mongo replica set; contract, auth, persistence, race/idempotency és domain esetek. |
| `npm run test:workflow:local` | PASS, exit 0 | Szintetikus tesztadatbázis-visszaállítás → 001–004 migráció → szintetikus seed (2 tenant, 6 identitás) → HTTP-folyamat. |
| `npm run db:test:start && npm run db:test:stop` | PASS, exit 0 | A helyi MongoDB 8.0.24 replica elindult, majd admin shutdown paranccsal tisztán leállt; a tesztadatfájlok az ideiglenes mappában maradtak. |
| `npm run lint` | PASS, exit 0 | Biome, 84 source/test file; no warning/error. |
| `npm run typecheck` | PASS, exit 0 | TypeScript, exit 0. |
| `set -a; source .env.test.example; set +a; npm run build` | PASS, exit 0 | Next.js 16.4.3; every API route is dynamic; no build-time error output. |
| `worker`: `uv run python -m unittest discover -s tests -v` | PASS, 16/16 | Local Mac worker config, lock and model contract tests. |
| `worker`: `verify-local` + `smoke-local` | PASS | Ollama 0.40.3, `qwen2.5:7b`, pinned digest/prompt; synthetic inference only. |
| Browser at `http://127.0.0.1:3000` | PASS, visual/AX smoke | Hungarian synthetic workspace rendered; synthetic player session and daily check-in start controls worked; logout revoked the session. |

A helyi szintetikus HTTP-folyamat ellenőrzi a játékos bejelentkezését, a check-in session létrehozását, a válaszok mentését, az idempotens újraküldést, a stale revision elutasítását, a lezárt snapshot és session revision egyezését, a szülői és edzői olvasást, a kétféle megfigyelés rögzítőjét és forrását, az edzői megfigyelés pontos revisionjának publikálását, a szerepkör szerinti láthatóságot, az aláírt cursor lapozását és a módosított cursor elutasítását, a check-in válasz általános record úton történő létrehozásának tiltását, valamint a tenantok közötti 404 izolációt. Az adatbázis egy eldobható localhost replica set, nem Atlas.

A T-HG-130 végrehajtásakor a kanonikus API-manifest a Habi API **2.4.1** verzióját rögzítette. A szerződés szerint check-in válasz kizárólag a revisionnel védett check-in útvonalon hozható létre. Az általános record írás nem kerülheti meg a session revision- és eredmény-snapshot logikáját.

**Ready now at T-HG-130:** synthetic acceptance testing of the earlier check-in, observation, publication and authorization slice at `127.0.0.1:3000` using the instructions in `README.md`. This historical scope does not certify the later implementation.

**Not covered by T-HG-130:** DoneIsBetter callback/session issuance, live SSO permissions, Atlas/Vercel deployment, consent/retention evidence and personal pilot approval. The non-SSO implementation is documented under T-HG-131 and remains untested. No secrets were read or changed; no deployment or hosted DB operation occurred.

## T-HG-129 · Mac Ollama runtime és synthetic-only worker smoke · 2026-10-25

| Parancs / próba | Eredmény | Környezet és korlát |
| --- | --- | --- |
| `uv sync --frozen` | PASS, exit 0 | `worker/`, Python 3.10 virtuális környezet, lockfile szerint. |
| `uv run python -m unittest discover -s tests -v` | PASS, 16 próba | Worker konfiguráció, hostzár, model/prompt drift és hibás inference válasz próbák. |
| `set -a; source .env.example; set +a; uv run python -m habi_worker.cli verify-local` | PASS, exit 0 | Helyi Ollama HTTP API: szerver `0.40.3`, `qwen2.5:7b` digest `sha256:845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e`, prompt SHA-256 egyezett. |
| `set -a; source .env.example; set +a; uv run python -m habi_worker.cli smoke-local` | PASS, exit 0, inference `passed` | Rögzített szintetikus ellenőrző prompt a lokális modellre; elvárt exact marker válasz. Felhasználói adat nem volt a kérésben. |

A local worker mód csak development + synthetic-only konfigurációval indul, loopback Ollama hostot követel, és hibázik, ha cloud, Atlas, user SSO vagy külső provider secret kerül a folyamat env-jébe. A lokális advisory lock 0600-as fájlon, nem blokkoló `flock`-kal zárja ki a második worker példányt. A kimeneti JSON nem tartalmaz promptot vagy generált szöveget. A runtime manifest már a ténylegesen látott daemon/model/prompt értékeket pineli.

Ez a modell- és futtatási bizonyíték, nem Habi job-feldolgozás. Worker service-token, cloud job API, lease/heartbeat, jogosultságfrissítés, kontextusbetöltés, eredménybeküldés és tartós retry még nincs megvalósítva. Nincs Atlas/Vercel kapcsolat, telepítés vagy személyes adat. Rollback: worker helyi CLI/config kód visszavonása és runtime-manifest korábbi verzióra állítása; perzisztens termékadat nem változott.

## T-HG-128 · Szerveroldali session- és scope-guard · 2026-10-25

| Parancs / próba | Eredmény | Környezet és korlát |
| --- | --- | --- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 85 pass, 0 fail, 0 skip | Izolált, egynode-os lokális MongoDB replica set; teszt-DB törlődött a suite végén. |
| `npm run lint` | PASS, exit 0 | Biome, 60 forrás-/tesztfájl. |
| `npm run typecheck` | PASS, exit 0 | TypeScript. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3; hosted route inventory változatlan. |
| `git diff --check` | PASS, exit 0 | Lokális munkafa. |

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

| Parancs / próba     | Eredmény                      | Környezet és korlát                                                                                                                                   |
| ------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`          | PASS, 54 pass, 0 fail, 1 skip | Lokális Node suite; plusz a központi CSS SHA-256 és forráscommit ellenőrzése. A Mongo replica-set integráció kihagyva, nincs `HABI_TEST_MONGODB_URI`. |
| `npm run lint`      | PASS, exit 0                  | Biome.                                                                                                                                                |
| `npm run typecheck` | PASS, exit 0                  | TypeScript.                                                                                                                                           |
| `git diff --check`  | PASS, exit 0                  | Lokális munkafa.                                                                                                                                      |

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

| Command / probe               | Result                                    | Environment and limits                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                    | PASS, 42 passed, 0 failed, 1 skipped      | Local Node suite; isolated Mongo replica-set integration skipped because no test URI was supplied.                                                                                               |
| `npm run lint`                | PASS, exit 0                              | Biome, 39 source/test files.                                                                                                                                                                     |
| `npm run typecheck`           | PASS, exit 0                              | TypeScript.                                                                                                                                                                                      |
| `npm run build`               | PASS, exit 0                              | Next.js 16.4.3; no build-time route errors or readiness probes.                                                                                                                                  |
| Local production-server smoke | PASS, `/api/health` 200; `/api/ready` 503 | Synthetic-only runtime config, no Atlas URI; each response had a unique `X-Request-ID`, readiness body was `DEPENDENCY_UNAVAILABLE`, and the server emitted a content-free correlated 503 event. |

Both operational routes use the shared API boundary. Known/unknown exceptions map to the stable public envelope; normal 5xx dependency responses also produce safe structured events. Query/body, exception detail, driver text, URI, and credentials are not logged. The readiness 503 is expected because this local smoke intentionally had no Atlas target; it is not evidence of a live Atlas failure.

This change does not provide live Atlas/SSO verification and is not yet applied to future business routes. Rollback is a code revert with no persistent database effect.

## T-HG-114 · Idővonal DTO → view-model adapter · 2026-10-25

| Parancs / próba     | Eredmény                      | Környezet és korlát                                                                               |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm test`          | PASS, 35 pass, 0 fail, 1 skip | Synthetic DTO fixture; Mongo replica-set integráció kihagyva, mert nincs `HABI_TEST_MONGODB_URI`. |
| `npm run lint`      | PASS, exit 0                  | Biome.                                                                                            |
| `npm run typecheck` | PASS, exit 0                  | TypeScript.                                                                                       |
| `npm run build`     | PASS, exit 0                  | Next.js 16.4.3; a route inventory nem változott.                                                  |

Az adapter a szerződött `submittedAt → at`, `actorRole → role`, `kind → type` mappinget végzi; megőrzi ID/revision/processId/replyTo/relatedId, server-process `closedAt`, edges, continuations, nextCursor, snapshotAt és explicit accessRevision állapotot. Nincs storage-only tenant/retention/audit field, email, text, title vagy author másolás. Hiányzó Processből nem következtet lezárásra. A malformed page/node/process elutasított, nem csendben elhagyott. A view model és a tömbjei immutable.

Nincs API-handler, Atlas/SSO kapcsolat, személyes adat, UI bekötés vagy böngésző→API→adatbázis integráció. Visszaállítás: tiszta kódcommit-revert, nincs perzisztens mellékhatás. HO-04 adapter unit szinten teljesült; szerver DTO és képernyő-integráció továbbra is nyitott.

## T-HG-113 · SSO permission outage grace · 2026-10-25

| Parancs / próba     | Eredmény                      | Környezet és korlát                                                                                           |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm test`          | PASS, 32 pass, 0 fail, 1 skip | Node.js local unit/domain suite; a Mongo replica-set integráció kihagyva, mert nincs `HABI_TEST_MONGODB_URI`. |
| `npm run lint`      | PASS, exit 0                  | Biome.                                                                                                        |
| `npm run typecheck` | PASS, exit 0                  | TypeScript.                                                                                                   |
| `npm run build`     | PASS, exit 0                  | Next.js 16.4.3.                                                                                               |

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

| Check | Result | Scope |
| --- | --- | --- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 118 tests, 0 failures | Isolated local Mongo replica-set integration; migration 011 applies twice safely. Synthetic data only. |
| `npm run lint` | PASS, exit 0 | Biome over `src` and `tests`. |
| `npm run typecheck` | PASS, exit 0 | TypeScript. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3; includes `/admin`, `/api/admin/*`, and `/invite/claim`. |
| `git diff --check` | PASS, exit 0 | Local worktree. |

The callback now records the verified issuer/subject and Habi app permission in the SSO owner session. Only an SSO `admin` permission creates the session-bound admin grant; no email address is hard-coded. Invitation tokens are random, seven-day, one-use links with only keyed hashes stored. Claim binds the invite to the exact verified identity and creates identity/actor/membership/player/role-session within one Mongo transaction. Focused tests cover token tampering, admin denial, invite expiry/revocation, role scope and same-identity retry. These are code/local DB proofs, not hosted SSO or a live user-flow proof.

**Not delivered to Production:** the changes remain uncommitted; migration 011 is not applied there; no active tenant or approved retention/controller policy references are established; role API operations remain fail-closed in the current SSO-browser runtime; the local admin interface supports roster lookup and invitation/membership revocation; the root page still displays the old diary UI; and no production role workspace is connected. No Atlas records were changed. A real invitation cannot be issued until the tenant/policy inputs and role runtime cutover are resolved.

## T-HG-133 · Initial tenant identifier `habi` · 2026-10-26

> Historical snapshot: the tenant was not yet initialized at this point. The MVP bootstrap now uses the explicit draft policy references described below; see T-HG-136.

- Added the non-secret Vercel Production setting `HG_TENANT_ID=habi` to the explicitly linked `narimato/habi` project. Verified the variable name and Production target with `vercel env ls`; secret values were not read.
- Updated SSO runtime validation to require a valid `HG_TENANT_ID`. Admin invitation lookup now exposes only the configured tenant, and invitation creation rejects any different tenant identifier. The admin empty-state explains that tenant creation and approved data policies are still required.
- This change is local and has not been deployed. No Atlas record or migration was written. The `habi` tenant identifier is configured, but a valid tenant document cannot be created until its approved retention and controller policies are supplied. The intended admin account is `moldovancsaba@gmail.com`; admin access remains based on the verified DoneIsBetter Habi application `admin` permission, never an email allowlist.

| Check | Result | Scope |
| --- | --- | --- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 118 tests, 0 failures | Local synthetic replica set only; no production data touched. |
| `npm run lint` | PASS, exit 0 | Biome checked 169 source/test files. |
| `npm run typecheck` | PASS, exit 0 | TypeScript. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3; `/admin`, invitation, and claim routes compile. |
| `git diff --check` | PASS, exit 0 | Current local worktree. |

Owner selected “Draft policies for my review” on 2026-10-26. Two Hungarian policy drafts were prepared in `docs/policies/`. They propose operational retention values for review, explicitly mark the controller/processor model and lawful bases unresolved, and cannot be used as active tenant policy IDs. No tenant record was created and no personal data was enabled.

## T-HG-134 · Local synthetic Habi MVP and Funnel smoke test · 2026-10-26

| Check | Result | Scope |
| --- | --- | --- |
| `npm run test:workflow:local` with `.env.test.example` | PASS, exit 0 | Local replica set database `habi_workflow_test`, synthetic tenant/player/parent/coach records only. |
| `worker/.env.test.example` + `uv run python -m habi_worker.cli run-service` | PASS | Local-test worker claimed and completed one `personalInterpretation` and one `reportScan` job. ClamAV returned `clean`; the Qwen local model returned a `no_evidence` result for the synthetic question. |
| `verify-local` and `smoke-local` with `worker/.env.example` | PASS, exit 0 | Verified Ollama `0.40.3`, `qwen2.5:7b` digest `845dbd…697e`, prompt hash, and one synthetic local inference. |
| Anonymous request to Funnel `/api/tags` | Expected 401 | Public URL maps to `127.0.0.1:11435`; gateway denies a request without its bearer credential. |
| Authenticated Funnel `/api/chat` with synthetic prompt | PASS, HTTP 200 | Model `qwen2.5:7b` returned exact marker `HABI_FUNNEL_TEST_OK`; the credential was read from its owner-only file and never printed. |

The first acceptance attempt stopped before workflow execution because its homepage assertion expected client-rendered text in the server response. The test now checks the stable server-rendered app shell; the full acceptance was rerun successfully. Expected denials during the successful run included the designed 403/404/409 cases.

This verifies the local synthetic Habi workflow and separately verifies that the existing authenticated Tailscale Funnel gateway can reach Ollama. The Funnel is currently the **ClassScout** gateway, not Habi configuration. Habi's tested worker still calls its local loopback Ollama directly; no Habi worker traffic was sent through Funnel. No Vercel/Atlas data, real identities, personal records, or Production deployment were used. The test app and worker were stopped after the run; the MongoDB listener was already running before the test and was left alone.

### T-HG-135 · Local AI evidence-contract correction · 2026-10-26

The `no_evidence` result above was traced to a model-format mismatch: Qwen returned a bare source ID while the worker correctly requires an exact `{id, revision, span}` reference. The worker prompt now states the exact object shape, exact manifest matching, and allowed claim kinds; the validator remains strict and does not accept bare IDs.

| Check | Result | Scope |
| --- | --- | --- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 118 tests | Isolated local replica set and synthetic fixtures. |
| `npm run lint` | PASS, exit 0 | Biome checked 169 source/test files. |
| `npm run typecheck` | PASS, exit 0 | TypeScript. |
| `npm run build` | PASS, exit 0 | Next.js production build; admin, invite, API and worker routes compiled. |
| `uv run python -m unittest discover -s tests -v` (`worker/`) | PASS, 18 tests | Synthetic fixtures and mocked model response; includes accepting an exact reference and rejecting a string-only reference. |
| `npm run test:workflow:local` with `.env.test.example` and the local worker | PASS, exit 0 | Full synthetic browser/API/database/worker workflow; no production services or records. |
| Worker interpretation log | PASS, `resultStatus=awaiting_review`, `claimCount=1` | Actual local `qwen2.5:7b` inference against the synthetic workflow question. |
| Worker report-scan log | PASS, `verdict=clean` | Synthetic uploaded PDF scanned by local ClamAV `1.5.4/28164`. |
| `git diff --check` | PASS, exit 0 | Current worktree. |

The answer is source-backed but remains `awaiting_review`; it is not shown as an approved personal explanation. The test establishes that the model now returns a valid claim with a source reference through the local worker path. It does not test Habi over Funnel: the worker and Ollama are on the same Mac and use loopback, while the existing public Funnel belongs to the separate ClassScout Ollama gateway. The temporary app and worker were stopped after the run; the pre-existing local synthetic MongoDB process was left running.

## T-HG-136 · Production Habi workspace and admin release candidate · 2026-10-26

The production target remains Vercel project `narimato/habi`, with `https://habigoal.com` as the canonical Habi product origin. The release switches the hosted runtime to `role-workflow`, replaces the root legacy diary view with the Habi role workspace, and makes `/admin` the separate SSO-admin-only console. The owner has stated that legacy records do not need to be migrated. No old records are deleted by this release.

The admin console includes an explicit, idempotent “Prepare Habi MVP” action. After the verified DoneIsBetter account has the Habi `admin` permission, it applies the versioned additive schema migrations and creates tenant `habi` only if absent, with the two clearly named MVP draft policy references. It does not overwrite a tenant with different policy references. The owner selected draft policies for MVP review and stated GDPR is not a blocker for MVP functional testing; these references do not claim legal approval or configure a final retention/controller decision.

| Check | Result | Scope |
| --- | --- | --- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 120 tests, 0 failures | Isolated local replica set; synthetic records only. |
| `npm run lint` | PASS, exit 0 | Biome checked 172 files. |
| `npm run typecheck` | PASS, exit 0 | TypeScript. |
| `npm run build` | PASS, exit 0 | Next.js production build includes `/`, `/admin`, bootstrap, invitation and claim routes. |
| `uv run --frozen python -m unittest discover -s tests -v` (`worker/`) | PASS, 18 tests | Worker contract and local model-runtime fixtures. |
| `git diff --check` | PASS, exit 0 | Current worktree. |

Historical release candidate note. The completed production checks and remaining admin action are recorded in T-HG-137.

## T-HG-137 · Production release, local worker and admin reauthentication · 2026-10-26

Production commit `f3b2cc1` is deployed to `https://habigoal.com`. The root serves the new role workspace and `/admin` serves the separate SSO-admin console. Legacy diary data does not need to be moved; this release does not delete it.

| Check | Result | Evidence/scope |
| --- | --- | --- |
| `npm run lint` | PASS, exit 0 | Biome checked 172 source/test files. |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 120 tests, 0 failures | Isolated local Mongo replica set; synthetic data. |
| `npm run build` | PASS, exit 0 | Next.js production build includes `/admin` and the Habi workspace. |
| `uv run --frozen python -m unittest discover -s tests -v` (`worker/`) | PASS, 18 tests | Worker contract/runtime unit tests. |
| Worker `verify-local` | PASS | Qwen `qwen2.5:7b`, expected local model digest and prompt hash verified without printing credentials. |
| Production `GET /`, `GET /admin`, `GET /api/health`, `GET /api/ready` | PASS, HTTP 200 | Vercel production domain and deployment `dpl_3tjGFXU3QfoUMao7ZqvxzGPqFC7E`. |
| Production SSO sign-in route | PASS | Admin reauthentication link includes `prompt=login`, returns to `/admin`, and opens the DoneIsBetter login screen. No password was entered by the agent. |
| Local Mac LaunchAgent | PASS, running | `com.doneisbetter.habi-worker`; logs show hosted mode and model verification. Initial missing Homebrew PATH was corrected in the launch script. |
| Hosted worker claim API | PASS, HTTP 204 | Vercel request logs show repeated authenticated `POST /api/v1/worker/jobs/claim`; 204 means the worker is connected and no eligible work was waiting. |

The admin screen previously showed an access-denied state without a way to reauthenticate. It now explains that the current SSO account lacks the Habi admin claim and provides **Újra bejelentkezem adminisztrátorként**, which requests a fresh DoneIsBetter login and returns to `/admin`. In the managed browser, `/admin` currently renders the sign-in option. A successful admin SSO login, tenant bootstrap, first invitation and role claim remain pending the owner completing sign-in as the DoneIsBetter account with the Habi `admin` permission. No Production tenant or role records were created by anonymous checks; no legacy records were modified.

## T-HG-138 · First-login SSO migration deadlock · 2026-10-26

The owner reported `INTERNAL_ERROR` for callback request `bdb24b20de75383486ecb60c09264dc3`. Vercel logs mapped it to Production `GET /api/oauth/callback` at `2026-10-26T14:53:48Z`. The session writer had begun storing the verified issuer, subject, and Habi permission role, while the Production Mongo validator still required migration 011. Since 011 had been gated behind successful admin login, the callback could not finish the login required to run that migration.

The callback now runs the two ordered, versioned session prerequisites after OIDC identity and Habi permission validation, but before creating the identity link or session. It does not run the full migration set, create tenant `habi`, assign roles, or import/delete old records. Migration selection rejects duplicate or unknown IDs; migration checksums and normal idempotency remain enforced. The tenant bootstrap remains an explicit admin action after login.

| Check | Result | Environment |
| --- | --- | --- |
| `npm run lint` | PASS, exit 0; 172 files | Local |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 121 tests, 0 failures; includes the isolated callback-prerequisite schema/idempotency case | Disposable local Mongo replica set |
| `npm run typecheck` | PASS, exit 0 | Local |
| `npm run build` | PASS, exit 0; callback and admin routes included | Local production build |
| Production deployment `dpl_5CAdY57PGmJEYVucP8UwXfeuiRQo` | READY; commit `0c58afd` | Vercel Production project `narimato/habi`; aliased to `https://habigoal.com` |
| Production `GET /`, `/admin`, `/api/health`, `/api/ready` | PASS, HTTP 200 | `https://habigoal.com` |
| Production callback without a login transaction | PASS, HTTP 303 to `/?signin=failed` | Expected fail-closed response; does not prove a real SSO login |
| Live authenticated SSO callback | Not yet re-verified | Requires the owner to complete DoneIsBetter sign-in after Production deployment |

Rollback is an application deployment rollback only. Keep applied additive migration records and collections; do not delete migration ledger entries or old diary data.

## T-HG-139 · Repeated SSO callback denial · 2026-10-26

After the owner reported a sign-in loop, Production logs showed repeated `/api/oauth/callback` responses with `APP_PERMISSION_DENIED` (including request IDs `72qkx-1793027975355-e3c1b2446055`, `26st9-1793027967982-72a70b52cf72`, and `fcmrk-1793027953590-5c308d3d1262`). These callbacks returned 303 without creating an owner session. Subsequent `/api/admin/me` and `/api/v1/me` requests correctly returned 401. The callback is rejecting the identity because the DoneIsBetter permission check does not report an approved Habi app permission; this is not a Mongo migration error.

The callback now returns to the original safe same-origin page with a fixed failure code. An `/admin` sign-in attempt returns to `/admin`, where the UI explains that DoneIsBetter must grant this account Habi access and the `admin` permission before retrying. Authorization remains fail-closed; no email allowlist or fallback role was added. This UI fix cannot grant the external SSO permission.

| Check | Result | Environment |
| --- | --- | --- |
| `npm run lint` | PASS, exit 0; 172 files | Local |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, 121 tests, 0 failures | Disposable local Mongo replica set |
| `npm run typecheck` | PASS, exit 0 | Local |
| `npm run build` | PASS, exit 0 | Local production build |
| DoneIsBetter app permission for the owner | BLOCKED; provider returned denial | Must be granted in DoneIsBetter before another login attempt |
