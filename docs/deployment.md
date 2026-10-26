# Habi — környezet és kiadás

## Aktuális Production állapot · 2026-10-26

Az új Habi kezdőlap a `main` ágra került (`b417686`); a legutóbbi Production deployment `dpl_6yhyapMfEZGNc8XMYXRGK6DUpyXJ` (`Ready`), alias: `https://habi.doneisbetter.com`. Az MVP a meglévő `habi` Atlas adatbázist és cookie-hash alapú browser-owner kompatibilitást használja, adatmodell-migráció nélkül. A kezdőlap valós adatot vagy üres állapotot mutat; az ellenőrző Chrome-profilban nem volt felismerhető korábbi rekord. A Preview branch deploy ellenőrzéskor `QUEUED` maradt, ezért Production adatírási próba nem történt; részletek a [verification naplóban](verification.md). Az SSO-s szerepkörös funkciók továbbra sincsenek aktiválva.

## Vercel

A Habi a termék és a leszállítandó Vercel-alkalmazás. A Habigoal a bemutató/prototípus és specifikációs forrás, nem a futó termék célneve. A Habi célrepoja `moldovancsaba/habi`; a `codex/habi-ground-up` ág szándékosan lecseréli a korábbi prototípus-forrásfát. A korábbi commitok auditálható Git-előzményként megmaradnak, a korábbi alkalmazás nem megőrzendő célállapot.

A lokális repository `narimato/habi` Vercel projekthez van kapcsolva; a `codex/habi-ground-up` branch jelenlegi Habi checkpointjai: `e2801a8` (tartós szerepköri folyamat és gyakorlatkönyvtár) és `36b824b` (hiányos Preview biztonságos fail-closed viselkedése). A korábbi, működő app `main` commitját megőrző `backup/main-before-habi-migration-2026-10-25` remote ág változatlanul elérhető (`538c76518484ec269e2ddd3418fbb945e7ff5a67`). A régi alkalmazás működő rollback-forrás marad; az új termékfunkciókat a célrendszerben migráljuk, nem a prototípus kódját visszaállítva. A branch Preview elkészült a `https://habi-33r6662se-narimato.vercel.app` címen, de csak kikapcsolt belépőoldalt szolgál ki: a dedikált Atlas és SSO runtime nincs beállítva. A `habi.doneisbetter.com` production alias továbbra is a régi, `main` deploymentre mutat. Hosztolt production környezetet nem módosítottunk. Kiadás csak a megfelelő ellenőrzési bizonyíték, izolált Preview-adatbázis és külön telepítési jóváhagyás után következhet.

A környezetkulcsok kanonikus nevei: `development/environment.example`. A konfigurációminta nem bizonyíték a szolgáltatáskapcsolatra. Secretet ne másolj logba, dokumentumba vagy kliens bundle-be.

## Környezeti felderítés · 2026-10-25

- Vercel `habi`: a titkos `habi_mongodb_uri` változó Development, Preview és Production célra egyaránt be van állítva. A név és célkörnyezetek láthatók; az értéket nem olvastuk. Nem bizonyított, hogy ez a régi adatbázis alkalmas az új sémához, ezért nem csatlakoztunk hozzá, nem migráltunk és nem seedeltünk.
- Vercel `habigoal`: Preview célra titkos `MONGODB_URI`, `MONGODB_DB` és `MONGODB_APP_NAME` változók vannak. Az egyik Preview deployment védett válasza HTTP 302 átirányítás volt, ezért a health állapotot és az adatbázis elkülönítését nem sikerült igazolni. Az értékeket nem olvastuk.
- A Habi Vercel projekt a célkörnyezet, de a dedikált Atlas adatbázis, új `HG_*` futásidejű változók és DoneIsBetter SSO kliens nincsenek igazolva. A Vercel projektkapcsolat lokális és `.vercel/` alatt marad; titkot nem húztunk le. Preview telepítés előtt a szükséges kulcsokat és Atlas elkülönítést kell létrehozni, hogy a Preview ne módosíthassa a régi vagy éles adatokat.
- A 2026-10-25-i ellenőrzés szerint a Habi Preview env-listában csak a régi titkos `habi_mongodb_uri` szerepel (Development, Preview, Production). Új `HG_*` konfiguráció nincs; a preview ezért nem futtathatja biztonságosan az új perzisztens Habi rendszert.
- A friss branch Preview-t ellenőriztük: `/` 200 (kikapcsolt belépőoldal), `/api/health` 200, `/api/ready` 503, `/api/v1/me` 503 `DEPENDENCY_UNAVAILABLE` kóddal. Ez diagnosztikai preview-állapot, nem használható role-workflow tesztkörnyezet. A Production továbbra is induláskor visszautasítja a hiányos konfigurációt.

## MongoDB-kapcsolat · 2026-10-26

