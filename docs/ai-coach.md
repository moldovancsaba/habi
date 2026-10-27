# Kontextusos Habi AI-edző

A 2026-10-27-i tulajdonosi kérés engedélyezi a játékos, szülő és edző közvetlen, kontextusos AI-coach használatát (D-HG-019). A korábbi játékosi halasztás e funkcióra nem vonatkozik.

## Felület és beszélgetés

Minden aktív szerepköri oldalon állandó `smart_toy` alakú AI-edző gomb jelenik meg. A szakaszok, mentett bejegyzések, grafikonok, kérdések, gyakorlatok és felmérések saját belépőt kapnak. A panel az oldal állapotának elvesztése nélkül nyílik meg; a visszalépés az eredeti oldalra visz. A cím megmutatja a kijelölt tartalmat. Az első üzenet a szerver által feloldott, engedélyezett tartalmat magyarázza; ezen felül tényleges AI-magyarázat készül az aszinkron worker útvonalán.

A thread tulajdonosa tenant + játékos + actor + aktív szerepkör. Szülő/edző nem olvashatja a játékos privát AI-threadjét. A családi emberi beszélgetések külön maradnak. A kérdés és munka az indítástól tartós, az ismétlés idempotens, egy thread egyszerre egy folyamatban lévő kérdést enged. A korábbi threadek és üzenetek lapozhatók. A következő kérdés a legutóbbi négy, még engedélyezett válasz kérdését és látható válaszát is megkapja; a korábbi AI-szöveg nem új bizonyíték.

## Játékosmemória

Az összes hozzáférhető történeti rekordból készül az adott szerepköri nézet profilja, nem pusztán az utolsó húsz rekordból. A nyers mezők helyett megnevezett, felhasználói tartalmak kerülnek a modellhez. A profil ismert rögzített információkat, közelmúltbeli beszámolókat, 7/28/90 napos leíró ismétlődéseket, hasznosnak jelölt próbálkozásokat és nyitott kérdéseket rendez. Az eltérő válaszok forráshivatkozásai megmaradnak; nincs diagnózis vagy állandó személyiségcímke.

A profil materializált nézet: olvasáskor a források és saját kiegészítések ujjlenyomatából frissül, változatlan bemenetnél a mentett verzió tér vissza. Új adat, pontosítás, visszavonás vagy napablak-változás új verziót eredményez. Ez kéréskori frissítés, nem háttérben futó modelltréning. A forrásadat és a pontosítás története változatlan marad. A felhasználó külön saját emléket adhat hozzá, és „már nem aktuális” vagy pontosítás eseményt rögzíthet. A saját AI-memória alapértelmezetten az adott actor/szerepkör nézetében marad. A saját beszélgetésben leírt preferenciák külön, megerősítésre váró megjegyzésként megjelenhetnek; az „Ezt megjegyezheted” kifejezett megerősítés. Korábbi AI-szöveg nem válik automatikusan megfigyeléssé.

A kérdéshez a teljes előzményhalmazból releváns korábbi források és közelmúltbeli információk kerülnek kiválasztásra. A profil fontos megállapításai külön, változatlan, kérdéshez kötött pillanatképet kapnak, az alapul szolgáló pontos verzióhivatkozásokkal. Ezek bármelyikének hozzáférés-/verzióváltozása érvényteleníti a régi választ. A szövegcsomag mérete korlátozott; a forrásazonosítók nem vesznek el a rövidítésben.

## Javaslat és visszajelzés

A javaslatok az eredeti szerzői gyakorlattárból, a játékos mentett saját beszámolóihoz és aktív saját céljaihoz kapcsolódnak. A kártya megmutatja a gyakorlatot, kapcsolódásának indokát, a pontos forrásokat, a bizonytalanságot és az újranézés dátumát. Választható: kipróbálom, módosítanám, most nem kérem, segített, nem segített, még nem próbáltam; szabad megjegyzés is rögzíthető. A visszajelzés tartós, a profilban megjelenik és a javaslatok rendezését befolyásolja. Az újranézés az alkalmazásban látható, nem külső értesítés.

A javaslat támogató, önkéntes kipróbálás, nem automatikusan elfogadott terv vagy edzésterhelési előírás. A modell személyes következtetése külön `inference`; játékos/szülő számára edzői ellenőrzésig elkülönül. A felhasználó külön megoszthatja az adott kérdést, választ és pontos forrásait ellenőrzésre; a teljes privát dialógus továbbra sem látható. Az edzői döntés indoklással és revision-ellenőrzéssel mentődik.

## Telepítés és működés

- API: `2.4.22`; új utak: `ai-coach`, `ai-profile`, `ai-reviews`, `ai-sources` a kiválasztott játékos alatt.
- Additív migráció: `018-contextual-ai-coach`; négy új, validált kollekció és az új `coachConversation` jobtípus. Hitelesített új útvonal első használatakor idempotensen lefut; történeti rekordot nem ír át.
- A meglévő Vercel/Atlas/worker sor használatos. Hosted módban a megosztott Hetzner `text_chat` szolgáltatás fut; a modell alapértelmezetten `auto`. A böngésző nem kap AI-kulcsot.
- Külön `coach-prompt.md`; a worker a kérésben szereplő prompt-hashhez ellenőrzi a helyi fájlt. A normál felülvizsgált interpretation-folyamat megmarad.
- A kiadás után a worker folyamatot újra kell indítani az új jobtípushoz. A produkciós és szintetikus tesztkonfiguráció elkülönül.
