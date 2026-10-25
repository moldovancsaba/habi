# Habi — architektúra és biztonsági határok

## Futtatási felosztás

A Vercel szolgáltatja a Habi webalkalmazást és az azonos origin API-t. A MongoDB Atlas a kanonikus személyes, review- és tudásadat-tár; a riportfájlok GridFS-be kerülnek. A Habi a saját DoneIsBetter SSO-integrációján keresztül azonosítja a felhasználót.

A Mac kizárólag AI-workert futtat: a worker kifelé hívja a Vercel feladat API-ját, az elfogadott hostzárat és a már telepített Ollama `qwen2.5:7b` modellt használja. A worker nem csatlakozhat közvetlenül az Atlas-hoz, nem kaphat felhasználói SSO vagy web session titkot, és nem küldhet személyes tartalmat külső AI-szolgáltatónak.

## Elérhetőség és Atlas-kapcsolat

- `GET /api/health` liveness: azt jelzi, hogy a webalkalmazás HTTP-kérést szolgál ki. Nem állít adatbázis-kapcsolatot.
- `GET /api/ready` readiness: Atlas `ping` után `200 {ok:true,service:"habi"}`; konfigurációs vagy hálózati hibánál `503 {ok:false,service:"habi",error:"DEPENDENCY_UNAVAILABLE"}`. A driver-hibát, URI-t, hostot és credentialt nem adja vissza és nem naplózza.
- A szerverfolyamat egy `MongoClient` példányt és poolt használ újra. Kezdő korlátok: `maxPoolSize=5`, `minPoolSize=0`, `maxIdleTimeMS=60000`, `connectTimeoutMS=5000`, `serverSelectionTimeoutMS=5000`, `waitQueueTimeoutMS=3000`. Az Atlas `HG_ATLAS_URI` és `HG_ATLAS_DATABASE` nélkül nem kapcsolódik; szintetikus lokális környezetben az Atlas letiltott.
- A pool korlát folyamatonként/függvénypéldányonként értendő, nem globális Vercel-projektkorlát. Ötös pool induló, konzervatív érték, nem mért terhelési cél; a skálázás és Atlas connection budget még nincs igazolva. A driver hálózati retryja nem helyettesíti az üzleti idempotenciát.
- Eddig csak konfiguráció- és readiness-eredménypróba futott. Atlasra nem csatlakoztunk; a `habi_mongodb_uri` secret értékét nem olvastuk vagy használtuk.

## Adatbázis-alapréteg · HG-DEV-03

- A 36 persistence collection sémája a Calvus `habigoal/contracts/schemas.json` fájl rögzített pillanatképe (`contracts/domain-schemas.source.json`). A `contracts/source-manifest.json` forrás commitot és SHA-256 digestet rögzít; a teszt ezt ellenőrzi. A kanonikus szerződés változását csak forrásfrissítéssel és új snapshot/digesttel szabad átvenni.
- Ajv 2020 validálja a teljes szerződést és a beágyazott referenciákat. Az `001-initial-schema` verziózott migráció collectionenként MongoDB `$jsonSchema` validátort és indexeket állít be, `strict/error` módban. A MongoDB `expiresAt` mezői BSON Date formában tárolódnak a TTL indexhez; HTTP DTO-ba ISO dátummá kell szerializálni.
- A tenant repository minden olvasásnál kötelező `tenantId` szűrést ad. Revision írás `findOneAndUpdate` CAS-szal zárja ki a last-write-wins felülírást; az `id`, `tenantId`, `schemaVersion`, `revision` és `createdAt` nem módosítható általános mezőként.
- A tranzakciós idempotencia receipt-et és üzleti módosítást ugyanabban a Mongo session tranzakcióban ment. Majority write concern, snapshot read concern, 24 órás kulcs-ablak és request-body SHA-256 tartozik hozzá. A callback csak tranzakcióba kötött DB-műveletet végezhet; HTTP/Ollama/e-mail külső mellékhatás nem ismételhető benne. Az elveszett kliensválasz azonos kulccsal visszajátszható.
- A login state külön, belső `auth_transactions` collectionbe kerül. A 36 termékszerződés szerinti collectiontól elkülönül; a state/browser binding hash-elve, a nonce és PKCE verifier csak szerveroldalon tárolódik, tíz perc után TTL takarítja. Atomic consumption védi a replayt és a másik böngészőből érkező callbacket. Az OIDC modul HTTPS issuer-discoveryt, JSON token exchange-et, RS256-claim ellenőrzést, userinfo és app-permission hívást ad; ismeretlen `kid` JWKS-frissítés még nincs bekötve.
- A `(issuer,subject)` identitás-feloldó aktív actorhoz és az aktuálisan még létező, aktív tenant/player kapcsolatokat vizsgálja; e-mail egyezés nem jogosít. Session-alapréteg opaque 256-bit tokent ad, Atlasban HMAC hash-t tárol, CSRF-t tokendervációval köti, és nyolcórás abszolút / 30 perces idle lejáratot, touch-et és revoke-ot kezel. A session ID hex formátuma megfelel a közös ID-sémának. Nincs token tárolt refresh/access adat. Az ID-token ellenőrzés ismeretlen `kid` esetén egyszer frissíti a JWKS-t öt másodperces timeouttal; ha a friss kulcskészlet sem tartalmaz megfelelő RSA aláírókulcsot, zártan elutasít. A következő authentikációs lépés a hosted route, permission credential lifecycle és a request-time middleware; ezek nélkül az OIDC/session függvények önmagukban nem adnak bejelentkezett terméket.
- SSO app-permission minden művelet előtt frissen kérendő. Kizárólag SSO-hálózati/kiesési hibánál a processzlokális cache-ben lévő korábbi approved eredmény legfeljebb 60 másodpercig tarthat fenn normál olvasást; denied állapot sosem használ stale engedélyt. Írás, publikálás és worker-context kiadás SSO-kiesésnél mindig elutasított. A cache 256 bejegyzésre korlátos, csak `(issuer, subject, clientId)` hash-kulcsot, approved role-t és ellenőrzési időt tartalmaz; nem adatgazda és nem hordozható folyamatok között. A fetch timeout/network hibák a stabil `SSO_DEPENDENCY_UNAVAILABLE` kódra normalizálódnak; váratlan checker-hiba nem kap stale-read felmentést. Ez a döntési logika megvalósult, de a friss ellenőrzéshez szükséges SSO credential lifecycle és hosted middleware még nincs.
- A lokális migrációs/seed CLI védelmi kapuja kizárólag `HG_ENVIRONMENT=test`, explicit `HG_MIGRATION_ALLOW_LOCAL_TEST_DB=true`, loopback Mongo URI és `_test` végű DB-nevet enged. A seed fix azonosítókat használ két tenantban, és `$setOnInsert` miatt újraindítható. A migration újrafuttatható; nincs automatikus down-migráció, visszaállítás backupból történik.
- Ez a réteg nincs bekötve domain HTTP handlerekbe, nem igazol éles Atlas DB-t, termékfelhasználói adatot, migration production runbookot vagy backup/restore helyreállítást.

