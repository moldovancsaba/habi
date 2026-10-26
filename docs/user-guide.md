# Habi — felhasználói útmutató

A termék címe: [www.habigoal.com](https://www.habigoal.com). A felület magyar nyelvű. Ha korábbi bejegyzéseid a `habi.doneisbetter.com` böngésző-munkamenetéhez kötődnek, a Habi felületen válaszd a korábbi napló átvitelét, majd ugyanabban a böngészőben igazold a DoneIsBetter-fiókodat. A két ellenőrzés után a rendszer összekapcsolja a korábbi szerveroldali naplót az SSO-fiókkal.

## Mit tudsz használni?

- **Ma:** elindíthatod a napi, hét kérdésből álló állapotjelzést. Bármelyik kérdést kihagyhatod. A befejezett válaszok mentésre kerülnek.
- **Napló:** visszanézheted a korábbi jelzések dátumát és válaszait. Egy bejegyzéshez tartozó feladatot késznek jelölhetsz.
- **Gyakorlatok:** megnyithatod a rövid, nem klinikai gyakorlatok leírását. A gyakorlatok önkéntesek.

## Adatok és eszközök

Az éles MVP a meglévő Habi-adatokat a böngészőhöz tartozó, biztonságos munkamenet-cookie alapján tölti be. Használd ugyanazt a böngészőt és böngészőprofilt, ahol korábban is vezetted a naplót. Másik eszközön vagy böngészőben ezek az adatok nem jelennek meg. A fejlesztés alatt álló SSO-váltás nem módosítja automatikusan a rekordokat: az adatkapcsolás csak az SSO-fiók és a meglévő böngésző-cookie együttes igazolásakor történhet.

Változtatás után az app jelzi, hogy az adat szerverre mentődött-e. Kapcsolat megszakadásakor a módosítás a böngészőben marad, és az app figyelmeztet a függőben lévő szinkronra. Ne töröld a böngésző helyi adatait, amíg a függőben lévő mentés nem rendeződött.

Az app nem készít automatikus minta-bejegyzéseket, nem következtet a kihagyott válaszokból, és nem helyettesít edzőt, szülőt vagy egészségügyi szakembert.

## Mi nincs még az éles MVP-ben?

Nincs éles SSO, másik eszközre szinkronizálás, családi vagy edzői megosztás, AI-válasz, feltöltött riport feldolgozása, havi visszatekintés vagy trendgrafikon. A szerepkörös Habi munkafolyamatok külön, még nem élesített fázisban vannak.