- A tulajdonos megerősítette, hogy a Vercel `habi_mongodb_uri` az Habi által használható MongoDB-kapcsolat. A Vercel Development környezetből biztonságosan, ideiglenes, `0600` jogosultságú fájlba került; URI-érték nem került logba vagy dokumentumba.
- A kapcsolattal sikeres MongoDB `ping` és adatbázis-listázási próba futott. Az új alkalmazásnak elkülönített `habi_preview` és `habi_production` adatbázisnevet választottunk; mindkettő üres volt az ellenőrzéskor. Nem futott migráció vagy seed, és legacy collection nem módosult.
- A Vercel `narimato/habi` projekthez `HG_ATLAS_URI` és `HG_ATLAS_DATABASE` került hozzáadva: Preview célra kizárólag a `codex/habi-ground-up` branch kapta a `habi_preview` adatbázist; Production célra a meglévő, élő Habi-adatokat tartalmazó `habi` adatbázis van beállítva. A meglévő `habi_mongodb_uri` változó érintetlen maradt.
- A `707cbca` commit Preview deploymentje Ready állapotú a `https://habi-git-codex-habi-ground-up-narimato.vercel.app` címen. A Habi alkalmazás `/api/ready` végpontja 200 választ adott; ez igazolja a Vercel runtime → MongoDB `habi_preview` kapcsolatot. Nem futott migráció vagy seed, és alkalmazásadatot nem írtunk.
- A termék API-k továbbra is fail-closed állapotban vannak, mert `HG_ENVIRONMENT` és a DoneIsBetter SSO kliens-konfiguráció hiányzik; `/api/v1/me` 503 `DEPENDENCY_UNAVAILABLE`. A Production env-var készlet új deploymentre vár; az aktuális Production még a régi alkalmazás.
- A `habi.doneisbetter.com` jelenleg még a korábbi Production deploymentet szolgálja ki. Az új alkalmazás MVP-módja ugyanazt a `habi_states` és `habi_content` sémát használja a meglévő `__Host-habi-session` cookie-hash tulajdonoskulccsal; adatimport vagy sémamigráció nincs. Az új role workflow tábláit/migrációit nem futtatjuk Productionön. A Habi új domain release-e előtt a Previewben ugyanilyen end-to-end cookie → API → Atlas → reload próbának kell sikerülnie.

### MVP adatcél · 2026-10-26

- Az új Habi MVP Production konfigurációja a tulajdonos kérésére a jelenlegi Habi által is használt `habi` Atlas adatbázisra mutat. A Preview marad a külön `habi_preview` célon.
- Read-only Atlas-felderítés: `habi.habi_states` 37 dokumentumot, `habi.habi_content` 1 dokumentumot tartalmazott; csak gyűjteménynevet, darabszámot, mezőneveket és adattípusokat ellenőriztünk. A mezőértékeket nem olvastuk ki és semmit nem módosítottunk.
- Az MVP a korábbi `habi_states` dokumentumokat közvetlenül, a meglévő böngésző-cookie tulajdonosával olvassa és írja; az új role-alapú sémába nem alakítja őket át. Másik böngésző vagy elveszett cookie nem kapcsolható automatikusan régi rekordhoz.
- A DoneIsBetter SSO nincs beállítva, ezért az új role workflow API-k MVP módban tiltottak. Csak a legacy MVP `/api/app`, `/api/health` és `/api/ready` útvonal engedélyezett. A Preview és Production környezethez `HG_MVP_MODE=legacy-browser`, `HG_APP_ORIGIN`, `HG_EXTERNAL_ENABLED=false`, `HG_SYNTHETIC_DATA_ONLY=false`, valamint a megfelelő Atlas-változók vannak konfigurálva; ezek új deployban lépnek életbe.
- Az új kliens nem generál automatikus sample history-t. A tartalomkatalógus a régi kompatibilis szabály szerint csak hiányzó kulcsokat egészíthet ki; létező szerkesztett értékeket nem ír felül.

## Kiadási előfeltételek

1. Preview a `habi_preview` adatbázist használja; az MVP Production célja a meglévő `habi` adatbázis, ugyanazzal a tulajdonos által megadott Atlas URI-val. Külön adatbázis-felhasználók és least-privilege jogosultságok későbbi biztonsági keményítési tételként maradnak; az MVP-kapcsolat már be van állítva.
2. MVP váltás előtt ellenőrizni kell az új Preview deployt, cookie-owned adat round-tripet, cross-origin write-denialt, stale revision kezelést és sample history hiányát.
3. A régi Habi MVP nem futtatja az új role-modell migrációit vagy seedjét a Production adatbázison.
4. A DoneIsBetter SSO és az identitáshoz rendelt player/parent/coach szerepek az MVP után következő release előfeltételei; addig minden új role API fail-closed.
5. Visszaállításnál a legutóbbi jó Vercel deploymentre/domainre kell visszaállni. A Habi MVP adatírásai továbbra is a régi, revisionnel védett `habi_states` formátumba kerülnek.
6. Gyermek/personal adatokkal végzett több-szereplős pilot csak verziózott, jóváhagyott consent/retention policy, identitás/jogosultságok és felelős reviewer után indulhat.

## Migrációs és tesztadat-határok

- A jelenlegi `db:migrate:test` és `db:seed:test` parancsok kizárólag localhoston futó, `_test` végű adatbázisra fogadnak konfigurációt; a guard Vercel/Atlas környezetet elutasít.
- A MongoDB integrációs teszt szintén csak explicit `HABI_TEST_MONGODB_URI` mellett fut; a fejlesztői példány külön `habi_<run>_test` adatbázist hoz létre és a teszt végén törli.
- Nincs production migrációparancs vagy automatikus migráció Vercel indításkor. Ezt későbbi munka előzi meg dedikált adatbázis, least-privilege migrációs credential, backup, rollback/forward javítási terv és jóváhagyott futtatási eljárás mellett.
- Az indexmigráció idempotens előrehaladást támogat; nem tartalmaz veszélyes automatikus visszabontást. Hibás migráció után meg kell őrizni a hiba bizonyítékát, nem vakon törölni a ledger rekordot; javító migráció vagy jóváhagyott backup restore szükséges.
