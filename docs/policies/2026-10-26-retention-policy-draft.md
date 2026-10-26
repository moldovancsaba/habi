# Habi adatmegőrzési és törlési szabályzat — TERVEZET

**Állapot:** MVP funkcionális próbához használt tervezeti hivatkozás; nem jelent jogi jóváhagyást vagy végleges megőrzési szabályt.
**Azonosító:** `habi-retention-v1-draft`
**Hatály:** Habi `habi` tenant MVP konfigurációja.
**Verzió/dátum:** 0.1 / 2026-10-26.

## 1. Cél és alapelv

A szabályzat célja, hogy a fiatal sportoló naplójához és támogatásához szükséges adat ne maradjon meg határozatlan ideig. Minden megőrzési időhöz konkrét cél, kezdő esemény, törlési mód és ellenőrzési bizonyíték tartozik. A GDPR nem határoz meg minden ilyen adatkategóriára egységes nap- vagy évértéket; a lenti időtartamok termékszintű **javaslatok**, amelyeket az adatkezelőnek kell indokolnia és jóváhagynia.

A Habi naplója fájdalomra, közérzetre, sérülésre vagy mentális állapotra utaló adatot is tartalmazhat. Ezek egészségügyi különleges adatnak minősülhetnek. Amíg az adatkezelő nem igazolja a megfelelő GDPR 6. cikk szerinti jogalapot és — ha különleges adat keletkezik — a 9. cikk szerinti kivételt, ilyen adatot tartalmazó valós profil nem hozható létre.

## 2. Javasolt megőrzési táblázat

Az időtartamok tervezetként szerepelnek; egyik sem aktiválható pusztán azzal, hogy a tenant rekordba azonosító kerül.

| Adatkategória | Javasolt időtartam | Kezdő esemény és intézkedés |
| --- | --- | --- |
| Fel nem használt meghívó | A link 7 napig érvényes; lejárat/visszavonás után legfeljebb 30 napig maradjon meg biztonsági nyomként, majd törlendő | Claim, visszavonás vagy lejárat. A link tokenje csak hashként tárolható. A jelenlegi kód 7 napos lejáratot ír elő; a 30 napos utótárolás még nincs megvalósítva. |
| SSO tranzakció | Legfeljebb 10 perc | Lejárat után TTL-törlés; a lejáratot a kéréskori ellenőrzésnek is érvényesítenie kell. |
| Bejelentkezési munkamenet | Legfeljebb 8 óra abszolút, 30 perc inaktivitás; kijelentkezéskor azonnali visszavonás | Jelenlegi szerződéses érték. A TTL-index késleltetése nem jogosultság. |
| Függő riportfeltöltés és chunkok | 24 óra | Feltöltési lejárat. A lejáratot a blob/GridFS chunkokra is végre kell hajtani, nem csak a metaadatra. |
| Eredeti riportfájl | Jóváhagyott kézi mezőellenőrzés után legfeljebb 30 nap; ha az ellenőrzés 30 napon belül nem történik meg, a fájl törlendő és az ügy lezárandó | A mezőellenőrzés befejezése vagy a felülvizsgálati határidő. A 30 nap termékjavaslat, nincs jelenleg automatizálva. |
| Strukturált riportadat és ellenőrzési eredmény | Aktív, igazolt Habi-kapcsolat alatt; a kapcsolat lezárása után 90 nap, majd törlés vagy visszafordíthatatlan anonimizálás | A kapcsolat lezárását tenant admin vagy adatkezelő rögzíti. Jogvita vagy jogszabályi megőrzés csak dokumentált, szűk kivétel lehet. |
| Napi állapotjelzések, játékosi/szülői/edzői megfigyelések, tervek, utánkövetések, beszélgetések és AI-magyarázatok | Aktív kapcsolat alatt; az utolsó érdemi aktivitástól számított 24 hónap inaktivitás után, de a kapcsolat lezárását követő 90 napnál nem később törlendő | A kezdő időpontot és a törlési feladat eredményét naplózni kell. Az adatkezelő rövidebb időt választhat. Tényleges törlési folyamat jelenleg nincs igazolva. |
| Jogosultsági és biztonsági auditnyom | Legfeljebb 12 hónap; csak művelet, idő, tenant, minimális pszeudonim actor-azonosító, eredmény | A naplóbejegyzés időpontja. Üzenetszöveg, egészségügyi adat, token, e-mail és fájltartalom nem kerülhet az auditnaplóba. |
| Adatvédelmi kérelem nyoma | Lezárástól számított 3 év, csak a kérelem osztálya, időpontjai, döntése és pszeudonim érintett-azonosító | A megőrzési időt az adatkezelőnek jogi felülvizsgálattal kell indokolnia; a kérelemhez tartozó eredeti érzékeny tartalmat nem szabad ide másolni. |
| Biztonsági mentések | Legfeljebb 35 nap gördülő megőrzés, majd titkosított mentés végleges lejárata | Visszaállításkor a törlési naplóval egyeztetni kell, és a már törölt adatokat az alkalmazás forgalmának engedése előtt újra törölni kell. A tényleges Atlas backup beállítás jelenleg nincs igazolva. |

