# Habi — környezet és kiadás

## Vercel

A Habi a termék és a leszállítandó Vercel-alkalmazás. A Habigoal a bemutató/prototípus és specifikációs forrás, nem a futó termék célneve. A Habi célrepoja `moldovancsaba/habi`; a `codex/habi-ground-up` ág szándékosan lecseréli a korábbi prototípus-forrásfát. A korábbi commitok auditálható Git-előzményként megmaradnak, a korábbi alkalmazás nem megőrzendő célállapot.

A lokális repository `narimato/habi` Vercel projekthez van kapcsolva; `codex/habi-ground-up` ág létezik originon, de a jelenlegi munkafában nem commitolt Habi implementáció van. A korábbi, működő app `main` commitját megőrző `backup/main-before-habi-migration-2026-10-25` remote ág létrejött (`538c76518484ec269e2ddd3418fbb945e7ff5a67`). A régi alkalmazás működő rollback-forrás marad; az új termékfunkciókat a célrendszerben migráljuk, nem a prototípus kódját visszaállítva. A jelenlegi diff nincs pusholva vagy deployolva, és nem változtatott hosztolt környezetet. A helyi synthetic acceptance és migráció előzi meg a Vercel/Atlas munkát. Kiadás csak a megfelelő ellenőrzési bizonyíték, izolált Preview-adatbázis és külön telepítési jóváhagyás után következhet.

A környezetkulcsok kanonikus nevei: `development/environment.example`. A konfigurációminta nem bizonyíték a szolgáltatáskapcsolatra. Secretet ne másolj logba, dokumentumba vagy kliens bundle-be.

## Környezeti felderítés · 2026-10-25

- Vercel `habi`: a titkos `habi_mongodb_uri` változó Development, Preview és Production célra egyaránt be van állítva. A név és célkörnyezetek láthatók; az értéket nem olvastuk. Nem bizonyított, hogy ez a régi adatbázis alkalmas az új sémához, ezért nem csatlakoztunk hozzá, nem migráltunk és nem seedeltünk.
- Vercel `habigoal`: Preview célra titkos `MONGODB_URI`, `MONGODB_DB` és `MONGODB_APP_NAME` változók vannak. Az egyik Preview deployment védett válasza HTTP 302 átirányítás volt, ezért a health állapotot és az adatbázis elkülönítését nem sikerült igazolni. Az értékeket nem olvastuk.
- A Habi Vercel projekt a célkörnyezet, de a dedikált Atlas adatbázis, új `HG_*` futásidejű változók és DoneIsBetter SSO kliens nincsenek igazolva. A Vercel projektkapcsolat lokális és `.vercel/` alatt marad; titkot nem húztunk le. Preview telepítés előtt a szükséges kulcsokat és Atlas elkülönítést kell létrehozni, hogy a Preview ne módosíthassa a régi vagy éles adatokat.
- A 2026-10-25-i ellenőrzés szerint a Habi Preview env-listában csak a régi titkos `habi_mongodb_uri` szerepel (Development, Preview, Production). Új `HG_*` konfiguráció nincs; a preview ezért nem futtathatja biztonságosan az új perzisztens Habi rendszert.
- Hiányos Preview-konfigurációnál a build csak a kikapcsolt nyilvános belépőoldalt szolgálja ki; a health probe 200, a readiness probe 503, az üzleti/worker/auth API-k pedig `DEPENDENCY_UNAVAILABLE` 503 választ adnak. Ez diagnosztikai preview-állapot, nem használható tesztkörnyezet. A Production továbbra is induláskor visszautasítja a hiányos konfigurációt.

## Kiadási előfeltételek

1. A Habi projekthez dedikált, új sémájú Atlas adatbázist és DoneIsBetter kliens-konfigurációt kell biztosítani; a régi `habi_mongodb_uri` nem helyettesíti ezeket.
2. Az env-kulcsok teljességét név szerint, értékek nélkül kell ellenőrizni.
3. Futtatni kell az idempotens migrációt, indexellenőrzést és determinisztikus, csak szintetikus seedet.
4. Igazolni kell a böngésző → Vercel API → Atlas → Mac worker → válasz → újratöltés útvonalat, pozitív és jogosulatlan tesztesetekkel.
5. Visszaállításnál a legutóbbi jó Vercel deploymentre és Atlas mentésre kell visszaállni; migrációs rollbacket külön kell validálni.
6. Gyermek/personal adatokkal végzett pilot csak verziózott, jóváhagyott consent/retention policy, jogosultságok és felelős reviewer után indulhat.

## Migrációs és tesztadat-határok

- A jelenlegi `db:migrate:test` és `db:seed:test` parancsok kizárólag localhoston futó, `_test` végű adatbázisra fogadnak konfigurációt; a guard Vercel/Atlas környezetet elutasít.
- A MongoDB integrációs teszt szintén csak explicit `HABI_TEST_MONGODB_URI` mellett fut; a fejlesztői példány külön `habi_<run>_test` adatbázist hoz létre és a teszt végén törli.
- Nincs production migrációparancs vagy automatikus migráció Vercel indításkor. Ezt későbbi munka előzi meg dedikált adatbázis, least-privilege migrációs credential, backup, rollback/forward javítási terv és jóváhagyott futtatási eljárás mellett.
- Az indexmigráció idempotens előrehaladást támogat; nem tartalmaz veszélyes automatikus visszabontást. Hibás migráció után meg kell őrizni a hiba bizonyítékát, nem vakon törölni a ledger rekordot; javító migráció vagy jóváhagyott backup restore szükséges.
