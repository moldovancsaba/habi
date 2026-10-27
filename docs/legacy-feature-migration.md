# HABI prototípus-funkciók átültetése

## Források

A 2026-10-27-i funkcióleltár két megőrzött működő forrást hasonlít össze a termékkel:

- Korábbi HABI: `backup/main-before-habi-migration-2026-10-25`, commit `538c76518484ec269e2ddd3418fbb945e7ff5a67`; különösen `app.js`, `experience.js`, `journeys.js`, `guided-chat.js`, `monthly.js`, `trends.js`, `support.js`, `follow-through.js`, `habi2.js`, `server/content-seed.json`.
- Habigoal prototípus: `/Users/Shared/Projects/prototype/habigoal/wireframes`, a vizsgált repository commitja `9358e9f1593b85f710a1f4c9c848880e0c1386b9`; különösen `workspace.js`, `assessments.js`, `assessment-data.js`, `progress-chart.js`, `ui.js`. A felméréskatalógus forrása és verziói az új tartalomfájlban is szerepelnek.

A termék neve Habi, a kliensprototípus neve Habigoal. Ez a leltár felülírja a dokumentum korábbi, részleges migrációs státuszait. A korábbi implementáció mentése érintetlen marad.

## Termékben elérhető képességek

| Prototípusbeli képesség | Termékbeli megvalósítás és megőrzött viselkedés |
| --- | --- |
| Napi állapotjelzés | Az elfogadott öt kérdés, válaszonkénti tartós mentés, kihagyás, félretétel, újratöltés utáni folytatás és részleges lezárás. A beküldött válasz és az eredeti lezárt eredmény változatlan marad. |
| Grafikák és trendek | Az öt terület saját grafikája és közös metróhálózata, 14/28/42 nap, válaszeloszlás, kattintható nap és eredeti válaszlista. Naponta a legutóbbi teljes alkalom, ennek hiányában a legutóbbi részleges alkalom; külön alkalmak válaszait nem keveri. A félbehagyott mentett válaszok is láthatók. A szülő és az edző is eléri az engedélyezett grafikákat. |
| Gyakorlatok és magyarázatok | Mind a 10 különböző korábbi gyakorlat a `practices-v2.json` verziózott csomagban; 12 magyarázó téma sportos, hétköznapi és semleges példával. Saját gyakorlási visszajelzés és opcionális, pontos sajátcél-kapcsolat. |
| Helyzetbeszélgetések és HABI2 | Kilenc helyzet, a meglévő hét témaválasztás és három szerzői HABI2 döntési fa, szerkeszthető kezdőszöveg, mentett folytatás, összefoglaló, letöltés és napló. A befejezésből saját cél, gyakorlat vagy beszélgetés-előkészítés indítható. |
| Fájdalom miatti segítségkérés | Külön, háromlépéses segítségkérő út a meglévő szerzői szöveggel. Nem készít diagnózist vagy edzéstervet; a gyermek dönt a mondat felhasználásáról. |
| Saját célok | Létrehozás, módosítás, csere és korábbi cél visszaállítása új eseménnyel, félretétel, folytatás, visszatekintés, szokásként folytatás, lezárás és 7/14/28 napos vagy kikapcsolt újranézés. A célhoz kapcsolt gyakorlási napló az exportba is bekerül; más gyakorlatot nem rendel hozzá találomra. |
| Rutinok | Saját időzítés, naphoz kötött kipróbálás, módosítás, félretétel és folytatás; a korábbi események megmaradnak. A szokásként folytatott cél is rutin lehet. |
| Eseményre készülés és visszatekintés | Az alkalom saját dátuma, előtte/utána nézőpont, történés, segítség és következő próbálkozás. Mentett saját napló és folytatható szerkesztés. |
| Visszatérés egy bejegyzéshez | Saját beszélgetés, gyakorlat vagy jegyzet kiválasztása, dátum és idő, alkalmazáson belüli jelzés, négy válaszlehetőség és saját megjegyzés. |
| Napi, heti és havi visszatekintés | Meglévő napi/heti folyamatok és a 16 eredeti havi kérdés, kihagyás, mentett privát piszkozat, lezárt napló. A havi lezárás külön, változatlan havi rekordot is készít. |
| Beszélgetés előkészítése | Eredeti személy- és segítségválasztások, három szerkeszthető mező, előnézet, javítás, saját napló és letöltés. |
| Félbehagyott munka | Játékoshoz és bejelentkezett személyhez kötött felhő-piszkozat a célhoz, rutinhoz, gyakorlási megjegyzéshez, előkészítéshez és támogatási hurokhoz. Revision-ellenőrzés, mentetlen állapotnál navigációs védelem, folytatási jelzés az áttekintésen. |
| Napló és metró-idővonal | Eredeti szöveg, dátum és idő, saját/proxy/megfigyelés forrásjelölés, eseménytípus-, szerepkör-, időszak- és napszűrő; további régi rekordok és check-inek betöltése. |
| Emberi beszélgetések | Szülő és edző önálló közös témát indíthat, hozzászólhat, konkrét hozzászólásra válaszolhat; az edző lezárhatja és újranyithatja. Régi témák és üzenetek lapozhatók. Nem igényel AI-kérést. |
| Natív edzői felmérések | Az eredeti 62 témakör, 136 kérdés és 24 helyzet; kérdésenkénti válasz és kihagyás, interjú/helyzet, nyers kognitív riportértékek. Eredeti kérdésszöveg, verzió, dátum, kontextus, játékosi szöveg és külön edzői megfigyelés. Nem képez új pontszámot vagy diagnózist. |
| PDF-felmérés és kézi adatbevitel | Meglévő PDF-karantén, helyi ClamAV-vizsgálat, eredeti oldalhoz és egységhez kötött kézi mezőrögzítés, emberi ellenőrzés és jóváhagyás. |
| Edzői rekordok és publikáció | Belső felmérések és megfigyelések listája; pontos verzió megosztása és visszavonása. A jogosult szülő az engedélyezett eredeti forrást olvashatja. |
| AI-magyarázat ellenőrzése | Pontos források megnyitása, állításonkénti ellenőrzés és indoklás, jóváhagyás/elutasítás/javításkérés. A szülőnek jóváhagyáskor is olvashatónak kell lennie a forrásnak. Megosztás visszavonásakor a függő magyarázatok és az azokra hivatkozó magyarázatok is visszavonttá válnak. |
| Edzői anyagok | Új, változatlan anyagverzió készítése, pontos publikáció, visszavonás és a szülőnek ténylegesen megosztott anyagok olvasása. |
| Közös tervek és utánkövetés | Pontos forrás, indok, felelős tényleges résztvevő, határidő és leállási feltétel. Elfogadás/elutasítás, aktív állapot, szüneteltetés, folytatás, lezárás/visszavonás és utánkövetés. |
| Tudástári minták | Általánosított helyzet, válaszirány, kizárás és szakmai forrás rögzítése; szakmai, személytelenségi és jogi ellenőrzés indoklással; jóváhagyás és visszavonás. A meglévő gyakorlatkereső megmarad. |
| Emlékeztetők | Meglévő saját reggeli/esti emlékeztető és cél-újranézés az alkalmazás megnyitásakor, a felhasználó által megadott időzítéssel. |

