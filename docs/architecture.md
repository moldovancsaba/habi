# Habi — architektúra és biztonsági határok

## Termék és futtatási környezet

A termék neve **Habi**. A **Habigoal** a kliensbemutató prototípus és a specifikáció neve; nem a runtime neve. A Habi önálló alkalmazásként épül ebben a repositoryban.

- **Vercel:** Habi webalkalmazás és azonos eredetű API.
- **MongoDB Atlas:** a hosztolt runtime tervezett kanonikus adatbázisa. A helyi szintetikus próba nem éri el.
- **Mac worker:** a későbbi, csak kifelé kapcsolatot kezdeményező AI-worker; a már elfogadott Ollama `qwen2.5:7b` modellt és a közös hostzárat használja. Közvetlen Atlas-kapcsolatot és felhasználói SSO-titkot nem kaphat.
- **Külső AI:** személyes tartalom feldolgozására tiltott.

A jelenlegi fejlesztői tesztkörnyezet Vercel nélkül, `127.0.0.1` címen, elkülönített Mongo replica seten és kizárólag szintetikus adatokkal fut. Ez nem módosítja a tervezett production architektúrát.

## Szerepek és hozzáférési szabályok

A terméknek pontosan három szerepe van: `player`, `parent`, `coach`. A jogosult szülők és az adott tenant edzői egyenrangúak. Az írás külön tárolja a rögzítőt és az adat forrását. Minden adatbázis-lekérdezés tenantazonosítóval szűr; az API nem ad vissza közvetlen Mongo dokumentumot, csak engedélyezett mezőkből összeállított DTO-t.

- A játékos a saját `player_direct` adatait rögzíti és olvassa.
- A szülő proxy adatot a saját rögzítői azonosítójával ment; ez `parent_shared`, a játékos számára nem látható.
- Az edző megfigyelése kezdetben `coach` besorolású. A szülő csak az adott rekord pontos revisionjának külön publikálása után láthatja.
- Az idempotencia-bizonylat és az üzleti módosítás egy tranzakcióban mentődik. Revision-eltéréskor 409, a tenanton vagy látható jogosultsági körön kívüli erőforrásnál 404 a válasz.

Az adminisztráció nem negyedik termékszerep: kizárólag a DoneIsBetter Habi alkalmazásra jóváhagyott `admin` permission birtokosa kezelhet szerepköröket. A player/parent/coach hozzárendelés egyszer használatos, lejáró meghívással történik; a meghívott saját SSO-bejelentkezése után, a pontos ellenőrzött issuer+subject identitásához claimeli. E-mail alapján nincs összekapcsolás, a termékoldali szerep nem ad adminjogot. Ezt a [D-HG-016 döntés](../contracts/decisions.json) rögzíti.

Az admin callback a DoneIsBetter permission-eredményből ad adminjogot, nem egy beégetett e-mail-címből. Az admin grant a hitelesített SSO owner-session azonosítójához és identity hashéhez kötött, HttpOnly, Secure, host-only cookie; a `/admin` és az admin API minden kérésnél ellenőrzi. A `/admin` meghívót hoz létre, az egyszer használatos tokenből csak HMAC-hash kerül az adatbázisba. A claim egy tranzakcióban rögzíti az ellenőrzött identitást, actort, tagságot és role-sessiont; a session insert is a Mongo tranzakció része. Az admin UI, a claim és az adatbázis-migráció 011 kódban elkészült, de nincs Productionbe telepítve. Nincs aktív, igazolt tenant/policy-beállítás, így valódi meghívó nem adható ki.

A régi böngészői napló adatai nem szükségesek az új Habi onboardinghoz és nem kerülnek át a role-fiókokba ([D-HG-017](../contracts/decisions.json)). A kompatibilitási adatok nem használhatók automatikus identitás-illesztésre.

## Kérésfeldolgozás és adattárolás

1. A Next.js API-útvonal a `runAuthorizedHabiRoute()` közös hibakezelő és `no-store` rétegét használja.
2. A kérésvédelmi réteg ellenőrzi a session token hash-t, az actor hozzáférési revisionjét, az aktív tagságot, a tenant/player scope-ot, valamint módosító kéréseknél az origint és a CSRF tokent.
3. A bemenetet API JSON Schema ellenőrzi; az üzleti dokumentumot Ajv és a MongoDB collection validator is validálja.
4. Az írás tranzakciót, majority write concern-t, snapshot read concern-t, body hash-hez kötött idempotenciát és revision CAS-t használ.
5. Az olvasás ismét ellenőrzi a tenant/player scope-ot és a szerepkör szerinti hozzáférést, majd engedélyezett DTO-t ad vissza.
6. A lapozókurzor HMAC-aláírással a tenanthez, játékoshoz, access revisionhöz, snapshothoz és lejárati időhöz kötött. Új adat nem kerülhet egy korábbi snapshot oldalára.

