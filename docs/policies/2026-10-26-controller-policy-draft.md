# Habi adatkezelői és adatfeldolgozói szabályzat — TERVEZET

**Állapot:** MVP funkcionális próbához használt tervezeti hivatkozás; nem jelent jogi jóváhagyást vagy végleges szerepkijelölést.
**Azonosító:** `habi-controller-v1-draft`
**Hatály:** Habi `habi` tenant MVP konfigurációja.
**Verzió/dátum:** 0.1 / 2026-10-26.

## 1. Nyitott adatkezelői szerep

Ezt a dokumentumot nem lehet véglegesíteni pusztán az adminisztrátori e-mail-címből vagy a tenant nevéből. Az adatkezelő az a személy vagy szervezet, amely ténylegesen meghatározza az adatkezelés célját és lényeges eszközeit. A szerződéses elnevezés önmagában nem írja felül a tényleges szerepet.

Jóváhagyandó modell:

- **A modell — Habi üzemeltetője az adatkezelő:** akkor, ha a Habi üzemeltetője önállóan határozza meg, miért és hogyan kezeli a játékosok adatait.
- **B modell — sportszervezet az adatkezelő, Habi üzemeltetője adatfeldolgozó:** akkor, ha a klub/akadémia határozza meg a játékosadatok célját és használatát, a Habi üzemeltetője pedig csak dokumentált utasítás szerint nyújt technikai szolgáltatást. Ehhez megfelelő adatfeldolgozói szerződés és al-adatfeldolgozói engedélyezés szükséges.
- **C modell — célonként eltérő vagy közös szerep:** például a Habi üzemeltetője önálló adatkezelő a saját fiók-, biztonsági és ügyfélszolgálati adatoknál, a sportszervezet pedig adatkezelő a sportolói napló és edzői megfigyelés adataihoz. Közös adatkezelés esetén a felelősségi megállapodás lényeges tartalmát az érintettek számára hozzáférhetővé kell tenni.

**Jelenlegi választás:** nincs kijelölve adatkezelői modell. A tulajdonos a Habi MVP funkcionális tesztelését a végleges jogi policy kidolgozása előtt engedélyezte. Ez a draft az MVP technikai konfigurációjához való; nem állítja, hogy a jogi szerepek eldőltek.

## 2. Kitöltendő felelős és kapcsolattartói adatok

| Mező | Jóváhagyott érték |
| --- | --- |
| Adatkezelő teljes jogi neve / természetes személy neve | `[kitöltendő]` |
| Jogi forma és nyilvántartási azonosító, ha van | `[kitöltendő]` |
| Székhely / postai cím | `[kitöltendő]` |
| Adatvédelmi kapcsolattartó e-mail és postacím | `[kitöltendő]` |
| EU-n kívüli adatkezelő esetén képviselő | `[kitöltendő / nem alkalmazandó indoklással]` |
| Adatvédelmi tisztviselő vagy annak hiánya és értékelése | `[kitöltendő]` |
| Sportszervezet/adatfeldolgozó szerepe és szerződés | `[kitöltendő]` |
| Irányadó ország és felügyeleti hatóság | `[kitöltendő]` |
| Incidens és gyermekvédelmi eszkaláció gazdája | `[név/szerepkör, elérhetőség]` |

## 3. Tervezett adatkezelések — jóváhagyandó

| Cél | Szükséges adatok | Javasolt korlát |
| --- | --- | --- |
| SSO-bejelentkezés, szerepkör és jogosultság | Ellenőrzött issuer+subject, actor ID, tenant/role/player tagság | Nincs automatikus e-mail-alapú összekapcsolás. SSO-token nem kerül a kliensoldali tárolóba. |
| Játékos napi önreflexiója | Napi válaszok, idő, minimális folyamat- és verziómetaadat | A játékos válaszát nem szabad diagnózisként vagy automatikus teljesítmény-pontszámként felhasználni. |
| Szülői és edzői megfigyelés | Megfigyelés, forrás, rögzítő, jogosultság és publikációs státusz | Forrás/író megkülönböztetése kötelező. Edzői adat csak pontos revision publikálása után válik szülő számára láthatóvá. |
| Riport mezőinek rögzítése | Feltöltött fájl, jóváhagyott mezők, kézi ellenőrzés és forráskapcsolat | Csak engedélyezett dokumentum és minimálisan szükséges mező. Az eredeti fájlt a retention-tervezet szerint törölni kell. |
| Szülői/edzői kérdés és AI-magyarázat | Kiválasztott, a kérő számára látható Habi-források és forrásolt válasz | A Mac worker szerveroldali, aszinkron kérést küld a megosztott Hetzner `text_chat` API-nak; csak az adott kéréshez kiválasztott forráscsomag kerül továbbításra. A job körülbelül 15 percig érhető el a szolgáltatónál. A szolgáltatói adatkezelési, régiós, naplózási és törlési feltételek ellenőrzése nyitott. A claim-eket Habi újraellenőrzi, és szükség esetén edzői review szükséges. |
| Biztonság, csalásmegelőzés és helyreállítás | Minimális request/audit esemény, session- és törlési állapot | Naplóba nem kerülhet kérdésszöveg, jelentés, egészségügyi adat, token vagy titok. |

