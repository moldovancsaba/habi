# HABI korábbi funkcióinak migrációja

## Forrás és megőrzés

A korábbi, működő HABI-implementáció megőrzött alapja: `backup/main-before-habi-migration-2026-10-25`, commit `538c76518484ec269e2ddd3418fbb945e7ff5a67`. Ez a mentés a migrációs hivatkozás, nem a célrendszer. A korábbi felhasználói utak forrása a `docs/HABI-user-journeys.md` és `docs/HABI2-research-and-journey.md`; a megvalósítás forrásai többek között az `app.js`, `experience.js`, `journeys.js`, `guided-chat.js`, `monthly.js`, `trends.js`, `support.js`, `follow-through.js`, `habi2.js` és `server/content-seed.json` fájlok.

A Habi termékben a kliensprototípus neve Habigoal. A kód és a szolgáltatás termékneve Habi.

## Funkcióleltár és migrációs állapot

| Korábbi képesség | Korábbi forrás | Új Habi állapot | Migrációs elv / elfogadási feltétel |
|---|---|---|---|
| Napi játékosi állapotjelzés és lezárt visszajelzés | `app.js`, `server/content-seed.json` | Új, tartós check-in és változatlan eredmény működik; helyi szintetikus acceptance lefedi. | Az új, elfogadott ötfaktoros szerződés az irányadó. A régi hét kérdéses változat, különösen fájdalom miatti biztonsági út, nem tekinthető azonosnak; a tartalmi eltérést a migráció előtt fel kell oldani és dokumentálni. |
| Állapotok, trendgrafikonok és időszakválasztás | `app.js`, `trends.js` | Még nincs új chart vagy régi trendértelmezés. Az idővonal nem grafikonpótlék. | 14/28/42 nap, hiányzó napok kihagyása, eredeti napi snapshot és az öt metrika kanonikus sorrendje; sem pontszám, sem fejlődés nem következtethető hiányzó válaszból. |
| Gyakorlatok és magyarázó könyvtár | `support.js`, `journeys.js`, `server/content-seed.json` | Az öt nem klinikai alapgyakorlat `practices-v1` verziózott csomagként átkerült; a játékos diary rekordban mentheti visszajelzését. A többi tematikus gyakorlat és régi navigációs út még nincs átültetve. | Az eredeti tartalomazonosító és verzió megmarad; saját visszajelzés az engedélyezett diary API-n tárolódik. A fájdalommal kapcsolatos anyag nem kerül ebbe a csomagba. |
| Helyzetalapú támogatás és fájdalomút | `support.js`, `journeys.js`, `server/content-seed.json` | Még nincs átültetve. | A sürgős/biztonsági út megelőzi a céljavaslatot és az AI-t. A fájdalom nem olvasztható össze diagnózissal vagy általános trenddel. A gyermek a saját szavaival és kihagyással irányít. |
| HABI vezetett beszélgetések, napi kontextus | `guided-chat.js`, `journeys.js` | Az új, forráskiválasztásos szülői kérdés és helyi worker működik; az eredeti játékosi útvonalak még hiányoznak. | A korábbi, szerzői döntési fák maradjanak determinisztikus, verziózott tartalomként. A generatív AI nem helyettesítheti őket és nem írhatja át a történeti üzeneteket. |
| Havi visszatekintés | `monthly.js`, `server/content-seed.json` | Még nincs új adatmodell/API/UI. | Definícióverzió, piszkozat/folytatás, változatlan elkészült válaszok, eredeti havi magyarázat és forrásolt következő lépés; nincs automatikus kitöltés. |
| Napló, naphoz kötött megfigyelések és beszélgetések | `app.js`, `experience.js` | Új közös, jogosultságvezérelt idővonal működik, de a régi napi részletnézet és napló nem teljes. | A timeline maradjon gépi eseménysor; a játékosnézet napra bontott történeti lapot adjon, eredeti szöveggel és forrásjelöléssel. |
| Célok, rutinok, gyakorlási előzmény és utánkövetés | `journeys.js`, `follow-through.js` | A tartós edzői terv, elfogadás és utánkövetés API/UI megvan; a korábbi önálló játékosi cél- és gyakorlásfolyamat még nincs átültetve. | A régi játékosi cél és az új edzői terv külön fogalom marad. Megőrzendő a forrás, visszatérés, csere/pauza/befejezés és eseménytörténet. |
| Megbízható felnőttel való beszélgetés előkészítése | `support.js`, `journeys.js`, `habi2.js` | Még nincs átültetve. | Helyben szerkeszthető előkészítés; semmi nem küldhető automatikusan. A játékos dönthesse el, mit oszt meg. |
| Emlékeztetők és felhasználói beállítások | `app.js`, `experience.js` | Még nincs új implementáció. | Alapértelmezés kikapcsolva; lokális időzóna és visszautasítás tartós; értesítésből nem szivároghat személyes állapot. |
| HABI2 beszélgetésközpontú felület | `habi2.js`, `habi2.html`, `docs/HABI2-research-and-journey.md` | Még nincs új UI. | A HABI2 kutatási és interakciós szabályai megőrzendők: egy aktív kérdés, folytatható piszkozat, könnyű kilépés, nincs függőséget célzó UX; ugyanazokat a kanonikus rekordokat használja. |
| Régi helyi adatok | `storage-migration.js`, `cloud.js`, `server/` | Importálási vagy visszaállítási út még nincs. | Csak külön, visszaállítható importtervvel: forrás, tulajdonos, jogosultság, dátum, verzió és tartalmi eredet megőrzése; mintavételes egyeztetés nélkül semmi nem jelölhető migráltnak. |

