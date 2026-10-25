# Habi — ellenőrzési napló

## T-HG-107 · Atlas kapcsolati alap és readiness · 2026-10-25

| Parancs | Eredmény | Bizonyíték és korlát |
| --- | --- | --- |
| `npm test` | PASS, exit 0; 8 Node tesztcsoport | Atlas-konfiguráció fail-closed, szintetikus mód tiltása, readiness 200/503 és hiba-redakció; 27 domain referencia-szcenárió. Nincs élő Atlas-hívás. |
| `npm run lint` | PASS, exit 0 | Biome 13 forrás-/tesztfájlon; figyelmeztetés nélkül. |
| `npm run typecheck` | PASS, exit 0 | TypeScript ellenőrzés. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3; `/api/health` és `/api/ready` dinamikus kérésidejű route. |

Kód: `mongodb@7.7.0`, `server-only@0.0.1`; szerverpéldányon újrahasznált, maximum öt kapcsolatos MongoClient pool, rövid connection/server-selection/queue timeoutokkal. `/api/health` liveness és `/api/ready` Atlas ping-alapú readiness különválasztva. A readiness nem ad vissza belső driverhibát vagy secretet. Az aktív Next.js 16 Cache Components konfigurációban a GET handler request-time adatbázis-hozzáférése automatikusan dinamikussá teszi az útvonalat; az alkalmazás `dynamic='force-dynamic'` szegmensflaget nem használ.

Az új `HG_*` Atlas-konfiguráció nincs beállítva, ezért Atlas-kapcsolat, migráció, index, seed, domain repository, SSO, deploy vagy személyes adatművelet nem történt. A pool korlát induló érték; Vercel párhuzamos példányszám és Atlas connection budget alapján még mérendő. A legacy `habi_mongodb_uri` értékét nem olvastuk.

## T-HG-105 · `codex/habi-ground-up` · 2026-10-25

### Lokális forrás- és buildellenőrzés

| Parancs | Eredmény | Bizonyíték és korlát |
| --- | --- | --- |
| `npm ci` | PASS, exit 0 | 31 npm csomag auditálva; 0 sebezhetőségi találat; a lockfile tiszta telepítést ad. |
| `npm test` | PASS, exit 0; 5 teszteset | 4 konfigurációs teszt és 27 domain-referencia forgatókönyv; egyik sem élő API/Atlas/SSO bizonyíték. |
| `npm run lint` | PASS, exit 0 | Biome 8 Habi runtime/test fájlon, hiba vagy figyelmeztetés nélkül. |
| `npm run typecheck` | PASS, exit 0 | TypeScript statikus ellenőrzése. |
| `npm run build` | PASS, exit 0 | Next.js 16.4.3 / Turbopack. `/` és `/_not-found` statikus; `/api/health` futásidőben kiszolgált dinamikus route. |
| `uv sync --frozen` + `uv run python -m unittest discover -s tests -v` (`worker/`) | PASS, exit 0; 6/6 | Worker konfigurációt és credential-határokat ellenőrzi; poller, Ollama inference és valódi hostzár nem része a csomagnak. |

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
