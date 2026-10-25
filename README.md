# Habi

A Habi a fiatal sportolókhoz és a körülöttük lévő jogosult felnőttekhez tartozó termék. A Habigoal a bemutató és prototípus neve. A Habi alkalmazás forrása ez a repository; a prototípus és a normatív termékszerződések a [Calvus Habi-projektjében](https://github.com/moldovancsaba/calvus/tree/main/habigoal) találhatók.

## Aktuális állapot

Ez az ág a régi Habi prototípus forrását eltávolítja az alkalmazás-pillanatképből, és az elfogadott Vercel + Atlas + DoneIsBetter SSO + helyi Mac AI-worker architektúrához készít tiszta Next.js alapot. A korábbi commitok a Git történetében megmaradnak. Az új alap jelenleg konfigurációvalidálást, biztonságos elérhetetlenségi oldalt, liveness végpontot és worker-konfigurációs próbákat tartalmaz. Bejelentkezés, üzleti API, Atlas repository, adatbázis-migráció, AI-poller és személyes pilot még nincs megvalósítva.

A terméket a Vercel futtatja. A Mac worker kizárólag kifelé hívja a Vercel API-t és a helyi Ollamát; közvetlen Atlas-kapcsolatot nem kap. A meglévő modellt és hostzárat kell használni. Külső személyes AI-tartalékút nincs.

## Helyi ellenőrzés

Node.js 20.19+, 22.13+ vagy 24+.

- `npm ci` — lockfile szerinti telepítés.
- `npm test` — konfigurációs és domain-referencia próbák.
- `npm run lint` — Biome statikus ellenőrzés.
- `npm run typecheck` — TypeScript ellenőrzés.
- `npm run build` — Vercel/Next.js production build.
- `uv sync --frozen` a `worker/` mappában — Python worker környezet zárolt telepítése.
- `uv run python -m unittest discover -s tests -v` a `worker/` mappában — worker-konfigurációs próbák.

Vercel-projektet és környezetet csak azonosítás után kapcsolj a checkout-hoz. Ne futtass Atlas-migrációt, seedet vagy szolgáltatói kapcsolatot, amíg az izolált tesztkörnyezet és valamennyi env-kulcs nem igazolt. Soha ne pullold a production secretet fejlesztéshez.

## Futtatási határok

- Vercel: Next.js webapp és ugyan-origin API.
- MongoDB Atlas: kanonikus adattár; riportfájlok a specifikáció szerinti GridFS-ben.
- Hitelesítés: DoneIsBetter SSO.
- Mac: kifelé kapcsolódó helyi AI-worker, meglévő Ollama `qwen2.5:7b` és hostzár.
- Worker nem kap Atlas URI-t vagy felhasználói SSO hitelesítőt.
- Személyes adatot és gyerekadatot csak külön jóváhagyott consent/policy és izolált tesztkörnyezet után lehet feldolgozni.

Lásd a `docs/` könyvtárat és a [meglévő #35 szállítási feladatot](https://github.com/moldovancsaba/calvus/issues/35) a részletes elfogadási feltételekért és átadási pontokért.
