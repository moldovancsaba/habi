# Habi — felhasználói útmutató

A termék címe: [habigoal.com](https://habigoal.com). A felület magyar nyelvű. A gyökéroldal a játékos/szülő/edző munkaterület; az admin belépési pont közvetlenül [habigoal.com/admin](https://habigoal.com/admin).

## Adminisztrátorok

A Habi adminisztráció külön jogosultság, nem negyedik termékszerep. A `/admin` felületet csak a DoneIsBetter Habi alkalmazás aktuális `admin` permissionje nyithatja meg. A megvalósított meghívási folyamatban az admin szerepkört választ, a meghívott pedig a saját DoneIsBetter SSO-belépése után claimeli a lejáró, egyszer használatos linket. A szerepkör a pontos, ellenőrzött SSO issuer+subject identityhez kötődik; e-mail-cím alapján nincs automatikus párosítás.

Az admin UI és a claim API a Habi Production alkalmazás része. A belépéskor a DoneIsBetter Habi alkalmazás aktuális `admin` jogosultságát ellenőrizzük; a termék nem email-cím alapján ad adminjogot. Ha a tenant még nincs előkészítve, az admin felület egyszeri gombbal alkalmazza a migrációkat és létrehozza a `habi` tenantot az MVP konfigurációval.

A működő MVP konfiguráció a jelenlegi tervezetek azonosítóira hivatkozik: [adatmegőrzés és törlés](policies/2026-10-26-retention-policy-draft.md), [adatkezelői/adatfeldolgozói szerepek](policies/2026-10-26-controller-policy-draft.md). Ez funkcionális MVP-beállítás, nem állítás jogi megfelelőségről.

## Adatok és hozzáférés

A régi naplórekordok átvitele nem előfeltétel, és nem része az új szerepköri belépésnek. A player, parent és coach szerepköröket csak admin által kiadott meghívó adja; az SSO app `admin` permissionje önmagában nem ad termékoldali szerepkört.

Ha adminisztrátorként több aktív Habi-szerepköröd van, a kezdőlapon mindegyikhez külön **Belépés ebben a szerepben** gombot látsz. Válaszd ki a használni kívánt szerepet; a Habi ellenőrzi a meglévő tagságot, létrehozza a hozzá tartozó munkamenetet, és megnyitja a munkaterületet. A szerepkörön belül a felső sávban válthatsz a fiókodhoz tartozó többi szerepkör és játékos között. A váltás csak már kiosztott aktív tagságra engedélyezett, új hozzáférést nem ad. A kezdőlapon a szerepkörök érthető neve jelenik meg, belső azonosítók nem.

Adminisztrátorként a **Szerepkör kérése a saját fiókomhoz** gombbal indíthatsz saját játékos-, szülői vagy edzőmeghívót. Az elkészült meghívót ugyanazzal a DoneIsBetter-fiókkal kell elfogadni. Szülőként válaszd ki a kapcsolódó játékost; játékos-hozzáférésnél a megadott név új játékosprofilt hoz létre. Edzői hozzáférés a tenant játékosaihoz szól.

## MVP-folyamat

1. A Habi admin a `/admin` oldalon megnyitja a tenant előkészítését.
2. Az admin létrehoz egy játékos-, szülő- vagy edzőmeghívót.
3. A meghívott megnyitja az egyszer használatos linket, saját DoneIsBetter-fiókjával belép, majd elfogadja a hozzáférést.
4. A játékos egy indítóképernyőről egyesével halad végig az elfogadott öt állapotjelző kérdésen; bármelyiket átugorhatja, visszaléphet, majd az érvényes válaszok mentődnek. Szülőnél megfigyelés, előzmények és forrásolt helyi AI-kérdés jelenik meg. Kérdéshez előbb elérhető napi állapotjelzés kell; enélkül a küldés kikapcsolt, és a magyarázat közvetlenül az űrlapnál látható. Küldés után ugyanott követhető a várakozás, feldolgozás és edzői ellenőrzés, majd a jóváhagyott válasz is. Edzőnél megfigyelés és játékosadat-hozzáférés jelenik meg.
5. A szerepkör visszavonható az admin felületen; a visszavonás megszünteti a hozzáférést.

## Szerepkörök és játékosazonosítás

Az admin új játékosmeghívó létrehozásakor megadja a játékos nevét. Amikor egy játékos saját, ellenőrzött DoneIsBetter SSO-fiókkal jelentkezik be, a Habi a szolgáltatótól kapott nevet használja a saját játékosprofil kitöltésére, ha a profil neve még üres. Ez nem írja át a szülőhöz kapcsolt gyermek profilját. Már bejelentkezett munkamenetben a név frissítéséhez jelentkezz ki, majd lépj be újra. A munkaterület szerepválasztója és profilkártyája olvasható nevet vagy szerepcímkét mutat; belső Habi-azonosító nem jelenik meg.

## Előzmények és metróvonal

Az **Előzmények** nézet a szerver jogosultság-ellenőrzött idővonalát használja. A közös fővonal és a szerepkör szerint színezett ágak a szerver által megadott folyamat-, válasz- és kapcsolódó rekord-azonosítókat követik; nem hoznak létre feltételezett kapcsolatokat. Egy állomás részletei a hozzá tartozó eseménykártyán nyithatók meg. Több előzmény esetén a **Korábbi események betöltése** gomb folytatja az idővonalat. Mobilon a fővonal bal oldalt, széles képernyőn középen fut.
