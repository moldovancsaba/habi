# Habi — ellenőrzési napló

## T-HG-115 · API hiba-envelope és redakció · 2026-10-25

| Parancs / próba | Eredmény | Környezet és korlát |
| --- | --- | --- |
| `npm test` | PASS, 37 pass, 0 fail, 1 skip | Local Node suite; Mongo replica-set integration skipped because no test URI is set. |
| `npm run lint` | PASS, exit 0 | Biome. |
| `npm run typecheck` | PASS, exit 0 | TypeScript. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3; no new routes. |

The API helper maps each documented public error class to a stable HTTP status and exact `{code, requestId, retryAfter}` shape. Unknown codes become generic 500 `INTERNAL_ERROR`; raw exception messages, stack traces, connection URIs, and credential fragments are not serialized. All responses are `private, no-store`; valid retry delay is an integer and is reflected in `Retry-After`. No automatic retry is performed.

Unit coverage only; the helper is not yet connected to route handlers, so this does not prove production API redaction or retry behavior. No service/DB/SSO calls or personal data. Rollback is a code revert with no persistent effect.

## T-HG-114 · Idővonal DTO → view-model adapter · 2026-10-25

| Parancs / próba | Eredmény | Környezet és korlát |
| --- | --- | --- |
| `npm test` | PASS, 35 pass, 0 fail, 1 skip | Synthetic DTO fixture; Mongo replica-set integráció kihagyva, mert nincs `HABI_TEST_MONGODB_URI`. |
| `npm run lint` | PASS, exit 0 | Biome. |
| `npm run typecheck` | PASS, exit 0 | TypeScript. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3; a route inventory nem változott. |

Az adapter a szerződött `submittedAt → at`, `actorRole → role`, `kind → type` mappinget végzi; megőrzi ID/revision/processId/replyTo/relatedId, server-process `closedAt`, edges, continuations, nextCursor, snapshotAt és explicit accessRevision állapotot. Nincs storage-only tenant/retention/audit field, email, text, title vagy author másolás. Hiányzó Processből nem következtet lezárásra. A malformed page/node/process elutasított, nem csendben elhagyott. A view model és a tömbjei immutable.

Nincs API-handler, Atlas/SSO kapcsolat, személyes adat, UI bekötés vagy böngésző→API→adatbázis integráció. Visszaállítás: tiszta kódcommit-revert, nincs perzisztens mellékhatás. HO-04 adapter unit szinten teljesült; szerver DTO és képernyő-integráció továbbra is nyitott.

## T-HG-113 · SSO permission outage grace · 2026-10-25

| Parancs / próba | Eredmény | Környezet és korlát |
| --- | --- | --- |
| `npm test` | PASS, 32 pass, 0 fail, 1 skip | Node.js local unit/domain suite; a Mongo replica-set integráció kihagyva, mert nincs `HABI_TEST_MONGODB_URI`. |
| `npm run lint` | PASS, exit 0 | Biome. |
| `npm run typecheck` | PASS, exit 0 | TypeScript. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3. |

Az új permission policy adapter minden hívásnál először a friss SSO-ellenőrzést próbálja. SSO-hálózati/kiesési hibánál legfeljebb 60 másodperces approved cache kizárólag normál `read` műveletet tarthat fenn; hiányzó, lejárt vagy jövőből származó timestamp elutasított. `write`, `publish` és `worker_context` offline mindig `SSO_DEPENDENCY_UNAVAILABLE`; sikeres friss revocation törli a korábbi cache-engedélyt. Fetch timeout/network hibák stabil unavailable hibakódra normalizálódnak; váratlan checker hiba általános, zárt `SSO_PERMISSION_CHECK_FAILED` választ ad. A cache issuer/subject/client scope-ra különül, process-local és 256-entry boundot alkalmaz; csak hash-kulcsot és minimális engedélyállapotot tárol.

A próbák fake permission checkerrel futottak; nem történt SSO/Atlas/Vercel kapcsolat, secret olvasás, deploy vagy személyes adatkezelés. Ez a kód még nincs auth middleware-be kötve, ezért a termékrequestekre nem állítunk aktív jogosultságvédelmet. Rollback: új adapter és teszt törölhető; nincs adatbázis- vagy user-state változás. SSO credential lifecycle döntés továbbra is kell a hosted friss permission ellenőrzésekhez.

