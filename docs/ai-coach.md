# Kontextusos Habi AI-edző

A 2026-10-27-i tulajdonosi kérés engedélyezi a játékos, szülő és edző közvetlen, kontextusos AI-coach használatát (D-HG-019). A korábbi játékosi halasztás e funkcióra nem vonatkozik.

## Felület és beszélgetés

Minden aktív szerepköri oldalon állandó `smart_toy` alakú AI-edző gomb jelenik meg. A szakaszok, mentett bejegyzések, grafikonok, kérdések, gyakorlatok és felmérések saját belépőt kapnak. A panel az oldal állapotának elvesztése nélkül nyílik meg; a visszalépés az eredeti oldalra visz. A cím megmutatja a kijelölt tartalmat. Az első üzenet a szerver által feloldott, engedélyezett tartalmat magyarázza; a tényleges AI-válasz a felhasználó kérdésére készül az aszinkron worker útvonalán. A megnyitás önmagában nem indít háttérgenerálást.

A thread tulajdonosa tenant + játékos + actor + aktív szerepkör. A thread írása és folytatása csak a tulajdonosé. A játékoshoz hozzáférő edző – a 2026-10-29-i tulajdonosi utasítás szerint (D-HG-020) – minden résztvevő AI-threadjét, üzenetét, visszajelzését és eredményét olvasási nézetben megnyithatja; a szülő és a játékos más résztvevő threadjét nem látja. A családi emberi beszélgetések külön maradnak. A kérdés és munka az indítástól tartós, az ismétlés idempotens, új kérdés folyamatban lévő válasz mellett is beküldhető és tartósan sorba kerül. A korábbi automatikus bevezető helyett a felhasználó saját kérdése kap elsőbbséget; a megszakított bevezető előzménye megmarad. A korábbi threadek és üzenetek lapozhatók. A következő kérdés a legutóbbi négy, még engedélyezett válasz kérdését és látható válaszát is megkapja; a korábbi AI-szöveg nem új bizonyíték.

## Játékosmemória

Az összes hozzáférhető történeti rekordból készül az adott szerepköri nézet profilja, nem pusztán az utolsó húsz rekordból. A nyers mezők helyett megnevezett, felhasználói tartalmak kerülnek a modellhez. A profil ismert rögzített információkat, közelmúltbeli beszámolókat, 7/28/90 napos leíró ismétlődéseket, hasznosnak jelölt próbálkozásokat és nyitott kérdéseket rendez. Az eltérő válaszok forráshivatkozásai megmaradnak; nincs diagnózis vagy állandó személyiségcímke.

A profil materializált nézet: olvasáskor a források és saját kiegészítések ujjlenyomatából frissül, változatlan bemenetnél a mentett verzió tér vissza. Új adat, pontosítás, visszavonás vagy napablak-változás új verziót eredményez. Ez kéréskori frissítés, nem háttérben futó modelltréning. A forrásadat és a pontosítás története változatlan marad. A felhasználó külön saját emléket adhat hozzá, és „már nem aktuális” vagy pontosítás eseményt rögzíthet. A saját AI-memória alapértelmezetten az adott actor/szerepkör nézetében marad. A saját beszélgetésben leírt preferenciák külön, megerősítésre váró megjegyzésként megjelenhetnek; az „Ezt megjegyezheted” kifejezett megerősítés. Korábbi AI-szöveg nem válik automatikusan megfigyeléssé.

A kérdéshez a teljes előzményhalmazból releváns korábbi források és közelmúltbeli információk kerülnek kiválasztásra. A profil fontos megállapításai külön, változatlan, kérdéshez kötött pillanatképet kapnak, az alapul szolgáló pontos verzióhivatkozásokkal. Ezek bármelyikének hozzáférés-/verzióváltozása érvényteleníti a régi választ. A szövegcsomag mérete korlátozott; a forrásazonosítók nem vesznek el a rövidítésben.

## Javaslat és visszajelzés