A fenti célok nem határoznak meg jogalapot. Minden célhoz külön meg kell nevezni a GDPR 6. cikk szerinti jogalapot. Egészségi állapotra utaló tartalomnál külön dokumentálni kell, hogy a feldolgozás a 9. cikk szerint megengedett-e. A szülő meghívása vagy SSO-szerepe önmagában nem bizonyít jogalapot, szülői felügyeletet, képviseleti jogosultságot vagy hozzájárulást.

## 4. Érintettek, jogok és gyermekeknek szóló tájékoztatás

Várható érintettek: fiatal sportolók, jogosult szülők/gondviselők, edzők és tenant-adminisztrátorok. A gyermeknek szóló minden tájékoztatásnak életkorhoz illő, rövid, világos magyar nyelvet kell használnia. A jogalap és az életkor szerinti szülői hozzájárulási szabály országonként eltérhet; a célország konkrét szabályát adatvédelmi szakértővel kell ellenőrizni. Nem állítjuk, hogy a szülői engedély minden célhoz szükséges vagy önmagában elégséges.

Az adatkezelőnek ki kell jelölnie egy ellenőrzött kérelmi csatornát, felelőst, azonosítási/képviseleti eljárást, válaszidőt, helyesbítési/törlési/korlátozási folyamatot és panasz/escalation tájékoztatást. A GDPR szerinti határidők és kivételek a kérelmi eljárásban alkalmazandók; a rendszernek nem szabad automatikusan teljesíteni olyan törlést, amely jogi megőrzési kivétel alá eshet.

## 5. Szolgáltatók, hozzáférés és adattovábbítás

Tervezett technikai szereplők: Vercel az alkalmazás hosztolásához; MongoDB Atlas a kanonikus tároláshoz; DoneIsBetter az SSO-hoz; a Habi által működtetett Mac a workerhez; a megosztott Hetzner AI API a hosztolt `text_chat` feladatokhoz. A szerepek, adatfeldolgozási szerződések, régiók, al-adatfeldolgozók, nemzetközi adattovábbítások, incidensvállalások, törlési képesség és mentés-megőrzés tényleges feltételeit még ellenőrizni kell. A szolgáltató neve vagy a Vercel/Atlas env-beállítás nem bizonyít önmagában GDPR-szerződéses megfelelést.

Habi műszaki korlátok: böngésző nem kap Atlas- vagy AI-szolgáltató credentialt; a Mac worker nem kap közvetlen Atlas-kapcsolatot; a worker csak rövid életű, korlátozott Habi-jobon keresztül fér hozzá engedélyezett adatokhoz, majd az adott forráscsomagot elküldi a megosztott AI API-nak. A külső szolgáltató szerződéses, megőrzési és adatkezelési feltételei nyitottak, és személyes adatos pilot előtt ellenőrzendők.

## 6. Kockázatfelmérés és incidenskezelés

Éles személyes adat előtt dokumentált adatvédelmi hatásvizsgálat-szűrés szükséges, külön figyelemmel a gyermekekre, sérülékeny érintettekre, egészségügyi következtetésekre, több szereplő közötti megosztásra és automatizált magyarázatra. A szűrés döntse el, hogy teljes DPIA szükséges-e; ezt nem lehet előre automatikusan eldönteni. A kijelölt felelősnek legyen incidensnaplója, jogosultságkorlátozott vizsgálati eljárása, szolgáltatói kapcsolat és érintetti/felügyeleti értesítési döntési útja.

## 7. Aktiválási feltételek

Ezt a tervezetet addig nem szabad `controllerPolicyId`-ként használni, amíg:

1. a controller/processor modell és a jogi személy nincs jóváhagyva;
2. az egyes célok jogalapja, különlegesadat-feltétele és a gyermek tájékoztatása nincs ellenőrizve;
3. a retention draft nincs jóváhagyva és a törlési/restore folyamat nincs implementálva és bizonyítva;
4. az adatfeldolgozói szerződések, adattovábbítások, adatbázisrégiók és mentés-beállítások nincsenek ellenőrizve;
5. a DPIA-szűrés és felelősök nincsenek dokumentálva;
6. a jóváhagyott verzió nem kapott végleges, immutábilis policy ID-t és nem került az aktiválási bizonyítékba.

## Források

- [GDPR 2016/679, különösen 5., 6., 8., 9., 12., 17., 24., 25., 28., 32. és 35. cikk](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679).
- [Európai Bizottság: adatkezelő és adatfeldolgozó szerepek](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en).
- [Európai Bizottság: gyermekek adatainak különös biztosítékai](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en).
- [Európai Bizottság: adatvédelmi tisztviselő kijelölése](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations/data-protection-officers/does-my-companyorganisation-need-have-data-protection-officer-dpo_en).
- [NAIH: adatvédelmi hatásvizsgálati lista](https://naih.hu/hatasvizsgalati-lista).

Az adatkezelői szerep és a jogalap tényleges működéstől függ; ezt a dokumentum nem dönti el.