## 3. Törlési folyamat és kivételek

1. A kérelmező személyazonosságát és a gyermek feletti képviseleti jogosultságot megfelelő, arányos eljárással ellenőrizni kell; az admin meghívó önmagában nem bizonyít szülői felügyeletet vagy adatkezelési hozzájárulást.
2. A kérést privát, korlátozott hozzáférésű adatvédelmi ügyként rögzíteni kell. A kérés tartalma nem kerülhet általános alkalmazáslogba.
3. Az adatkezelő azonosítja az érintett adatkategóriákat, aktív adatfeldolgozókat, mentéseket és jogi megőrzési kivételeket; a kérést a GDPR határidőin belül kezeli.
4. Törléskor a rendszer tranzakciós törlési ledgerben rögzíti a scope-ot, a végrehajtott collection/blob lépéseket és az eredményt. A retry idempotens; a sikertelen részlépés riasztást és helyreállítást indít.
5. A visszaállítási próbának bizonyítania kell, hogy egy korábban lezárt törlés restore után is érvényesül.

Törlés csak a dokumentált jogi kötelezettség vagy jogi igényhez szükséges, minimális scope-ban halasztható. A kivételnek felelőse, jogalapja, lejárata és elkülönített hozzáférése legyen. Törlés helyett névtelenítést csak akkor szabad használni, ha újraazonosítás ésszerűen nem lehetséges.

## 4. Jóváhagyás előtt megválaszolandó kérdések

- Melyik jogi személy vagy természetes személy az adatkezelő, és mely ország joga irányadó?
- A Habi működtetője, a sportszervezet vagy több szereplő határozza meg az egyes adatkezelések célját és eszközeit?
- Milyen jogalap vonatkozik a gyermekadatokra és különösen az egészségi állapotra utaló adatokra?
- A javasolt 24 hónap/90 nap/30 nap/12 hónap/35 nap időtartamok megfelelnek-e a valós célnak, szerződéseknek és szolgáltatói beállításoknak?
- Ki végzi a kérelmeket, a lejárati futtatást, a törlés ellenőrzését, a restore utáni törlés újrajátszását és az incidens-eszkalációt?
- A riportfájlok megőrzése szükséges-e az ellenőrzött mezők rögzítése után, vagy azonnal törölhetők?

## 5. Műszaki bevezetési feltételek

Jóváhagyás után a policy kapjon verziózott, immutábilis azonosítót. A tenant és az összes érintett dokumentum ugyanazt az aktív policy ID-t hivatkozza. Implementálni és tesztelni kell a kategóriánkénti lejáratot, GridFS blob/chunk törlést, kérésenkénti eredményjelentést, törlési ledger idempotenciát, audit-minimalizálást, mentés-visszaállítás utáni törlést és a lejárt adatok admin jelentését. A Mongo TTL-index önmagában nem elég.

## Források

- [GDPR 2016/679, különösen 5., 6., 8., 9., 12., 17., 25., 28., 32. és 35. cikk](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679).
- [Európai Bizottság: különös biztosítékok gyermekek adataihoz](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en).
- [NAIH: adatvédelmi hatásvizsgálati lista](https://naih.hu/hatasvizsgalati-lista).

Az időtartamok fenti értékei Habi-termékjavaslatok, nem a hivatkozott szabályokból következő kötelező határidők.
