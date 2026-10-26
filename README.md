# Habi

A Habi fiatal sportolók, jogosult szülők és edzők közös támogatási terméke. **Habigoal** a kliensbemutató prototípus és a specifikáció neve; a leszállítandó termék neve **Habi**. Ez a repository a Habi alkalmazás forrása.

## Állapot

A Production kezdőlap a Habi MVP új Next.js felülete: [https://habi.doneisbetter.com](https://habi.doneisbetter.com). A Habi-napló továbbra is elérhető a kezdőlapról a korábbi browser-owner adatútvonalon; a meglévő `habi_states` rekordok ugyanazzal a HttpOnly cookie-hash tulajdonoskulccsal olvashatók és írhatók, migráció nélkül. A felület a böngésző korábbi mentett állapotát is megőrzi, ha a felhős API nem elérhető vagy van még szinkronizálatlan helyi változás. A hiányzó napokra szintetikus mintatörténet nem készül. A Production adatcél a `habi` adatbázis; a Preview külön `habi_preview` adatbázist használ. Az új player/parent/coach workflow API-k és a SSO későbbi fázisban maradnak, MVP módban fail-closed állapotúak. Lásd [ellenőrzési napló](docs/verification.md) és [telepítési állapot](docs/deployment.md).

- a játékos napi állapotjelzése, a válaszok mentése, az idempotens újrapróbálás és a változatlan lezárt visszajelzés;
- a szülői és edzői megfigyelések külön rögzítővel és forrásmegjelöléssel;
- az edzői megfigyelés szülői láthatósága kizárólag az adott revision külön publikálása után;
- a szerepkör szerinti láthatóság, az aláírt lapozókurzor és a tenantok közötti hozzáférés megtagadása (korábbi ellenőrzött alap);
- edzői tervjavaslat, szülői/játékosi elfogadás és vállalt tervhez kapcsolt utánkövetés;
- tartós szülői kérdés/thread/job; a Mac worker helyi Ollamával dolgozik, internet/API/AI függőséghibánál késleltetetten újrapróbálja a jobot, bizonyíték nélküli választ pedig `no_evidence` állapotban tart;
- idővonal-végpont és szintetikus UI-idővonal;
- verziózott edzői anyag és pontos verzió publikálása;
- PDF chunk-feltöltés GridFS karanténba, ClamAV-vizsgálat, kézi extraction és mezőnkénti coach-review.
- Verziózott játékosi gyakorlatkönyvtár; a játékos visszajelzése újratölthető, saját diary rekordként mentődik.

> **A teljes régi HABI-funkciók migrációja nincs kész, a produkciós rendszer nincs engedélyezve.** A lokális szintetikus acceptance a szerepköri munkafolyamatot, worker-kérdést, PDF-karantént és scan-t, kézi extraction-review-t, publikált edzői anyagot, tervelfogadást/utánkövetést és újratölthető szülői beszélgetést ellenőrzi. Ez nem igazol személyes adatot, valódi sportjelentés-értelmezést vagy hosted integrációt. A korábbi gyakorlatok, helyzetalapú utak, havi visszatekintés, trendek, HABI2 és helyi adatok migrációs állapotát a [legacy funkció-mátrix](docs/legacy-feature-migration.md) rögzíti. A DoneIsBetter SSO, dedikált Habi Atlas-adatbázis és Vercel-konfiguráció, consent/retention jóváhagyás és személyes pilot külön fázis. A helyi szintetikus belépés kizárólag localhoston használható.

## Szükséges eszközök

- Node.js 20.19+, 22.13+ vagy 24+
- MongoDB `mongod`, amely támogatja a helyi replica setet
- npm
- A worker ellenőrzéséhez: Python/uv és helyi Ollama. Lásd a [`worker/README.md`](worker/README.md) útmutatót.

## Helyi, szintetikus tesztkörnyezet

A `habi` repository gyökeréből:

1. `npm ci`
2. Töltsd be a helyi tesztbeállításokat: `set -a; source .env.test.example; set +a`
3. Indítsd el a teszt MongoDB-t: `npm run db:test:start`
4. Egy terminálablakban indítsd el az alkalmazást: `npm run dev:test`
   Ha a buildelt alkalmazást akarod ellenőrizni: töltsd be ugyanazt a szintetikus konfigurációt, futtasd a `npm run build` parancsot, majd indítsd a `npm run start:test` paranccsal. Mindkét szerver kizárólag a localhost címhez kötődik.
5. ClamAV szükséges a quarantined PDF vizsgálatához. macOS-en telepítsd: `brew install clamav`, majd inicializáld az adatbázist: `sed 's/^Example$/#Example/' /opt/homebrew/etc/clamav/freshclam.conf.sample > /opt/homebrew/etc/clamav/freshclam.conf`, `freshclam`. A `clamscan` parancsnak elérhetőnek és az aláírás-adatbázisnak 48 óránál frissebbnek kell lennie.
6. Indítsd a worker terminálban: `cd worker`, `set -a; source .env.test.example; set +a`, `uv sync --frozen`, majd `uv run python -m habi_worker.cli run-service`.
7. Egy másik terminálablakban is töltsd be a tesztbeállításokat, majd futtasd: `npm run test:workflow:local`.
8. Nyisd meg a `http://127.0.0.1:3000` címet, és vizsgáld meg a magyar nyelvű tesztfelületet billentyűzettel és keskeny képernyőn.
9. Leállítás: a worker és fejlesztői szerveren `Ctrl-C`, majd a tesztbeállításokkal: `npm run db:test:stop`.

`test:workflow:local` kizárólag a localhoston futó `habi_workflow_test` adatbázist törli. Ezután az 001–009 migrációkat, a szintetikus seedet és a HTTP-folyamatot futtatja. A védett script visszautasítja a távoli URI-t, az Atlas-kapcsolatot és a `_test` végződés nélküli adatbázist. A teszt-worker az `.env.test.example` kizárólag szintetikus bearer tokenjét használja, a lokális Ollamát és ClamAV-ot; nem használ Vercel-környezetet, Atlas titkot, felhasználói SSO-t vagy külső AI-szolgáltatást.

## Ellenőrző parancsok

- `npm test` — egység-, szerződés- és domainpróbák; a MongoDB-integrációs próba replica set mellett, `HABI_TEST_MONGODB_URI` változóval fut.
- `npm run test:workflow:local` — adatbázis újraépítése, migráció, seed és HTTP/API/MongoDB szerepköri folyamat.
- `npm run lint` — Biome; `npm run typecheck` — TypeScript; `npm run build` — Next.js production build.
- `cd worker && uv sync --frozen && uv run python -m unittest discover -s tests -v` — worker-konfiguráció és helyi futtatókörnyezet próbái.

## Főbb könyvtárak

- `src/app` — Next.js felület és azonos eredetű API-route-ok.
- `src/lib/auth` — SSO/session segédek; a DoneIsBetter callback még nincs bekötve.
- `src/lib/workflows` — üzleti folyamatok.
- `src/lib/database/migrations` — csak előrefelé futó adatbázis-migrációk.
- `contracts` — API-, adat-, jogosultsági és modellműködési szerződések.
- `worker` — Macen futó modellpróba és kifelé kapcsolódó service loop; lokális tesztmódban szintetikus tokennel feldolgozza a kérdés- és riportvizsgálati jobokat.
- `docs` — architektúra, perzisztencia, telepítés és ellenőrzési bizonyítékok.

## Rendszerhatárok

A tervezett architektúrában a Vercel futtatja a Habi webalkalmazást és API-t, a MongoDB Atlas az alapértelmezett adattár, a Mac pedig csak kimenő kapcsolatot kezdeményező AI-workert futtat közvetlen Atlas-hozzáférés nélkül. A mostani lokális end-to-end próba nem használja a Vercelt vagy az Atlást; izolált, szintetikus MongoDB-t használ. Személyes tartalomhoz külső AI nem használható.

Részletek: [architektúra](docs/architecture.md), [perzisztencia](docs/persistence.md), [telepítés](docs/deployment.md), [ellenőrzési napló](docs/verification.md), [korábbi funkciók migrációja](docs/legacy-feature-migration.md) és [worker](worker/README.md).