A javaslatok az eredeti szerzői gyakorlattárból, a játékos mentett saját beszámolóihoz és aktív saját céljaihoz kapcsolódnak. A kártya megmutatja a gyakorlatot, kapcsolódásának indokát, a pontos forrásokat, a bizonytalanságot és az újranézés dátumát. Választható: kipróbálom, módosítanám, most nem kérem, segített, nem segített, még nem próbáltam; szabad megjegyzés is rögzíthető. A visszajelzés tartós, a profilban megjelenik és a javaslatok rendezését befolyásolja. Az újranézés az alkalmazásban látható, nem külső értesítés.

A javaslat támogató, önkéntes kipróbálás, nem automatikusan elfogadott terv vagy edzésterhelési előírás. A modell személyes következtetése külön `inference`; játékos/szülő számára edzői ellenőrzésig elkülönül. A felhasználó külön megoszthatja az adott kérdést, választ és pontos forrásait ellenőrzésre. A thread edzői olvasása nem jóváhagyás: a személyes következtetés elfogadása továbbra is külön, indokolt edzői döntés. Az edzői döntés indoklással és revision-ellenőrzéssel mentődik.

## Telepítés és működés

- API: `2.5.1`; új utak: `ai-coach`, `ai-profile`, `ai-reviews`, `ai-sources` a kiválasztott játékos alatt.
- Additív migráció: `018-contextual-ai-coach`; négy új, validált kollekció és az új `coachConversation` jobtípus. Hitelesített új útvonal első használatakor idempotensen lefut; történeti rekordot nem ír át.
- A meglévő Vercel/Atlas/worker sor használatos. Hosted módban a megosztott Hetzner `text_chat` szolgáltatás fut; a modell alapértelmezetten `auto`. A böngésző nem kap AI-kulcsot.
- Külön `coach-prompt.md`; a worker a kérésben szereplő prompt-hashhez ellenőrzi a helyi fájlt. A normál felülvizsgált interpretation-folyamat megmarad.
- A kiadás után a worker folyamatot újra kell indítani az új jobtípushoz. A produkciós és szintetikus tesztkonfiguráció elkülönül.

## Válaszok és előrehaladás (2026-10-28)

Minden kérdésnél a mentett jobállapotból látható az aktuális szakasz: mentve, forrásbetöltés, szolgáltatói várakozás, generálás, formátum újrapróbálása, hivatkozásellenőrzés, mentés, kész. Az eltelt idő és az automatikus újrapróbálás ideje tényleges időbélyegből származik; nincs kitalált százalék vagy befejezési idő. A korábbi, még válaszra váró saját kérdések száma elkülönül a külső szolgáltató várakozási sorától.

A modell kompakt forráskulcsokat (S1, S2…) ad vissza; ezeket kizárólag a kéréshez engedélyezett, pontos verzióhivatkozásokra oldja fel a worker. A teljes, kódblokkba tett JSON olvasható; a félbevágott vagy hibás szerkezet újragenerálást indít legfeljebb egyszer, nagyobb kimeneti kerettel. A hibás modellválasz és a felhasználói forrásszöveg nem kerül naplóba; csak szerkezeti hibajelzés és próbálkozásszám.

Ha a szolgáltatás továbbra sem ad használható választ, a Habi „Forrásalapú összefoglaló” jelöléssel az engedélyezett mentett adatok idézett, tényszerű összefoglalóját adja vissza. Ez nem modellkövetkeztetés. A személyes értelmezés továbbra is külön ellenőrzést igényel; annak várakozása közben is megjeleníthetők a tényszerű alapadatok. A transporthiba automatikus újrapróbálása négy worker-kísérletre korlátozott.

A közvetlen állítások megjelenített szövege a megjelölt forrás ellenőrzött, szó szerinti részlete. Általános oldalleírás nem szolgálhat személyes állítás egyetlen bizonyítékául. Egyetlen állapotjelzés-területre irányuló kérdésnél az adott terület válasza kerül a modellcsomagba, hogy például az energia- és alvásválasz ne keveredjen; több területet összevető kérdésnél az eredeti, külön mezők maradnak. A magyarázó fogalmi tartalom külön, verziózott Habi-forrás. A kimeneti keret a szolgáltatás modellekre hirdetett korlátját követi, nem lépi túl azt az újrapróbálás sem.

