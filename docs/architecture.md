# Habi — architektúra és biztonsági határok

## Futtatási felosztás

A Vercel szolgáltatja a Habi webalkalmazást és az azonos origin API-t. A MongoDB Atlas a kanonikus személyes, review- és tudásadat-tár; a riportfájlok GridFS-be kerülnek. A Habi a saját DoneIsBetter SSO-integrációján keresztül azonosítja a felhasználót.

A Mac kizárólag AI-workert futtat: a worker kifelé hívja a Vercel feladat API-ját, az elfogadott hostzárat és a már telepített Ollama `qwen2.5:7b` modellt használja. A worker nem csatlakozhat közvetlenül az Atlas-hoz, nem kaphat felhasználói SSO vagy web session titkot, és nem küldhet személyes tartalmat külső AI-szolgáltatónak.

## Kötelező adatvédelmi viselkedés

- Minden olvasás és írás szerveroldali tenant-, szerep-, tagság- és erőforrásverzió-ellenőrzésen megy át.
- A rejtett erőforrás egységesen nem található választ ad; más tenant adata vagy létezésére utaló metaadat nem szivároghat ki.
- A napi értelmezés és a források snapshotként, megváltoztathatatlan eredményhez kötve tárolandók.
- A nem publikált edzői anyag nem látható szülőnek vagy játékosnak.
- A személyes AI-eredmény emberi review nélkül nem látható a családnak.
- Külső AI alapból tiltott; csak külön jóváhagyott, általános csomag kerülhet ki.
- Helyi szintetikus próbán túl személyes adatfeldolgozás nem engedélyezett jóváhagyott consent/retention policy nélkül.

## Jelenlegi hiányok

A repository a Next.js indítási alapot, fail-closed konfigurációellenőrzést, liveness végpontot, szerződésfájlokat és worker-konfigurációs vázat tartalmazza. Nincs még SSO-flow, API-handler, Atlas adapter, GridFS, migráció/index/seed, worker polling/lease/inference vagy end-to-end felhasználói folyamat. Ezeket a projekt dokumentációja tételesen követi a Calvus #35 feladatban.
