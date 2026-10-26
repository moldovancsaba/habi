# Habi — felhasználói útmutató

A termék címe: [habigoal.com](https://habigoal.com). A felület magyar nyelvű. A gyökéroldal a játékos/szülő/edző munkaterület; az admin belépési pont közvetlenül [habigoal.com/admin](https://habigoal.com/admin).

## Adminisztrátorok

A Habi adminisztráció külön jogosultság, nem negyedik termékszerep. A `/admin` felületet csak a DoneIsBetter Habi alkalmazás aktuális `admin` permissionje nyithatja meg. A megvalósított meghívási folyamatban az admin szerepkört választ, a meghívott pedig a saját DoneIsBetter SSO-belépése után claimeli a lejáró, egyszer használatos linket. A szerepkör a pontos, ellenőrzött SSO issuer+subject identityhez kötődik; e-mail-cím alapján nincs automatikus párosítás.

Az admin UI és a claim API a Habi Production alkalmazás része. A belépéskor a DoneIsBetter Habi alkalmazás aktuális `admin` jogosultságát ellenőrizzük; a termék nem email-cím alapján ad adminjogot. Ha a tenant még nincs előkészítve, az admin felület egyszeri gombbal alkalmazza a migrációkat és létrehozza a `habi` tenantot az MVP konfigurációval.

A működő MVP konfiguráció a jelenlegi tervezetek azonosítóira hivatkozik: [adatmegőrzés és törlés](policies/2026-10-26-retention-policy-draft.md), [adatkezelői/adatfeldolgozói szerepek](policies/2026-10-26-controller-policy-draft.md). Ez funkcionális MVP-beállítás, nem állítás jogi megfelelőségről.

## Adatok és hozzáférés

A régi naplórekordok átvitele nem előfeltétel, és nem része az új szerepköri belépésnek. A player, parent és coach szerepköröket csak admin által kiadott meghívó adja; az SSO app `admin` permissionje önmagában nem ad termékoldali szerepkört.

## MVP-folyamat

1. A Habi admin a `/admin` oldalon megnyitja a tenant előkészítését.
2. Az admin létrehoz egy játékos-, szülő- vagy edzőmeghívót.
3. A meghívott megnyitja az egyszer használatos linket, saját DoneIsBetter-fiókjával belép, majd elfogadja a hozzáférést.
4. A játékos egy indítóképernyőről egyesével halad végig az elfogadott öt állapotjelző kérdésen; bármelyiket átugorhatja, visszaléphet, majd az érvényes válaszok mentődnek. Szülőnél megfigyelés, előzmények és forrásolt helyi AI-kérdés; edzőnél megfigyelés és játékosadat-hozzáférés jelenik meg.
5. A szerepkör visszavonható az admin felületen; a visszavonás megszünteti a hozzáférést.
