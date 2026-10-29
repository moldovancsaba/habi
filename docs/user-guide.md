# Habi — felhasználói útmutató

A termék címe: [habigoal.com](https://habigoal.com). A felület magyar nyelvű. A gyökéroldal a játékos/szülő/edző munkaterület; az admin belépési pont közvetlenül [habigoal.com/admin](https://habigoal.com/admin).

## Havi visszatekintés

A játékosi áttekintésen a havi visszatekintést egyenként töltheted ki. Minden kérdésnél választhatsz az öt rögzített válasz közül, jelezheted, hogy nem volt ilyen helyzet, vagy kihagyhatod a kérdést. A válaszokat lezárás előtt áttekintheted, és megadhatsz egy következő havi fókuszt, illetve saját megjegyzést.

A válaszok menet közben felhős piszkozatként mentődnek, így az oldal újratöltése után folytathatod. A lezárás egyetlen mentési műveletben rögzíti a havi válaszokat, hozzáadja a teljes visszatekintést az előzményekhez, majd eltávolítja a piszkozatot. Ha a mentés eredménye nem egyértelmű, ugyanazt a beküldést biztonságosan meg lehet ismételni.

A visszatekintés a timeline-on a mentés időpontjával jelenik meg. A rendszer nem ad pontszámot, diagnózist vagy automatikus következtetést a válaszokból. A havi lezáráshoz az aktív Production adatbázisban a `015-monthly-reflections` migrációnak alkalmazva kell lennie.

## Adminisztrátorok

A Habi adminisztráció külön jogosultság, nem negyedik termékszerep. A `/admin` felületet csak a DoneIsBetter Habi alkalmazás aktuális `admin` permissionje nyithatja meg. A megvalósított meghívási folyamatban az admin szerepkört választ, a meghívott pedig a saját DoneIsBetter SSO-belépése után claimeli a lejáró, egyszer használatos linket. A szerepkör a pontos, ellenőrzött SSO issuer+subject identityhez kötődik; e-mail-cím alapján nincs automatikus párosítás.

Az admin UI és a claim API a Habi Production alkalmazás része. A belépéskor a DoneIsBetter Habi alkalmazás aktuális `admin` jogosultságát ellenőrizzük; a termék nem email-cím alapján ad adminjogot. Ha a tenant még nincs előkészítve, az admin felület egyszeri gombbal alkalmazza a migrációkat és létrehozza a `habi` tenantot az MVP konfigurációval.

A működő MVP konfiguráció a jelenlegi tervezetek azonosítóira hivatkozik: [adatmegőrzés és törlés](policies/2026-10-26-retention-policy-draft.md), [adatkezelői/adatfeldolgozói szerepek](policies/2026-10-26-controller-policy-draft.md). Ez funkcionális MVP-beállítás, nem állítás jogi megfelelőségről.

## Adatok és hozzáférés

A régi naplórekordok átvitele nem előfeltétel, és nem része az új szerepköri belépésnek. A player, parent és coach szerepköröket csak admin által kiadott meghívó adja; az SSO app `admin` permissionje önmagában nem ad termékoldali szerepkört.

Ha adminisztrátorként több aktív Habi-szerepköröd van, a kezdőlapon mindegyikhez külön **Belépés ebben a szerepben** gombot látsz. Válaszd ki a használni kívánt szerepet; a Habi ellenőrzi a meglévő tagságot, létrehozza a hozzá tartozó munkamenetet, és megnyitja a munkaterületet. A szerepkörön belül a felső sávban válthatsz a fiókodhoz tartozó többi szerepkör és játékos között. A váltás csak már kiosztott aktív tagságra engedélyezett, új hozzáférést nem ad. A kezdőlapon a szerepkörök érthető neve jelenik meg, belső azonosítók nem.

Adminisztrátorként a **Szerepkör kérése a saját fiókomhoz** gombbal indíthatsz saját játékos-, szülői vagy edzőmeghívót. Az elkészült meghívót ugyanazzal a DoneIsBetter-fiókkal kell elfogadni. Szülőként válaszd ki a kapcsolódó játékost; játékos-hozzáférésnél a megadott név új játékosprofilt hoz létre. Edzői hozzáférés a tenant játékosaihoz szól.

Ha be vagy jelentkezve, de még nincs Habi-szerepköröd, a kezdőlapon a **Szerepkör kérése** űrlapon kérhetsz játékos-, szülői vagy edzői hozzáférést. A kérelem a pontos, ellenőrzött SSO-identitáshoz kapcsolódik; az SSO-ból érkező hitelesített név automatikusan megjelenik. Az admin a `/admin` oldalon ellenőrzi a kérelmet, és személyre kötött meghívót adhat ki. A hozzáférés csak akkor indul el, ha ugyanazzal az SSO-fiókkal elfogadod a meghívót. Szülői kérelemnél az admin rendeli a kérelmet a megfelelő játékoshoz.

## MVP-folyamat

1. A Habi admin a `/admin` oldalon megnyitja a tenant előkészítését.
2. Az admin létrehoz egy játékos-, szülő- vagy edzőmeghívót.
3. A meghívott megnyitja az egyszer használatos linket, saját DoneIsBetter-fiókjával belép, majd elfogadja a hozzáférést.
4. A játékos egy indítóképernyőről egyesével halad végig az elfogadott öt állapotjelző kérdésen; bármelyiket átugorhatja, visszaléphet, majd az érvényes válaszok mentődnek. Szülőnél megfigyelés, előzmények és forrásolt helyi AI-kérdés jelenik meg. Kérdéshez előbb elérhető napi állapotjelzés kell; enélkül a küldés kikapcsolt, és a magyarázat közvetlenül az űrlapnál látható. Küldés után ugyanott követhető a várakozás, feldolgozás és edzői ellenőrzés, majd a jóváhagyott válasz is. Edzőnél megfigyelés és játékosadat-hozzáférés jelenik meg.
5. A szerepkör visszavonható az admin felületen; a visszavonás megszünteti a hozzáférést.

## A Habigoal-prototípus munkaterületei a Habi-ban

A Habigoal wireframe jóváhagyott képernyőszerkezetét a Habi szerepkörönkénti navigációja valósítja meg. A prototípusban szereplő Dani és az eseményei bemutatóadatok; a Habi nem másolja ezeket az éles munkaterületre. A kezdőoldal a bejelentkezett tagság és az API-ból ténylegesen elérhető adatok szerint mutat profilt, állapotjelzést, szereplőket és metróvonalas eseménytörténetet.

- **Játékos:** Áttekintés, Napló, Állapotjelzés, Idővonal, Feladatok és visszajelzések. A napi jelzés öt kérdése egyenként jelenik meg; a Naplóban saját bejegyzés rögzíthető.
- **Szülő:** Áttekintés, Napló, Beszélgetések, Idővonal, Tervek, Feladatok és visszajelzések. A szülői bejegyzés külön szülői forrással kerül mentésre; a Beszélgetések képernyőn forrásolt kérdés küldhető a helyi AI-nak, és követhető a feldolgozás/edzői ellenőrzés.
- **Edző:** Áttekintés, Napló, Állapotjelzés, Beszélgetések, Idővonal, Riportok és tervek, Felmérések, Tudástár, Feladatok és visszajelzések. A coach a játékos saját megosztott válaszait olvashatja; külön forrásként rögzítheti a megfigyelését.

Az **Idővonal** az API által visszaadott, jogosultság-ellenőrzött eseményeket a szerepkör szerinti metróágakon mutatja. Minden kártyán a dátum és az esemény időpontja is látható. A Habihoz intézett kérdés és a feldolgozás eredménye – akkor is, ha nem található ellenőrizhető forrásolt válasz – külön, egymáshoz kapcsolt eseményként része a történetnek. Az Áttekintés a legutóbbi tényleges eseményeket is megjeleníti; nincs behelyettesített mintajátékos vagy demoesemény.

Az edző a **Felmérések** résznél PDF-et tölthet fel, vagy az eredeti dokumentummal összevetve kézzel rögzítheti a mezőket, oldalt és nyers értéket. A helyi worker vírusvizsgálata után a mezők ellenőrizhetők és jóváhagyhatók. Ugyanitt a **Kérdezz a játékosról** mezőben már nem csak egy felmérési eredményről kérdezhet: Habi a játékos legfeljebb 20 legfrissebb, edzőként hozzáférhető forrását rögzíti a kéréshez. Ez tartalmazhat napi állapotjelzéseket, játékosi/szülői/edzői bejegyzéseket, havi visszatekintéseket, felméréseket, terveket, utánkövetéseket, kész riportokat, ellenőrzött mezőket és korábbi aktuális, jóváhagyott magyarázatokat. A még ellenőrizetlen riportmezők kimaradnak. A felület jelzi a források számát és az AI-válasz állapotát; az állításoknál megjelennek az alátámasztó források és a bizonytalanságok. A válasz nem diagnózis, és nem válik automatikusan játékosnak vagy szülőnek jóváhagyott magyarázattá. A **Riportok és tervek** résznél a coach forráshoz kapcsolt következő lépést készíthet, majd forrással ellátott, verziózott edzői anyagot menthet piszkozatként és külön megoszthatja. A játékos és a szülő a hozzájuk publikált tervet elfogadhatja vagy elutasíthatja, majd az aktív tervhez utánkövetést rögzíthet. A **Tudástár** kereshető, általános gyakorlatokat mutat; ezek nem egyéni diagnózisok.

## Korábbi Habi-funkciók migrációja

A `/legacy` útvonal a bejelentkezett szerepkör natív Habi-funkcióit nyitja meg, nem külön demóoldalt. Játékosként a **Feladatok és visszajelzések** résznél a legutóbbi állapotjelzés után három saját következő lépés közül választhatsz, majd elvégzettnek jelölheted. A választás a konkrét állapotjelzéshez kötve kerül a naplóba, Habi nem választ helyetted. A **Gyakorlatok és saját célok** résznél egy célt módosíthatsz, félretehetsz, újra elővehetsz, visszatekintést rögzíthetsz, szokásként folytathatsz vagy lezárhatsz. Minden célváltoztatás új naplóesemény, az eredeti bejegyzés nem törlődik. A rutinok, napi/heti visszatekintések, a 16 kérdéses havi visszatekintés, trendek, emlékeztetők és vezetett beszélgetések szintén a Habi munkaterület részei. A napi és heti visszatekintést a **Piszkozat mentése** gombbal felhőbe mentheted; a havi kérdéssor válaszai automatikusan mentődnek. Újranyitáskor a saját piszkozat folytatható, a kész bejegyzés után pedig törlődik. Az emlékeztető csak a Habi megnyitásakor jelenik meg; nincs eszközértesítés. A külön fájdalom-út segít egy megbízható felnőttnek elmondani, hol és mikor fáj; a megfogalmazott mondatot a Habi nem menti és nem küldi el. Az **Előzmények** nézet napválasztója a kiválasztott eszköz-helyi naptári nap eseményeit és aznapi tényszerű állapotjelzéseit mutatja; a **Teljes idővonal** gomb törli a szűrőt. A régi böngészőadatokat nem importálja. A játékosi vezetett beszélgetésekben hét magyar témából választhatsz, vagy röviden leírhatod, mi foglalkoztat; a helyben futó kulcsszórendezés csak témákat ajánl, nem állapít meg érzéseket. A kiválasztott téma és a kezdőüzenet a válaszonként mentett piszkozatban marad. A beszélgetés összefoglalóként megtekinthető és letölthető, lezáráskor pedig a naplóba kerül; az idővonalról később is letölthető. Az áttekintés **A legutóbbi válaszaim** részéből szerkeszthető kezdőszöveggel indíthatsz vezetett beszélgetést; a szöveg csak a check-in tényleges, felismert kérdés-válaszait tartalmazza, és küldés előtt módosíthatod. A napi válaszok értelmezése továbbra is a játékosé. Az igazolt állapotot a [funkciómigrációs nyilvántartás](legacy-feature-migration.md) rögzíti.

A **Beszélgetés előkészítése** résznél megadhatod, kivel és miről szeretnél beszélni, majd az **Előnézet és átnézés** gombbal ellenőrizheted a szöveget. Visszaléphetsz javítani, a saját naplódba mentheted vagy letöltheted. A letöltött szöveget te oszthatod meg; a Habi nem küldi el senkinek.

A saját cél létrehozásakor válaszd ki, hogy egy, két vagy négy hét múlva nézz rá újra, vagy kapcsold ki a jelzést. A visszatekintés mentésekor újra beállíthatod a ciklust. Az esedékes jelzés az alkalmazás áttekintésén jelenik meg, amikor megnyitod a Habi-t; a Habi nem küld push-, e-mail- vagy WhatsApp-értesítést. A **Cél cseréje** gombbal új célt adhatsz meg: az előző cél megmarad a naplóban, lecsereként jelölve. A korábbi cél kártyáján az **Ezt a korábbi célt állítom vissza** új célverziót hoz létre, ezért a csere és visszaállítás is látható marad az előzményekben.

## Feladatok, visszajelzések és kérdőíveredmények

- A **Feladatok és visszajelzések** nézet a szerepkörök navigációjából nyílik. A tervek és utánkövetések a Habi API-ból töltődnek be; az elfogadás, elutasítás és visszajelzés mentése a játékos napló-idővonalához kapcsolódik.
- Edzőként az **Áttekintés** oldalon válaszd ki a játékost. A **Kérdőívek és eredmények** résznél PDF-kérdőívet tölthetsz fel (legfeljebb 10 MB). A fájl a helyi worker ClamAV-vizsgálatáig karanténban marad.
- Sikeres vizsgálat után válaszd az **Új mező** gombot, és minden adatnál add meg a mező nevét, eredeti oldalszámát, az eredeti értéket és – ha szerepel – a mértékegységet. A Habi nem talál ki hiányzó értéket, és nem értelmezi át a kérdőív számait.
- Az **Adatbevitel mentése** után a rögzített adatokat ellenőrizheted. A **Mezők ellenőrzése és jóváhagyása** gomb az összes megjelenített mezőt ellenőrzöttként rögzíti. Ezt csak az eredeti PDF-fel összevetve használd.

## Szerepkörök és játékosazonosítás

Az admin új játékosmeghívó létrehozásakor megadja a játékos nevét. Amikor egy játékos saját, ellenőrzött DoneIsBetter SSO-fiókkal jelentkezik be, a Habi a szolgáltatótól kapott nevet használja a saját játékosprofil kitöltésére, ha a profil neve még üres. Ez nem írja át a szülőhöz kapcsolt gyermek profilját. Már bejelentkezett munkamenetben a név frissítéséhez jelentkezz ki, majd lépj be újra. A munkaterület szerepválasztója és profilkártyája olvasható nevet vagy szerepcímkét mutat; belső Habi-azonosító nem jelenik meg.

## Előzmények és metróvonal

Az **Előzmények** nézet a szerver jogosultság-ellenőrzött idővonalát használja. A közös fővonal és a szerepkör szerint színezett ágak a szerver által megadott folyamat-, válasz- és kapcsolódó rekord-azonosítókat követik; nem hoznak létre feltételezett kapcsolatokat. Egy állomás részletei a hozzá tartozó eseménykártyán nyithatók meg. A dátum mellett minden kártyán a helyi idő is megjelenik. A szülő vagy edző Habihoz intézett kérdése külön eseményként látszik; az elkészült válasz vagy a „nem találtunk forrásolt választ” eredmény ugyanahhoz a beszélgetéshez kapcsolódik. A játékos a saját idővonalán is látja a hozzá kapcsolódó kérdést és a no-evidence eredményt. A napválasztó a kiválasztott eszköz-helyi naptári napra szűr, és az oldal tetején megmutatja az aznap ténylegesen mentett állapotjelzések válaszait és időpontját; Habi nem von le belőlük új következtetést. A **Teljes idővonal** gombbal törölhető a szűrő. A további oldalak betöltése ugyanazt a napablakot tartja meg. Több előzmény esetén a **Korábbi események betöltése** gomb folytatja az idővonalat. Mobilon a fővonal bal oldalt, széles képernyőn középen fut.

## A prototípusból visszaállított funkciók (2026-10-27)

Az **Állapotjelzés** minden beküldött válasz után ment. A **Később folytatom** után újratöltéssel is folytatható; a **Most befejezem** részleges eredményt zár le. A szülő és az edző állapotjelzésnézetében is elérhetők a grafikák: öt saját terület vagy **Minden terület együtt**, metróvonal és válaszeloszlás, időszak és alkalomválasztás. A napra kattintva az eredeti válaszok olvashatók. A napi nézet a legutóbbi teljes kitöltést választja; ennek hiányában a legutóbbi részlegest.

A játékos **Gyakorlatok és saját célok** oldalán mind a tíz korábbi gyakorlat és a tizenkét magyarázó téma megtalálható. A gyakorlási visszajelzés konkrét saját célhoz kapcsolható. A célhoz és rutinhoz saját időzítést adhatsz; a rutin később módosítható, félretehető és folytatható. Esemény előtt vagy után külön visszatekintést írhatsz, illetve egy korábbi saját bejegyzéshez dátumozott visszatérést állíthatsz be. A cél-, rutin-, gyakorlási és beszélgetés-előkészítési szövegek automatikusan mentett privát piszkozatként visszaállnak. Az áttekintés jelzi a folytatható munkát.

Edzőként a **Felmérések** oldalon a PDF-feltöltés mellett megnyithatod az eredeti natív kérdőíveket, interjúkat/helyzeteket és a nyers kognitív riportértékek űrlapját. Az alkalom belső edzői anyagként mentődik. A mentett rekord pontos változatát külön megoszthatod a szülővel, majd visszavonhatod.

Szülőként és edzőként a **Beszélgetések** oldalon AI nélkül is indíthatsz közös témát és válaszolhatsz a hozzászólásokra. Az edző lezárhatja vagy újranyithatja a témát. Az AI-magyarázat jóváhagyásához az edző megnyitja az eredeti forrásokat, és állításonként rögzíti az ellenőrzést és az indoklást. Visszavont forrásból származó magyarázat nem marad aktuális családi válasz.

A közös tervnél konkrét felelős, határidő, indok és leállási feltétel adható meg. Az elfogadott terv szüneteltethető, folytatható és lezárható. A **Tervek** oldalon a szülő a ténylegesen megosztott edzői anyagokat is látja. Az edző az anyagot új verzióként módosíthatja, megoszthatja és visszavonhatja. A **Tudástár** oldalon új általánosított szakmai minta rögzíthető és külön ellenőrzési lépésekkel jóváhagyható.

## Habi AI-edző

Az **AI-edző** gomb bármelyik munkaterületi oldalról megnyitja a saját AI-beszélgetésedet. Az egyes tartalmak melletti robotgomb az adott bejegyzést, grafikont, kérdést vagy gyakorlatot kapcsolja a beszélgetéshez. Habi elmagyarázza, miről van szó; utána ugyanabban a beszélgetésben kérdezhetsz tovább. A **Vissza az oldalra** megőrzi az oldalad állapotát. A **Korábbi AI-beszélgetéseim** alatt a mentett beszélgetések újranyithatók.

Az **Amit Habi tud** nézet megmutatja a profilodban rendezett információkat, dátumokat és forrásokat. Saját kiegészítést adhatsz, illetve pontosíthatsz vagy elavultnak jelölhetsz egy megállapítást. A **Javaslatok** nézetben láthatod, melyik gyakorlat miért kapcsolódhat a mentett beszámolóidhoz vagy saját célodhoz, és mikor érdemes újranézni. A kipróbálásról, módosításról és eredményről adott visszajelzésed mentődik.

A saját AI-memóriád a kérdező szerepköréhez kötött. A játékoshoz hozzáférő edző az Idővonalon és a korábbi AI-beszélgetések között minden résztvevő beküldött AI-üzenetét, frissítését, pontosítását, visszajelzését és válaszát megtekintheti. Más résztvevő beszélgetését olvasási nézetben nyitja meg; a résztvevő nevében nem írhat. A játékos és a szülő továbbra is csak a saját AI-beszélgetéseit olvashatja. Egy személyes következtetést külön megoszthatsz edzői ellenőrzésre; ekkor az adott kérdés, válasz és hivatkozott források válnak elérhetővé, a teljes beszélgetés külön marad. Az edző az **Ellenőrzés** nézetben indokolt döntést rögzíthet.