A konkrét indexdefiníciók, migration checksum, TTL dátumkonverzió, tenant query adapter és helyreállítási szabályok a [persistence designban](persistence.md) vannak leírva.

## Kötelező adatvédelmi viselkedés

- Minden olvasás és írás szerveroldali tenant-, szerep-, tagság- és erőforrásverzió-ellenőrzésen megy át.
- A rejtett erőforrás egységesen nem található választ ad; más tenant adata vagy létezésére utaló metaadat nem szivároghat ki.
- A napi értelmezés és a források snapshotként, megváltoztathatatlan eredményhez kötve tárolandók.
- A nem publikált edzői anyag nem látható szülőnek vagy játékosnak.
- A személyes AI-eredmény emberi review nélkül nem látható a családnak.
- Külső AI alapból tiltott; csak külön jóváhagyott, általános csomag kerülhet ki.
- Helyi szintetikus próbán túl személyes adatfeldolgozás nem engedélyezett jóváhagyott consent/retention policy nélkül.

## Idővonal DTO-adapter

`src/lib/client/timeline-view-model.mjs` a szerver által jogosultan visszaadott oldal node-jait mapeli a prototípus timeline mezőneveire: `submittedAt → at`, `actorRole → role`, `kind → type`; azonosító, revision, processId és tárolt reply/related ID változatlan. `closedAt` csak a szerver által visszaadott kapcsolt Processből, vagy az explicit DTO-mezőből kerül be; process-bizonyíték nélkül kimarad. A cursor, snapshot, continuations és edges változatlanul megmarad. Az adapter nem másol tenant/retention/audit mezőt, nem készít author/title/text értéket, és hibás rekordot nem dob el csendben, hanem elutasítja az oldalt. Ez nem pótolja a szerveroldali DTO-whitelistet vagy API-handlert.

## Jelenlegi hiányok

A repository a Next.js indítási alapot, fail-closed konfigurációellenőrzést, liveness/readiness végpontot, Atlas driver-kapcsolati réteget, szerződés-snapshotokat, 36 domain collectiont és egy belső auth collectiont létrehozó migrációkat, szintetikus seedet, tenant/CAS/idempotencia-adaptert, OIDC/session alapfüggvényeket tartalmaz. Nincs még hosted SSO-flow, permission credential lifecycle, auth middleware, domain API-handler, GridFS, tartós job/lease, worker polling/lease/inference vagy end-to-end felhasználói folyamat. Ezeket a projekt dokumentációja tételesen követi a Calvus #35 feladatban.