## T-HG-112 · JWKS kulcsrotáció és session ID kontraktus · 2026-10-25

| Parancs / próba | Eredmény | Környezet és korlát |
| --- | --- | --- |
| `npm test` | PASS, exit 0; 27 pass, 0 fail, 1 skip | Az Atlas replica-set integration case kihagyva, mert ebben a futásban nem volt `HABI_TEST_MONGODB_URI`; JWKS-próba generált RSA kulcspárral és fake fetch-sel futott. |
| `npm run lint` | PASS, exit 0; 31 fájl | Biome, figyelmeztetés nélkül. |
| `npm run typecheck` | PASS, exit 0 | TypeScript. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3; auth route továbbra sincs a route inventoryban. |
| `git diff --check` | PASS, exit 0 | Nincs whitespace-hiba. |

Az ismeretlen `kid` egyszeri JWKS-frissítése csak jól formált RS256 JWT fejlécre indul; hibás token nem generál hálózati kérést, az ismeretlen kulcs frissítés után elutasított marad. Minden JWKS HTTP-kérés no-store és legfeljebb öt másodperces. A session ID Base64URL-ről hexre változott, mert a Base64URL véletlen érték `_` vagy `-` karakterrel kezdődhetett, amely megsértette a közös alfanumerikus kezdőkarakterű ID-sémát. Ez a szerződés alapján intermittáló session-kiadási hibát okozhatott.

Nem történt SSO/Atlas/Vercel hívás, deploy vagy adatváltozás. Rollback: az új helper és a session ID kód visszaállítható; ez csak újonnan létrejövő sessionazonosítók alakját érinti, a meglévő session rekordokat nem migrálja. A hosted SSO-folyamat és a permission credential lifecycle továbbra is blokkolt a szükséges 60 másodperces ellenőrzési megoldásról szóló döntésig.

## T-HG-110 · OIDC és session alapprimitívek · 2026-10-25

| Parancs / próba | Eredmény | Környezet és korlát |
| --- | --- | --- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, exit 0; 36/36, 0 skip | Node.js 24.20; lokális MongoDB 8.0.24 egynode-os replica set; 9 Mongo-integrációs alteset. OIDC HTTP-függőségek fake fetch-sel; nincs élő SSO/Atlas/hosted próba. |
| `npm run lint` | PASS, exit 0; 31 fájl | Biome, figyelmeztetés nélkül. |
| `npm run typecheck` | PASS, exit 0 | TypeScript, `tsc --noEmit`. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3; route inventory változatlan, auth függvények még nincsenek bekötve. |
| `git diff --check` | PASS, exit 0 | Nincs whitespace-hiba. |

OIDC: felfedezési issuer pontos egyezés és az issuer HTTPS originjén belüli endpointok; S256 authorization URL; JSON `client_secret_post` tokencsere; JWKS-alapú, kizárólag RS256 aláírás és `iss/aud/azp/exp/iat/nonce` ellenőrzés; userinfo és `approved` + `user|admin` app-permission ellenőrzés; minden hálózati kérés öt másodperces timeouttal, `no-store` beállítással. A session alapréteg 256 bites opaque tokent, csak HMAC-SHA256 hash tárolást, sessionhöz kötött CSRF tokent, 8 órás abszolút és 30 perces inaktivitási határt, touch/revoke műveletet ad. A `(issuer,subject)` feloldó csak aktív helyi actort, aktív nem lejárt membershipet, aktív tenantot és tenanton belül létező playert fogad el; email-alapú összefűzés nincs.

Nincs még route-level flow, ismeretlen `kid` esetén egyszeri JWKS refresh, permission-token lifecycle, session-authorization middleware, idempotens logout/scope rotáció, SSO kliensregisztráció vagy live login. A 60 másodperces permission recheckhez szükséges credential-modellről döntésre várunk. Nincs Atlas/Vercel művelet, token secret Vercelből olvasás, felhasználói adat vagy deploy. Rollback: a mostani kódcommit visszaállítható; az új, belső transaction collection adatot csak az adott 10 perces TTL ablakban tarthat. Session kód még nem része egy elérhető route-nak.

