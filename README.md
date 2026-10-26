# Habi

A Habi fiatal sportolók, jogosult szülők és edzők közös támogatási terméke. **Habigoal** a kliensbemutató prototípus és a specifikáció neve; a leszállítandó termék neve **Habi**. Ez a repository a Habi alkalmazás forrása.

## Állapot

A kiválasztott termékcím [habigoal.com](https://habigoal.com); a `www` cím erre irányít át. A gyökéroldal a játékos/szülő/edző Habi-munkaterületre vezet, az adminisztráció címe [habigoal.com/admin](https://habigoal.com/admin). A szerepkör-hozzárendelés DoneIsBetter adminengedélyhez kötött meghívással és a meghívott ellenőrzött SSO-identitásának claimjével működik. A production tenant azonosítója `habi`, adatbázisa `habi`; a régi naplóadatok migrációja nem szükséges. A Habi worker a Macről HTTPS-en hívja a hosted API-t, és a helyi Ollamát használja. Lásd a [felhasználói útmutatót](docs/user-guide.md), az [ellenőrzési naplót](docs/verification.md) és a [telepítési állapotot](docs/deployment.md).

- a játékos napi állapotjelzése, a válaszok mentése, az idempotens újrapróbálás és a változatlan lezárt visszajelzés;
- a szülői és edzői megfigyelések külön rögzítővel és forrásmegjelöléssel;
- az edzői megfigyelés szülői láthatósága kizárólag az adott revision külön publikálása után;
- a szerepkör szerinti láthatóság, az aláírt lapozókurzor és a tenantok közötti hozzáférés megtagadása (korábbi ellenőrzött alap);
- edzői tervjavaslat, szülői/játékosi elfogadás és vállalt tervhez kapcsolt utánkövetés;
- tartós szülői kérdés/thread/job; a Mac worker helyi Ollamával dolgozik, internet/API/AI függőséghibánál késleltetetten újrapróbálja a jobot, bizonyíték nélküli választ pedig `no_evidence` állapotban tart;
- szerepkör szerinti áttekintés, napló, állapotjelzés, beszélgetés, metróvonalas idővonal, riport-/terv- és felmérésfelület, valamint kereshető Tudástár;
- verziózott edzői anyag és pontos verzió publikálása;
- PDF chunk-feltöltés GridFS karanténba, ClamAV-vizsgálat, kézi extraction és coach-review; ellenőrzött extractionből forrásolt kérés a helyi AI felé, állapotkövetéssel.
- Verziózott játékosi gyakorlatkönyvtár; a játékos visszajelzése újratölthető, saját diary rekordként mentődik.
- Feladatok és visszajelzések a natív, szerepkörös munkaterületen: elfogadható/elutasítható edzői feladatok, mentett utánkövetés és feladathoz rendelt visszajelzési előzmény. Edzői kérdőív-PDF feltöltése, mérési adatok kézi rögzítése és jóváhagyása.

> **MVP:** a játékos napi állapotjelzést küldhet; a szülő és edző megfigyelést rögzíthet; a szülő forrásolt kérdést küldhet a helyi AI-nak; a riportfeltöltést helyi worker vizsgálja; az edző anyagokat publikálhat és vállalásokat követhet. A személyes AI-magyarázatok edzői ellenőrzésig nem jelennek meg kész válaszként. A `/admin` felület kezeli a meghívásokat és szerepkörök visszavonását.

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
- `src/lib/auth` — OIDC callback, owner/session segédek és a későbbi role-workflow session kód.
- `src/lib/workflows` — üzleti folyamatok.
- `src/lib/database/migrations` — csak előrefelé futó adatbázis-migrációk.
- `contracts` — API-, adat-, jogosultsági és modellműködési szerződések.
- `worker` — Macen futó modellpróba és kifelé kapcsolódó service loop; lokális tesztmódban szintetikus tokennel feldolgozza a kérdés- és riportvizsgálati jobokat.
- `docs` — architektúra, perzisztencia, telepítés és ellenőrzési bizonyítékok.

## Rendszerhatárok

A tervezett architektúrában a Vercel futtatja a Habi webalkalmazást és API-t, a MongoDB Atlas az alapértelmezett adattár, a Mac pedig csak kimenő kapcsolatot kezdeményező AI-workert futtat közvetlen Atlas-hozzáférés nélkül. A mostani lokális end-to-end próba nem használja a Vercelt vagy az Atlást; izolált, szintetikus MongoDB-t használ. Személyes tartalomhoz külső AI nem használható.

Részletek: [architektúra](docs/architecture.md), [perzisztencia](docs/persistence.md), [telepítés](docs/deployment.md), [ellenőrzési napló](docs/verification.md), [korábbi funkciók migrációja](docs/legacy-feature-migration.md) és [worker](worker/README.md).