## Edzői átláthatóság és tevékenységnapló (2026-10-29)

A játékoshoz hozzáférő edző az Idővonalon és a korábbi AI-beszélgetések között minden résztvevő AI-kérdését, válaszát, visszajelzését, pontosítását és kizárását látja, az eredeti üzenetek módosítása nélkül. Más résztvevő threadjét csak olvasási nézetben nyithatja meg: nincs üzenetmező, a címkék a szerzőt nevezik meg („Játékos üzenete”), és a folytatás vagy a szál bármilyen írása elutasított (a tulajdonos hatóköre nem változik). A szülő és a más bérlő játékosa az ilyen szálat nem éri el, és az Idővonalán nem jelenik meg.

A sikeres, játékosra vonatkozó workflow-parancsok a meglévő tranzakcióban kanonikus `events` és aktorhoz kötött `audit` rekordot is írnak (`src/lib/database/coach-activity.mjs`). Az idempotens újrajátszás nem ad második tevékenységet, a sikertelen tranzakció nem hagy nyomot, a piszkozat tartalma és a nyers kérés nem kerül a naplóba. A napló az ezt a kiadást megelőző állapotokat nem rekonstruálja; a begépelt, el nem küldött szöveg nem tevékenység. Ezt a [D-HG-020 döntés](../contracts/decisions.json) rögzíti; a D-HG-019 azon részét váltja, amely szerint az AI-thread a tulajdonosnál marad, amíg kifejezetten meg nem osztják.

## Szabályalapú útválasztás a modell előtt (2026-10-31)

A hosted worker minden AI-edző kérdésnél először a `habi_worker/coach_router.py` szabályait futtatja, és csak azt küldi a magyar modellnek, amire nincs szabály. Sorrendben: ismételt kérdés kezelése (`habi-conversation@1`), az edzésre menésről szóló szerzői útmutató (`habi-guidance@1`), az utolsó mentett állapotjelzés dátumozott, egyszerű szavakkal megfogalmazott összefoglalója vagy egy terület hiányzó válaszának jelzése (`habi-plain-checkin@1`, `habi-rules-no-data@1`), végül a beszámoló, pontosítás, kérés és cél rövid, őszinte nyugtázása (`habi-rules-ack@1`; a szerver `messageUnderstanding` aktusait használja, és egyetlen, a szerver által újra ellenőrzött memóriajegyzetet javasol). A szabályalapú válasz nem hív modellt, és nem talál ki tényt.

Ha a modell válaszát kétszer elutasítja az ellenőrzés, a kérdés nem marad válasz nélkül: a worker rövid, tényt nem állító `habi-rules-fallback@1` választ ad, és az eredeti üzenet megmarad az előzményekben. A worker a használt szabályt tartalom nélkül naplózza (`habi.worker.coach.rules_answer`, `artifact`).

Egészségi, fájdalmi vagy biztonsági jelzésre utaló üzenetet (a [guided-chat-routing](../src/lib/content/guided-chat-routing-v1.json) `safetyKeywords` listája és a fájdalom, reménytelenség kifejezései) egyetlen szabály sem válaszol meg, és a tartalék válasz sem; ezeknél a korábbi működés marad. A biztonsági válasz és az edzői értesítés külön döntés (lásd az [elemzés](ai-coach-analysis-2026-10-30.md) 2. pontját). A szabályok szövege másolati ellenőrzésre vár.

A worker és az API szerződése: a `worker/tests/fixtures/coach-worker-context.json` rögzíti a `coachWorkerContext` kulcsait; a `tests/ai-coach.test.mjs` hibázik, ha az API kulcsai eltérnek, a `worker/tests/test_coach_router.py` pedig ugyanezzel az alakkal (`dialogueVersion: 2`, a játékos üzenete az első forrás) futtatja az útválasztót, így a szabályok megkerülése tesztet bukik.