## T-HG-109 · Login-tranzakciós alap · 2026-10-25

| Parancs / próba | Eredmény | Környezet és korlát |
| --- | --- | --- |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, exit 0; 26/26, 0 skip | Node.js 24.20; lokális MongoDB 8.0.24 egynode-os replica set, kizárólag eldobható szintetikus `_test` DB. 8 Mongo integrációs alteset. SSO/Atlas/hosted route nincs hívva. |
| `npm run lint` | PASS, exit 0; 25 forrás-/tesztfájl | Biome; nulla lint/format hiba. |
| `npm run typecheck` | PASS, exit 0 | TypeScript, `tsc --noEmit`. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3/Turbopack; az új auth route még nincs bekötve. |
| `git diff --check` | PASS, exit 0 | Nincs whitespace-hiba. |

Elkészült a 36 termékszerződés szerinti collectiontól különálló `auth_transactions` belső tároló, szigorú Mongo validatorral, state-hash és aktív browser-binding egyedi indexszel, valamint tízperces TTL indexszel. Az új `002-auth-transactions` forward migration hozzáadja ezt a tárolót; a már kiadott `001-initial-schema` fájl változatlan. A state egyszer használható, browser-bound és lejáratot ellenőrző atomic `findOneAndUpdate` útvonalat kapott. A második login ugyanazon browser bindinggel az első tranzakciót invalidálja. `returnTo` csak same-origin relatív útvonal lehet; az authorize URL S256 PKCE paramétereket épít.

Ez csak a szerveroldali tranzakciós alap és helyi próba. Hosted `/auth/login` és `/auth/callback`, OIDC discovery/token/JWKS ellenőrzés, app-permission, identity/membership adapter, session/CSRF/logout/scope váltás, SSO kliensregisztráció és live login még nincs. A Habi SSO client/secret és új Atlas cél nincs igazolva; titkos Vercel értéket nem olvastunk, és nem futott távoli migráció/deploy. Rollback: az új kiadást vissza lehet állítani; a már alkalmazott 002 collection/index eltávolítása nem automatikus, a tízperces tranzakciótár elhagyható vagy külön reviewed forward migrationnel takarítható. Nincs személyes adat vagy éles felhasználói hatás.

## T-HG-108 · Perzisztencia, migráció és seed · 2026-10-25

| Parancs / próba                                            | Eredmény                                                             | Környezet és korlát                                                                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                   | PASS, exit 0; 50 csomag, 0 audit finding                            | Node.js 24.20.0 / npm; lockfile szerinti tiszta install.                                                                                             |
| `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` | PASS, exit 0; 20 test, 0 skip; ezen belül 7 MongoDB integrációs eset | Lokális MongoDB 8.0.24 egynode-os replica set, kizárólag szintetikus fixture. A szerver API, Atlas-kapcsolat, SSO és személyes adat nincs tesztelve. A 27 domain referencia-szcenárió is PASS. |
| `npm run db:migrate:test` explicit localhost `_test` célon | PASS, exit 0; `001-initial-schema` alkalmazva                        | 36 collection, contract validator és indexek. A parancs csak localhost és `HG_ENVIRONMENT=test` értéknél engedélyezett; Vercel/Atlas címet elutasít. |
| `npm run db:seed:test` kétszer                             | PASS; első futás 4 insert, második 0                                 | Két szintetikus tenant és két játékos; tenantonként azonos játékos-ID, eltérő timeZone marker. A DB-t a próba után eldobtuk.                         |
| `npm run db:migrate:test` konfigurációs guard nélkül       | Várt elutasítás, exit 1                                              | `LOCAL_TEST_MIGRATION_ONLY`; DB-kapcsolat nem nyílt.                                                                                                 |
| `npm run lint`                                             | PASS, exit 0; Biome 22 fájl                                        | Hiba és figyelmeztetés nélkül.                                                                                                                       |
| `npm run typecheck`                                        | PASS, exit 0                                                        | TypeScript statikus ellenőrzés.                                                                                                                      |
| `npm run build`                                            | PASS, exit 0; Next.js 16.4.3                                       | `/`, `/_not-found` statikus; `/api/health` és `/api/ready` dinamikus.                                                                                |

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
