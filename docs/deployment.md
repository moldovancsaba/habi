# Habi — környezet és kiadás

## Vercel

A Habi a termék és a leszállítandó Vercel-alkalmazás. A Habigoal a bemutató/prototípus és specifikációs forrás, nem a futó termék célneve. A Habi célrepoja `moldovancsaba/habi`; a `codex/habi-ground-up` ág szándékosan lecseréli a korábbi prototípus-forrásfát. A korábbi commitok auditálható Git-előzményként megmaradnak, a korábbi alkalmazás nem megőrzendő célállapot.

A repository lokálisan a `narimato/habi` Vercel projekthez van kapcsolva. A branch még nincs feltöltve vagy deployolva; a jelenlegi élő alkalmazás ezért átmenetileg a régi snapshotot szolgálja ki. Az új alkalmazás csak az új Habi forrásból készül. A kiadási út: build és automatizált ellenőrzések → Habi Preview ellenőrzése személyes adatok nélkül → a Habi Vercel projekt új forrásának kiadása → élő ellenőrzés és visszaállítható deployment rögzítése.

A környezetkulcsok kanonikus nevei: `development/environment.example`. A konfigurációminta nem bizonyíték a szolgáltatáskapcsolatra. Secretet ne másolj logba, dokumentumba vagy kliens bundle-be.

## Környezeti felderítés · 2026-10-25

- Vercel `habi`: a titkos `habi_mongodb_uri` változó Development, Preview és Production célra egyaránt be van állítva. A név és célkörnyezetek láthatók; az értéket nem olvastuk. Nem bizonyított, hogy ez a régi adatbázis alkalmas az új sémához, ezért nem csatlakoztunk hozzá, nem migráltunk és nem seedeltünk.
- Vercel `habigoal`: Preview célra titkos `MONGODB_URI`, `MONGODB_DB` és `MONGODB_APP_NAME` változók vannak. Az egyik Preview deployment védett válasza HTTP 302 átirányítás volt, ezért a health állapotot és az adatbázis elkülönítését nem sikerült igazolni. Az értékeket nem olvastuk.
- A Habi Vercel projekt a célkörnyezet, de a dedikált Atlas adatbázis, új `HG_*` futásidejű változók és DoneIsBetter SSO kliens nincsenek igazolva. A Vercel projektkapcsolat lokális és `.vercel/` alatt marad; titkot nem húztunk le. Preview telepítés előtt a szükséges kulcsokat és Atlas elkülönítést kell létrehozni, hogy a Preview ne módosíthassa a régi vagy éles adatokat.

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