## Már igazolt új rendszerfunkciók

- Játékosi check-in, tartós válaszok és változatlan napi snapshot.
- Két szülő és két edző szerepkör-szintű hozzáférése; szülői/edzői megfigyelés forrásmegjelöléssel.
- Pontos revisionre mutató edzői publikáció.
- Szülői forrásválasztás, tartós kérdés/thread/job, helyi Mac worker, helyi Ollama, lease/heartbeat és forrásmanifest-ellenőrzés.
- Ha a modell nem ad forrásolható claimet, a rendszer `no_evidence` állapotot ad; ezt nem mutatja jóváhagyott válaszként.
- Újratölthető szülői beszélgetéstörténet, szerepkör szerinti idővonal, edzői verziózott anyag és publikáció, terv/elfogadás/utánkövetés, PDF karantén/ClamAV-vizsgálat és kézi extraction-mező review.
- Öt örökölt nem klinikai játékosi gyakorlat verziózott katalógusa és tartós diary-visszajelzése.

Az acceptance kizárólag localhoston, szintetikus családi rekordokkal és szintetikus PDF-fel futott. Ez a technikai folyamatot bizonyítja, nem valódi sportjelentések értelmezését, klinikai vagy edzői minőséget, hosted telepítést, SSO-t vagy személyes pilotot.

## Migrációs sorrend

1. **Első tartós szerepköri folyamat:** check-in, megfigyelések, edzői anyag és publikáció, forrásolt kérdés/worker, report-review, terv/elfogadás/utánkövetés, újratölthető előzmények. Előfeltétel a route-onkénti pozitív/negatív acceptance és worker-eset.
2. **Játékosi tartalomcsomag:** a fennmaradó gyakorlatok, helyzetalapú támogatás és vezetett beszélgetések normalizálása verziózott tartalomszerződésbe. Külön felülvizsgálat szükséges a fájdalom/biztonsági úthoz.
3. **Saját célok és napló:** a régi cél-, gyakorlat-, napló- és folytatási állapotok bekötése; az új edzői tervektől elkülönítve.
4. **Havi visszatekintés és trendek:** saját szerződések, eredeti snapshotok, hiányzó adatok szigorú kezelése, grafikon hozzáférhetősége.
5. **HABI2 és megosztás-előkészítés:** a HABI2 útvonalak és felnőttel való beszélgetés-előkészítés átültetése; csak ezek után kutatás az emlékeztetőkről.
6. **Adatimport:** csak az előző funkciók új modelljeinek elfogadása és import/rollback-próba után.
7. **Külső engedélyezés:** SSO, dedikált Habi-adatbázis, hosted secret-konfiguráció, tesztkörnyezet és deploy-verifikáció; a meglévő `habi.doneisbetter.com` csak sikeres release-gate után váltson.

## Release-gate

A régi főág mentése érintetlenül marad. A migráció csak akkor kész, ha a feature-mátrix minden `Még nincs átültetve` eleméhez van elfogadott döntés és bizonyított célmegvalósítás, vagy az elem kifejezetten kivezetett státuszt kapott; a core API/UI/worker teljes folyama szintetikus adatokkal végigfut; regressziós és hozzáférhetőségi ellenőrzés zöld; majd a Habi saját, a régi adattól izolált hosted környezete és rollbackje is igazolt. Addig a régi domain maradjon a régi működő rendszeren.