A Mongo kliensfolyamatonként újrahasznált. A kezdeti pool-korlát `maxPoolSize=5`, a kapcsolódási időkorlát 5 másodperc, a kiszolgálóválasztási korlát 5 másodperc, a várakozási korlát 3 másodperc. Ezeket az értékeket még nem támasztja alá Vercel-terhelésmérés vagy Atlas-kapcsolatkeret-elemzés.

## Korábban ellenőrzött alap és jelenlegi bővítés

A `player → check-in indítása → válasz mentése → lezárás → változatlan CheckinResult` folyamat MongoDB tranzakciókat támogató helyi replica seten működik. `parent` és `coach` szerepben olvasható a mentett eredmény. A szülői és edzői megfigyelés, a rekordlista/részlet, az aláírt lapozás és az edzői megfigyelés pontos revisionjának közzététele helyi HTTP-folyamatban ellenőrzött. A szintetikus session csak `HG_ENVIRONMENT=test`, localhost app és Mongo, `_test` nevű adatbázis, szintetikus adatok és kikapcsolt külső AI mellett érhető el. Hosztolt környezetben tiltott.

A DoneIsBetter SSO és a szerepkör-meghívás kódja ebben a forrásfában van. A role-workflow API-k Production módban továbbra is fail-closed állapotúak, és a főoldal még a régi naplófelületet szolgálja ki; ezért a bejelentkezés és egy sikeres invite-claim önmagában még nem jelent használható új szerepköri alkalmazást. A helyi szintetikus belépés továbbra sem production hitelesítés. A nem-SSO szerepköri bővítések kódban megvannak, de nem aktívak Productionben: terv és utánkövetés, kérdés/thread/job, idővonal, kézi extraction review, verziózott edzői anyag, PDF chunk-feltöltés/GridFS karantén és worker API.

## SSO és session

A következő browser MVP a DoneIsBetter OIDC-integrációt használja; a módosítás a jelenlegi worktree-ben van, még nincs élesítve. A `/auth/login` tranzakciót indít state, nonce és PKCE-vel. Az `/api/oauth/callback` a rövid életű, böngészőhöz kötött tranzakciót egyszer használja fel, ellenőrzi az ID tokent/JWKS-t, userinfo subjectet és a Habi app engedélyezését. Siker esetén a szerver SSO-identity-hashhez rendelt owner-sessiont ad ki; provider tokent nem tárol.

Az új SSO-belépés új Habi owner-scope-ot hoz létre; a régi browser-cookie és `habi_states` rekordok nem kapcsolódnak hozzá és nem importálódnak. Nincs e-mail-alapú összekapcsolás vagy adatátviteli folyamat. Az owner API SSO nélkül 401-et ad; a role-workflow API-k továbbra is fail-closed állapotban vannak. A változás utáni session 8 órás abszolút és 30 perces inaktivitási határú, kijelentkezéskor visszavonható.

## Személyes és gyermekadatok

Személyes vagy gyermekadatokkal végzett pilot előtt szükséges a jóváhagyott consent/retention szabályzat, a forrásjogok bizonyítéka, a felelős owner kijelölése és az elkülönített Atlas tesztkörnyezet. A retention és adatkezelői szabályzat felülvizsgálati tervezetei: [adatmegőrzés](policies/2026-10-26-retention-policy-draft.md) és [adatkezelői szerepek](policies/2026-10-26-controller-policy-draft.md). Ezek nem jóváhagyott szabályok és nem használhatók tenant-aktiváláshoz. A szintetikus szerződéses fixture nem alakítható át valódi profilként. Exportot nem engedélyez a normál olvasási jogosultság; külön adatvédelmi folyamat szükséges.

## Normatív szerződések

A `contracts/api.json`, `contracts/schemas.json`, `contracts/policy.json`, `contracts/domain.js` és `contracts/runtime-manifest.json` írja le az API-t, az adatmodellt, a jogosultsági szabályokat és a rögzített modellkörnyezetet. Verzió- vagy digestváltoztatáskor frissítsd a manifestet és az azt ellenőrző próbákat is. Régi Habigoal- vagy Calvus-fájl nem bizonyítja, hogy bármelyik szolgáltatás ténylegesen konfigurálva vagy telepítve van.
