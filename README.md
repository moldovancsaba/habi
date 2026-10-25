# Habi

A Habi a fiatal sportolókhoz és a körülöttük lévő jogosult felnőttekhez tartozó termék. A Habigoal a bemutató és prototípus neve. A Habi alkalmazás forrása ez a repository; a prototípus és a normatív termékszerződések a [Calvus Habi-projektjében](https://github.com/moldovancsaba/calvus/tree/main/habigoal) találhatók.

## Aktuális állapot

Ez a repository a Habi terméket a földről építi újra. A régi alkalmazás forrása nem része a jelenlegi alkalmazásnak; előzménye csak a Git történetében marad. A Habigoal bemutató/prototípus elfogadott szerződései a runtime validáció forrásai, nem futtatható termékkódok. A kódbázis most tartalmaz fail-closed konfigurációt, liveness/readiness végpontot, Atlas kapcsolati réteget, a szerződésekből rögzített séma-pillanatképet, szigorú MongoDB validátorokat, verziózott migrációkat, szintetikus két-tenant seedet, tenant-szűrt olvasást, revision-CAS-t, tranzakciós idempotencia-adaptert, egyalkalmas login-tranzakciós tárolót, OIDC/JWKS és app-permission protokollfüggvényeket, issuer-subject identitásfeloldót, valamint opaque session/CSRF alapot. Ezeket lokális Mongo replica seten és fake SSO válaszokon teszteltük; nincs még Habi Atlas-kapcsolat, hosted SSO-route/session middleware, credential lifecycle, üzleti API-handler, GridFS, Mac worker polling/inference vagy end-to-end szerepköri folyamat.

A terméket a Vercel futtatja. A Mac worker kizárólag kifelé hívja a Vercel API-t és a helyi Ollamát; közvetlen Atlas-kapcsolatot nem kap. A meglévő modellt és hostzárat kell használni. Külső személyes AI-tartalékút nincs.

Az OIDC alapprimitívek ismeretlen `kid` esetén egyszer frissítik a JWKS kulcslistát, majd újra ellenőrzik az aláírást; hibás token nem indít hálózati kérést. A sessionazonosító szerződéskompatibilis, kriptográfiailag véletlen hex érték. Ezek továbbra sem jelentenek kész bejelentkezési útvonalat.

Az SSO app-permission policy minden műveletnél friss ellenőrzést próbál. SSO-kieséskor legfeljebb 60 másodperces korábbi jóváhagyás csak normál olvasást tarthat fenn; írás, publikálás és worker-context kiadása fail-closed. A gyorsítótár process-local, legfeljebb 256 elemű, és nem helyettesíti a még hiányzó hosted auth middleware-t vagy credential lifecycle-t.

Az API-leírás (`contracts/api.json`) és a böngészős válaszsémák a Calvus `1f4c2fa` szerződés-commitjából, külön SHA-256-manifesttel vannak pinelve API 2.3.0-ra. Az idővonal kliens a `TimelinePageReadDTO` és `RecordReadDTO` sémákat használja. A `/v1/timeline` loader csak engedélyezett query paramétereket épít, same-origin transportot használ, a teljes nested DTO-t ellenőrzi — extra storage mezőket is elutasít —, majd a szerveroldalú `submittedAt/actorRole/kind` mezőket `at/role/type` alakra képezi. A játékosazonosítót, `sourceKind`-ot és pontos `resourceRef{id,revision}` hivatkozást megőrzi. `loadTimelineRecord` csak az eventben megadott játékos- és rekordazonosítóra kér le a külön jogosultság-ellenőrzött rekordvégpontról, és csak az ID, játékos és revision egyezése esetén adja vissza a tartalmat. Ez tesztelt kliens→DTO-validáció→adapter és fail-closed részletbetöltési alap, de még nincs UI-ba, auth middleware-be vagy működő szerver API-route-ba kötve.

A `global.css` a Habigoal v101 központi vizuális forrásának byte-pontos másolata. A `design/design-system-manifest.json` a forrás commitját és SHA-256-át rögzíti; a teszt suite eltéréskor hibázik. A `src/app/globals.css` ezt az egy közös stílusforrást tölti be.

A route-ok közös API-határa minden válaszhoz friss request ID-t ad, az ismert és ismeretlen kivételeket redaktált hibaválasszá alakítja, és strukturált, tartalommentes eseményt ír a szerverlogba. A readiness 5xx eseménye is csak műveletet, státuszt és request ID-t tartalmaz. Next.js prerender vezérlőjeleket továbbenged; a liveness/readiness útvonalak csak request időben futnak. Ez a közös határ jelenleg csak a két operációs végpontra van bekötve, nem az üzleti API-kra. A böngészős API-kliens ugyan-origin `/api`/`auth`/`v1` pathot, same-origin cookie-t és `no-store` fetch-t kényszerít ki; elkülöníti az offline/abort/HTTP/protocol hibát és nem retry-zik. A timeline loader a rögzített szerződés-validátort használja; általános `/v1/*` híváshoz továbbra is kötelező caller-supplied validátor. Ez még nincs UI-ba vagy üzleti route-ba kötve.

## Helyi ellenőrzés

Node.js 20.19+, 22.13+ vagy 24+.

- `npm ci` — lockfile szerinti telepítés.
- `npm test` — konfigurációs és domain-referencia próbák.
- `HABI_TEST_MONGODB_URI='mongodb://127.0.0.1:27099/?replicaSet=habiTestRs' npm test` — teljes MongoDB replica-set integrációs próbák, ha a helyi teszt-replica fut.
- `npm run db:migrate:test` — csak explicit `HG_ENVIRONMENT=test`, `HG_MIGRATION_ALLOW_LOCAL_TEST_DB=true`, localhost URI és `_test` nevű DB mellett migrál.
- `npm run db:seed:test` — ugyanazokkal a localhost-only guardokkal determinisztikus szintetikus két-tenant fixture-t helyez el.
- `npm run lint` — Biome statikus ellenőrzés.
- `npm run typecheck` — TypeScript ellenőrzés.
- `npm run build` — Vercel/Next.js production build.
- `uv sync --frozen` a `worker/` mappában — Python worker környezet zárolt telepítése.
- `uv run python -m unittest discover -s tests -v` a `worker/` mappában — worker-konfigurációs próbák.

Ez a checkout a `narimato/habi` Vercel projekthez van kapcsolva (`.vercel/`, lokális és gitignore-olt). A projekt a Habi termék célkörnyezete. A korábbi `habi_mongodb_uri` titok értékét nem olvastuk, és az új runtime nem használja. SSO/session/Atlas konfiguráció, dedikált DB cél és integráció nincs igazolva. A jelen migrációs és seed CLI szándékosan csak localhost `_test` DB-t enged; nem kapcsolódik a Vercelhez vagy Atlas productionhöz. Production migrációs út, felülvizsgálat, backup/restore próba és külön jóváhagyás még kiépítendő.

## Futtatási határok

- Vercel: Next.js webapp és ugyan-origin API.
- MongoDB Atlas: kanonikus adattár; riportfájlok a specifikáció szerinti GridFS-ben.
- Hitelesítés: DoneIsBetter SSO.
- Mac: kifelé kapcsolódó helyi AI-worker, meglévő Ollama `qwen2.5:7b` és hostzár.
- Worker nem kap Atlas URI-t vagy felhasználói SSO hitelesítőt.
- Személyes adatot és gyerekadatot csak külön jóváhagyott consent/policy és izolált tesztkörnyezet után lehet feldolgozni.

Lásd az [architektúrát](docs/architecture.md), az [alacsony szintű perzisztenciatervet](docs/persistence.md), a [kiadási/restore kapukat](docs/deployment.md), a [verification naplót](docs/verification.md) és a [meglévő #35 szállítási feladatot](https://github.com/moldovancsaba/calvus/issues/35) a részletes elfogadási feltételekért és átadási pontokért.