## Megőrzött termékdöntések

- Az elfogadott ötfaktoros állapotjelzés marad; a régi hétkérdéses pontozást és diagnosztikus trendnyelvezetet nem állítjuk vissza. A fájdalom külön segítségkérő út.
- A generatív AI nem helyettesíti a szerzői játékosi beszélgetéseket, és nem írja át az eredeti válaszokat. A tudástári jóváhagyás nem jelent automatikus modelltréninget.
- A saját játékosi cél és az edző által készített közös terv külön fogalom. A saját cél, rutin és támogatási esemény változatlan naplóbejegyzésekként tárolódik; a közös terv saját domainrekord.
- A demóadat-visszaállítás, prototípusbeli szerepkör-megszemélyesítés és régi böngészőadat-import nem termékfunkció. Minden új hozzáférés a Habi bejelentkezett szerepkörét és családi jogosultságait használja.
- Az alkalmazáson belüli jelzés nem push-, e-mail- vagy WhatsApp-küldés. Az előkészített szöveget a felhasználó saját döntése szerint tölti le és osztja meg.

## Ellenőrzés és telepítés

Az API-szerződés verziója `2.4.21`. A `017-player-continuity-drafts` migráció csak a meglévő privát piszkozatok engedélyezett kulcsait bővíti; a régi rekordokat nem írja át. Az új privát piszkozatútvonal hitelesített játékosi kérésnél idempotensen ellenőrzi a szükséges migrációt.

A 2026-10-27-i ellenőrzés: 190 automatizált teszt, kihagyás nélkül, helyi MongoDB replika mellett; típusellenőrzés, lint és production build. Szintetikus böngészőpróba három szerepkörrel: natív felmérés, publikáció, emberi beszélgetés, tudástári jóváhagyás, félbehagyott check-in visszaállítása, állításonkénti AI-review, szülőnek publikált anyag, sajátcél-piszkozat visszaállítása, célhoz kötött gyakorlat, rutin, esemény-visszatekintés, metró/disztribúció/napi részletezés és mobil szélesség.

A szintetikus ellenőrzés a technikai folyamatot bizonyítja. A valódi modellválasz szakmai minőségét és a hitelesített éles SSO-felhasználó teljes böngészőútját nem helyettesíti. Az éles kiadásnál a pontos git commithoz tartozó Vercel deploymentet és a kanonikus domain állapotát külön kell ellenőrizni.
