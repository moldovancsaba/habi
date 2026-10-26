"use client";

import { type FormEvent, useEffect, useState } from "react";
import styles from "./workspace.module.css";

type State = "loading" | "signed-out" | "denied" | "ready" | "error";
type Role = "player" | "parent" | "coach";
type Tenant = { id: string; tenantId: string };
type Player = { id: string; displayName: string | null };
type Membership = {
  id: string;
  actorId: string;
  playerId: string | null;
  role: Role;
  status: "active";
};
type OwnMembership = {
  role: Role;
  playerId: string | null;
  playerDisplayName: string | null;
};
type Invitation = {
  id: string;
  role: Role;
  playerId: string | null;
  playerDisplayName: string | null;
  status: "pending" | "claimed" | "revoked" | "expired";
  expiresAt: string;
};
type RoleRequest = {
  id: string;
  role: Role;
  displayName: string;
  createdAt: string;
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.code ?? "REQUEST_FAILED");
  return body as T;
}

export default function AdminConsole() {
  const [state, setState] = useState<State>("loading");
  const [signInFailure, setSignInFailure] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [ownMemberships, setOwnMemberships] = useState<OwnMembership[]>([]);
  const [role, setRole] = useState<Role>("player");
  const [playerId, setPlayerId] = useState("");
  const [playerDisplayName, setPlayerDisplayName] = useState("");
  const [createdUrl, setCreatedUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ownRole, setOwnRole] = useState<Role>("player");
  const [ownPlayerId, setOwnPlayerId] = useState("");
  const [ownPlayerName, setOwnPlayerName] = useState("");
  const [ownInviteUrl, setOwnInviteUrl] = useState("");
  const [ownRoleMessage, setOwnRoleMessage] = useState("");
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [requestPlayers, setRequestPlayers] = useState<Record<string, string>>(
    {},
  );
  const [requestInviteUrl, setRequestInviteUrl] = useState("");

  async function logOutFromHabi() {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
    window.location.replace("/");
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/me", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          const params = new URLSearchParams(window.location.search);
          setSignInFailure(
            params.get("signin") === "failed" ? params.get("reason") : null,
          );
          return setState("signed-out");
        }
        if (response.status === 403) return setState("denied");
        if (!response.ok) return setState("error");
        const body = await response.json().catch(() => null);
        if (body?.permission !== "admin") return setState("denied");
        setOwnMemberships(
          Array.isArray(body.memberships) ? body.memberships : [],
        );
        setState("ready");
        const result = await jsonResponse<{ tenants: Tenant[] }>(
          await fetch("/api/admin/invitations", {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          }),
        );
        setTenants(result.tenants);
        setTenantId(result.tenants[0]?.tenantId ?? "");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!tenantId || state !== "ready") {
      setPlayers([]);
      setInvitations([]);
      setMemberships([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/admin/invitations?tenantId=${encodeURIComponent(tenantId)}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) =>
        jsonResponse<{
          players: Player[];
          invitations: Invitation[];
          memberships: Membership[];
        }>(response),
      )
      .then((result) => {
        setPlayers(result.players);
        setInvitations(result.invitations);
        setMemberships(result.memberships);
        if (
          result.players.length &&
          !result.players.some((player) => player.id === playerId)
        ) {
          setPlayerId(result.players[0].id);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setMessage("A tenant hozzáférési adatai most nem tölthetők be.");
      });
    return () => controller.abort();
  }, [tenantId, state, playerId]);

  useEffect(() => {
    if (state !== "ready" || !tenantId) return;
    const controller = new AbortController();
    fetch("/api/admin/role-requests", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => jsonResponse<{ items: RoleRequest[] }>(response))
      .then((result) =>
        setRoleRequests(Array.isArray(result.items) ? result.items : []),
      )
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError"))
          setMessage("A szerepkörkérelmek most nem tölthetők be.");
      });
    return () => controller.abort();
  }, [state, tenantId]);

  async function issueRequestInvitation(item: RoleRequest) {
    if (item.role === "parent" && !requestPlayers[item.id]) {
      setMessage("Szülői meghívóhoz előbb válaszd ki a kapcsolódó játékost.");
      return;
    }
    setBusy(true);
    setMessage("");
    setRequestInviteUrl("");
    try {
      const response = await fetch("/api/admin/role-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: item.id,
          playerId: item.role === "parent" ? requestPlayers[item.id] : null,
        }),
      });
      const result = await jsonResponse<{ claimUrl: string }>(response);
      setRequestInviteUrl(result.claimUrl);
      setMessage(
        "A meghívó a kérelmező ellenőrzött SSO-identitásához kötődik. Másold ki, és küldd el neki biztonságos csatornán.",
      );
      const refreshed = await jsonResponse<{ items: RoleRequest[] }>(
        await fetch("/api/admin/role-requests", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      );
      setRoleRequests(refreshed.items ?? []);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "A meghívó most nem készíthető el.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || (role === "parent" && !playerId)) return;
    setBusy(true);
    setMessage("");
    setCreatedUrl("");
    try {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          role,
          playerId: role === "parent" ? playerId : null,
          playerDisplayName:
            role === "player" ? playerDisplayName.trim() : null,
        }),
      });
      const result = await jsonResponse<{ claimUrl: string }>(response);
      setCreatedUrl(result.claimUrl);
      setMessage(
        "A meghívó elkészült. A linket csak a kiválasztott felhasználóval oszd meg.",
      );
      const refreshed = await jsonResponse<{
        players: Player[];
        invitations: Invitation[];
        memberships: Membership[];
      }>(
        await fetch(
          `/api/admin/invitations?tenantId=${encodeURIComponent(tenantId)}`,
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        ),
      );
      setPlayers(refreshed.players);
      setInvitations(refreshed.invitations);
      setMemberships(refreshed.memberships);
    } catch {
      setMessage(
        "A meghívó nem készült el. Ellenőrizd a tenant beállítását, majd próbáld újra.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestOwnRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !tenantId ||
      (ownRole === "parent" && !ownPlayerId) ||
      (ownRole === "player" && !ownPlayerName.trim())
    )
      return;
    setBusy(true);
    setOwnRoleMessage("");
    setOwnInviteUrl("");
    try {
      const result = await jsonResponse<{ claimUrl: string }>(
        await fetch("/api/admin/invitations", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            role: ownRole,
            playerId: ownRole === "parent" ? ownPlayerId : null,
            playerDisplayName:
              ownRole === "player" ? ownPlayerName.trim() : null,
          }),
        }),
      );
      setOwnInviteUrl(result.claimUrl);
      setOwnRoleMessage(
        "A meghívó elkészült. Nyisd meg, és fogadd el ugyanazzal a DoneIsBetter-fiókkal, amellyel most be vagy jelentkezve.",
      );
    } catch {
      setOwnRoleMessage(
        "A szerepkör meghívója nem készült el. Ellenőrizd a kiválasztást, majd próbáld újra.",
      );
    } finally {
      setBusy(false);
    }
  }

  const ownRoleAlreadyAssigned = ownMemberships.some(
    (membership) =>
      membership.role === ownRole &&
      (ownRole !== "parent" || membership.playerId === ownPlayerId),
  );

  async function setupTenant() {
    if (
      !window.confirm(
        "Futtassuk az idempotens Habi-adatbázisfrissítést? A meglévő naplóbejegyzéseket nem törli vagy írja át.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await jsonResponse(
        await fetch("/api/admin/bootstrap", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: "habi", confirm: true }),
        }),
      );
      const result = await jsonResponse<{
        tenants: Tenant[];
      }>(
        await fetch("/api/admin/invitations", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      );
      setTenants(result.tenants);
      setTenantId(result.tenants[0]?.tenantId ?? "");
      const requests = await jsonResponse<{ items: RoleRequest[] }>(
        await fetch("/api/admin/role-requests", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      );
      setRoleRequests(requests.items ?? []);
      setMessage(
        "Az adatbázisfrissítés befejeződött. A meglévő naplóbejegyzések változatlanok maradtak.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "REVISION_CONFLICT"
          ? "A tenant már létezik eltérő beállításokkal. A meglévő adatokat nem módosítottuk."
          : "Az előkészítés nem sikerült. Ellenőrizd a szolgáltatás állapotát, majd próbáld újra.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!window.confirm("Visszavonod ezt a még fel nem használt meghívót?"))
      return;
    setBusy(true);
    setMessage("");
    try {
      await jsonResponse(
        await fetch(
          `/api/admin/invitations?id=${encodeURIComponent(invitationId)}`,
          { method: "DELETE", credentials: "same-origin" },
        ),
      );
      setInvitations((current) =>
        current.map((item) =>
          item.id === invitationId ? { ...item, status: "revoked" } : item,
        ),
      );
      setMessage("A fel nem használt meghívót visszavontuk.");
    } catch {
      setMessage("A meghívó most nem vonható vissza. Frissítsd a listát.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeMembership(membership: Membership) {
    if (
      !window.confirm(
        "Visszavonod ezt a szerepkört? Az érintett munkamenetei megszűnnek.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await jsonResponse(
        await fetch(
          `/api/admin/memberships/${encodeURIComponent(membership.id)}`,
          { method: "DELETE", credentials: "same-origin" },
        ),
      );
      setMemberships((current) =>
        current.filter((item) => item.id !== membership.id),
      );
      setMessage("A szerepkört visszavontuk; az érintett hozzáférés megszűnt.");
    } catch {
      setMessage("A szerepkör most nem vonható vissza. Frissítsd a listát.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(createdUrl);
      setMessage("A meghívó linkje a vágólapra került.");
    } catch {
      setMessage("Jelöld ki és másold ki a meghívó linkjét.");
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <a className={styles.brand} href="/" aria-label="Habi kezdőlap">
            <span aria-hidden="true" className={styles.brandMark}>
              H
            </span>
            <span>Habi</span>
          </a>
          <p>Adminisztráció</p>
          {state !== "loading" && (
            <button
              className={styles.secondary}
              type="button"
              onClick={() => void logOutFromHabi()}
            >
              Kilépés
            </button>
          )}
        </header>
        <section
          className={`${styles.panel} ds-section`}
          aria-labelledby="admin-title"
          aria-live="polite"
        >
          <div className="information-block">
            <span className="route-motif" aria-hidden="true">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48">
                <path d="M8 8v32h32" />
                <circle cx="8" cy="8" />
                <circle cx="8" cy="24" />
                <circle cx="8" cy="40" />
                <circle cx="24" cy="40" />
                <circle cx="40" cy="40" />
              </svg>
            </span>
            <p className={styles.eyebrow}>HOZZÁFÉRÉSEK</p>
            <h1 id="admin-title">Szerepkörök kezelése</h1>
            <p>
              Csak ellenőrzött DoneIsBetter-admin kezelhet Habi-hozzáférést.
            </p>
          </div>
          {state === "loading" && (
            <p role="status">Ellenőrizzük az adminisztrátori hozzáférést…</p>
          )}
          {state === "signed-out" && (
            <>
              {signInFailure === "APP_PERMISSION_SETUP_REQUIRED" ? (
                <p role="alert" className={styles.alert}>
                  A Habi automatikus SSO-felhasználói hozzáféréséhez egyszeri
                  beállítás szükséges a DoneIsBetter SSO-ban. Ellenőrizd a Habi
                  OAuth-kliens hozzáférés-kezelési jogosultságát.
                </p>
              ) : signInFailure === "APP_PERMISSION_DENIED" ? (
                <p role="alert" className={styles.alert}>
                  A DoneIsBetter-belépés megtörtént, de ehhez a fiókhoz még
                  nincs engedélyezve a Habi alkalmazás. A folytatás előtt a
                  DoneIsBetter adminisztrátorának Habi-hozzáférést és admin
                  jogosultságot kell adnia. Ezután jelentkezz be újra.
                </p>
              ) : signInFailure ? (
                <p role="alert" className={styles.alert}>
                  A bejelentkezés nem fejeződött be. Próbáld újra; ha a hiba
                  ismétlődik, jelezd a Habi rendszergazdájának.
                </p>
              ) : (
                <p>
                  A felület használatához jelentkezz be a
                  DoneIsBetter-fiókoddal.
                </p>
              )}
              <a
                className={styles.primary}
                href={
                  signInFailure
                    ? "/auth/login?returnTo=%2Fadmin&prompt=login"
                    : "/auth/login?returnTo=%2Fadmin"
                }
              >
                {signInFailure ? "Újrapróbálkozás" : "Bejelentkezés"}
              </a>
              {signInFailure === "APP_PERMISSION_DENIED" && (
                <>
                  <a
                    className={styles.secondary}
                    href="/auth/login?returnTo=%2Fadmin&prompt=select_account"
                  >
                    Másik DoneIsBetter-fiók használata
                  </a>
                  <button
                    className={styles.secondary}
                    type="button"
                    onClick={() => void logOutFromHabi()}
                  >
                    Kilépés a Habiból
                  </button>
                </>
              )}
            </>
          )}
          {state === "denied" && (
            <>
              <p role="alert">
                Ezzel a fiókkal nincs Habi adminisztrátori hozzáférés. Ha az
                adminjogot most adták hozzá, jelentkezz be újra. Ha ezután is
                elutasítást kapsz, ellenőrizni kell a fiók Habi-alkalmazásbeli
                adminjogát.
              </p>
              <a
                className={styles.primary}
                href="/auth/login?returnTo=%2Fadmin&prompt=login"
              >
                Újra bejelentkezem adminisztrátorként
              </a>
            </>
          )}
          {state === "error" && (
            <p role="alert">
              Az adminisztrátori hozzáférés most nem ellenőrizhető. Próbáld újra
              később.
            </p>
          )}
          {state === "ready" &&
            (tenants.length === 0 ? (
              <div className={styles.notice}>
                <h2>A Habi tenant előkészítése szükséges</h2>
                <p>
                  A beállított tenantazonosító: habi. Az előkészítés alkalmazza
                  a Habi adatbázis-migrációit, és létrehozza az MVP-hez
                  szükséges tenantbejegyzést a jelenlegi, felülvizsgálatra váró
                  szabályzat-hivatkozásokkal.
                </p>
                <button
                  className={styles.primary}
                  type="button"
                  disabled={busy}
                  onClick={() => void setupTenant()}
                >
                  {busy ? "Habi előkészítése…" : "Habi előkészítése az MVP-hez"}
                </button>
                {message && <p role="status">{message}</p>}
              </div>
            ) : (
              <>
                <section
                  className={styles.notice}
                  aria-labelledby="schema-refresh-heading"
                >
                  <h2 id="schema-refresh-heading">Habi működési állapota</h2>
                  <p>
                    Az adatbázis-frissítés az új szerepkörkérelmek tárolóját és
                    a Habi jelenlegi szerződéseit készíti elő. Meglévő
                    naplóadatot nem töröl.
                  </p>
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={busy}
                    onClick={() => void setupTenant()}
                  >
                    {busy ? "Frissítés folyamatban…" : "Adatbázis frissítése"}
                  </button>
                  {message && (
                    <p role="status" aria-live="polite">
                      {message}
                    </p>
                  )}
                </section>
                <section
                  className={styles.notice}
                  id="my-access"
                  aria-labelledby="my-access-heading"
                >
                  <p className={styles.eyebrow}>A SAJÁT FIÓKOD</p>
                  <h2 id="my-access-heading">Saját Habi-szerepköreim</h2>
                  {ownMemberships.length ? (
                    <ul className={styles.ownRoles}>
                      {ownMemberships.map((membership, index) => (
                        <li
                          key={`${membership.role}:${membership.playerId ?? index}`}
                        >
                          <span
                            className={`role-badge actor-${membership.role}`}
                          >
                            {membership.role === "player"
                              ? "Játékos"
                              : membership.role === "parent"
                                ? "Szülő"
                                : "Edző"}
                          </span>
                          {membership.playerDisplayName ??
                            membership.playerId ??
                            ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      Jelenleg csak DoneIsBetter-admin jogosultságod van. Habi
                      játékos, szülői vagy edzői munkaterületed még nincs.
                    </p>
                  )}
                  <h3>Szerepkör kérése a saját fiókodhoz</h3>
                  <p>
                    Adminisztrátorként létrehozhatsz egy meghívót magadnak. A
                    szerepkör csak akkor aktiválódik, ha ugyanazzal az
                    ellenőrzött fiókkal elfogadod.
                  </p>
                  <form className={styles.form} onSubmit={requestOwnRole}>
                    <label htmlFor="own-role">Kért szerepkör</label>
                    <select
                      id="own-role"
                      value={ownRole}
                      onChange={(event) =>
                        setOwnRole(event.target.value as Role)
                      }
                    >
                      <option value="player">Játékos</option>
                      <option value="parent">Szülő</option>
                      <option value="coach">Edző</option>
                    </select>
                    {ownRole === "parent" && (
                      <>
                        <label htmlFor="own-player">Kapcsolódó játékos</label>
                        <select
                          id="own-player"
                          value={ownPlayerId}
                          onChange={(event) =>
                            setOwnPlayerId(event.target.value)
                          }
                          required
                        >
                          <option value="">Válassz játékost</option>
                          {players.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.displayName ?? "Név nincs megadva"} ·{" "}
                              {player.id}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    {ownRole === "player" && (
                      <>
                        <label htmlFor="own-player-name">
                          Játékosként használt név
                        </label>
                        <input
                          id="own-player-name"
                          value={ownPlayerName}
                          onChange={(event) =>
                            setOwnPlayerName(event.target.value)
                          }
                          autoComplete="name"
                          maxLength={100}
                          required
                        />
                      </>
                    )}
                    <button
                      className={styles.primary}
                      type="submit"
                      disabled={
                        busy ||
                        !tenantId ||
                        ownRoleAlreadyAssigned ||
                        (ownRole === "parent" && players.length === 0) ||
                        (ownRole === "player" && !ownPlayerName.trim())
                      }
                    >
                      {busy
                        ? "Meghívó készül…"
                        : ownRoleAlreadyAssigned
                          ? "Ez a szerepkör már aktív"
                          : "Szerepkör kérése a saját fiókomhoz"}
                    </button>
                    {ownRoleMessage && <p role="status">{ownRoleMessage}</p>}
                    {ownInviteUrl && (
                      <a className={styles.primary} href={ownInviteUrl}>
                        Meghívó megnyitása és elfogadása
                      </a>
                    )}
                  </form>
                </section>
                <section
                  className={styles.notice}
                  aria-labelledby="role-requests-heading"
                >
                  <p className={styles.eyebrow}>FELHASZNÁLÓI KÉRELMEK</p>
                  <h2 id="role-requests-heading">Várakozó szerepkörkérelmek</h2>
                  {roleRequests.length ? (
                    <div className={styles.created}>
                      {roleRequests.map((item) => (
                        <article className={styles.notice} key={item.id}>
                          <p>
                            <strong>{item.displayName}</strong> ·{" "}
                            {item.role === "player"
                              ? "Játékos"
                              : item.role === "parent"
                                ? "Szülő"
                                : "Edző"}
                          </p>
                          <p className={styles.eyebrow}>
                            Érkezett:{" "}
                            {new Date(item.createdAt).toLocaleString("hu-HU")}
                          </p>
                          {item.role === "parent" && (
                            <label className={styles.form}>
                              Kapcsolódó játékos
                              <select
                                value={requestPlayers[item.id] ?? ""}
                                onChange={(event) =>
                                  setRequestPlayers((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                              >
                                <option value="">Válassz játékost</option>
                                {players.map((player) => (
                                  <option key={player.id} value={player.id}>
                                    {player.displayName ?? "Név nincs megadva"}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <button
                            className={styles.primary}
                            type="button"
                            disabled={
                              busy ||
                              (item.role === "parent" &&
                                !requestPlayers[item.id])
                            }
                            onClick={() => void issueRequestInvitation(item)}
                          >
                            Meghívó létrehozása és a kérelmezőhöz kötése
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>Most nincs elbírálásra váró kérelem.</p>
                  )}
                  {requestInviteUrl && (
                    <div className={styles.created}>
                      <label htmlFor="request-invite-url">
                        Személyre kötött meghívó hivatkozása
                      </label>
                      <input
                        id="request-invite-url"
                        readOnly
                        value={requestInviteUrl}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </div>
                  )}
                </section>
                <form className={styles.form} onSubmit={createInvitation}>
                  <label htmlFor="tenant">Szervezet</label>
                  <select
                    id="tenant"
                    value={tenantId}
                    onChange={(event) => setTenantId(event.target.value)}
                  >
                    {tenants.map((tenant) => (
                      <option key={tenant.tenantId} value={tenant.tenantId}>
                        {tenant.id}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="role">Habi-szerepkör</label>
                  <select
                    id="role"
                    value={role}
                    onChange={(event) => setRole(event.target.value as Role)}
                  >
                    <option value="player">Játékos</option>
                    <option value="parent">Szülő</option>
                    <option value="coach">Edző</option>
                  </select>
                  <div className="story-legend">
                    {(["player", "parent", "coach"] as const).map((item) => (
                      <span key={item} className={`role-badge actor-${item}`}>
                        {item === "player"
                          ? "Játékos"
                          : item === "parent"
                            ? "Szülő"
                            : "Edző"}
                      </span>
                    ))}
                  </div>
                  {role === "parent" && (
                    <>
                      <label htmlFor="player">Kapcsolódó játékos</label>
                      <select
                        id="player"
                        value={playerId}
                        onChange={(event) => setPlayerId(event.target.value)}
                        required
                      >
                        {players.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.displayName ?? "Név nincs megadva"} ·{" "}
                            {player.id}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {role === "player" && (
                    <>
                      <label htmlFor="player-display-name">Játékos neve</label>
                      <input
                        id="player-display-name"
                        value={playerDisplayName}
                        onChange={(event) =>
                          setPlayerDisplayName(event.target.value)
                        }
                        maxLength={100}
                        autoComplete="name"
                        required
                      />
                      <p className="muted">
                        Ezt a nevet látják a kapcsolt szülők és edzők, amikor
                        kiválasztják a játékost.
                      </p>
                    </>
                  )}
                  <button
                    className={styles.primary}
                    disabled={
                      busy ||
                      !tenantId ||
                      (role === "player" && !playerDisplayName.trim()) ||
                      (role === "parent" && players.length === 0)
                    }
                    type="submit"
                  >
                    {busy ? "Meghívó készül…" : "Meghívó létrehozása"}
                  </button>
                  {message && <p role="status">{message}</p>}
                  {createdUrl && (
                    <div className={styles.created}>
                      <label htmlFor="invite-link">
                        Egyszer használatos meghívólink
                      </label>
                      <textarea
                        id="invite-link"
                        readOnly
                        value={createdUrl}
                        rows={3}
                      />
                      <button
                        className={styles.secondary}
                        onClick={copyInvite}
                        type="button"
                      >
                        Link másolása
                      </button>
                    </div>
                  )}
                </form>
                <section
                  className={styles.list}
                  aria-labelledby="members-heading"
                >
                  <h2 id="members-heading">
                    Aktív szerepkörök és fiókazonosítók
                  </h2>
                  {memberships.length === 0 ? (
                    <p>Még nincs aktivált szerepkör.</p>
                  ) : (
                    <ul>
                      {memberships.map((membership) => (
                        <li key={membership.id}>
                          <div>
                            <span
                              className={`role-badge actor-${membership.role}`}
                            >
                              {membership.role === "player"
                                ? "Játékos"
                                : membership.role === "parent"
                                  ? "Szülő"
                                  : "Edző"}
                            </span>
                          </div>
                          <span>Habi-fiókazonosító: {membership.actorId}</span>
                          {membership.playerId && (
                            <span>
                              Játékos:{" "}
                              {players.find(
                                (player) => player.id === membership.playerId,
                              )?.displayName ?? "Név nincs megadva"}{" "}
                              · {membership.playerId}
                            </span>
                          )}
                          <button
                            className={styles.secondary}
                            type="button"
                            disabled={busy}
                            onClick={() => void revokeMembership(membership)}
                          >
                            Szerepkör visszavonása
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section
                  className={styles.list}
                  aria-labelledby="invites-heading"
                >
                  <h2 id="invites-heading">Legutóbbi meghívók</h2>
                  {invitations.length === 0 ? (
                    <p>Még nincs meghívó.</p>
                  ) : (
                    <ul>
                      {invitations.map((invite) => (
                        <li key={invite.id}>
                          <span className={`role-badge actor-${invite.role}`}>
                            {invite.role === "player"
                              ? "Játékos"
                              : invite.role === "parent"
                                ? "Szülő"
                                : "Edző"}
                          </span>
                          {invite.status === "pending" && (
                            <button
                              className={styles.secondary}
                              type="button"
                              disabled={busy}
                              onClick={() => void revokeInvitation(invite.id)}
                            >
                              Meghívó visszavonása
                            </button>
                          )}
                          {invite.playerId && (
                            <span>
                              Játékos:{" "}
                              {invite.playerDisplayName ??
                                players.find(
                                  (player) => player.id === invite.playerId,
                                )?.displayName ??
                                "Név nincs megadva"}{" "}
                              · {invite.playerId}
                            </span>
                          )}
                          <span>
                            {invite.status === "pending"
                              ? "Várakozik"
                              : invite.status === "claimed"
                                ? "Felhasználva"
                                : invite.status === "revoked"
                                  ? "Visszavonva"
                                  : "Lejárt"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ))}
        </section>
      </div>
    </main>
  );
}
