# Habi — környezet és kiadás

## Vercel

A Habi projekt neve `habi`, repositoryja `moldovancsaba/habi`. A live Habi projektet ez a branch nem változtatja meg. A mostani `codex/habi-ground-up` branch nem került feltöltésre vagy deployra. A repositoryban rögzített Vercel keretrendszer Next.js; először izolált Preview környezetben kell ellenőrizni, productionra csak külön tulajdonosi utasítással és zöld ellenőrzésekkel szabad előléptetni.

A környezetkulcsok kanonikus nevei: `development/environment.example`. A konfigurációminta nem bizonyíték a szolgáltatáskapcsolatra. Secretet ne másolj logba, dokumentumba vagy kliens bundle-be.

## Környezeti felderítés · 2026-10-25

- Vercel `habi`: a titkos `habi_mongodb_uri` változó Development, Preview és Production célra egyaránt be van állítva. Ezt nem tekintjük izolált teszt-adatbázisnak, nem húztuk le és nem olvastuk ki az értékét.
- Vercel `habigoal`: Preview célra titkos `MONGODB_URI`, `MONGODB_DB` és `MONGODB_APP_NAME` változók vannak. Az egyik Preview deployment védett válasza HTTP 302 átirányítás volt, ezért a health állapotot és az adatbázis elkülönítését nem sikerült igazolni. Az értékeket nem olvastuk.
- Nincs kijelölt, bizonyítottan izolált tesztstack. A felhasználó azonosítja a meglévő Preview/test környezetet. Addig nincs Vercel-link a repositoryban, env pull, Atlas kapcsolat, migráció, seed vagy deploy.

## Kiadási előfeltételek

1. Az izolált teszt Vercel-projektet, Atlas teszt-adatbázist és DoneIsBetter tesztkliens azonosítani kell; Preview titkok nem kerülhetnek productionból másolásra.
2. Az env-kulcsok teljességét név szerint, értékek nélkül kell ellenőrizni.
3. Futtatni kell az idempotens migrációt, indexellenőrzést és determinisztikus, csak szintetikus seedet.
4. Igazolni kell a böngésző → Vercel API → Atlas → Mac worker → válasz → újratöltés útvonalat, pozitív és jogosulatlan tesztesetekkel.
5. Visszaállításnál a legutóbbi jó Vercel deploymentre és Atlas mentésre kell visszaállni; migrációs rollbacket külön kell validálni.
6. Gyermek/personal adatokkal végzett pilot csak verziózott, jóváhagyott consent/retention policy, jogosultságok és felelős reviewer után indulhat.
