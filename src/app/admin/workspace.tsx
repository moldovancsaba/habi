"use client";

import { type FormEvent, useEffect, useState } from "react";
import styles from "./workspace.module.css";

type State = "loading" | "signed-out" | "denied" | "ready" | "error";
type Role = "player" | "parent" | "coach";
type Tenant = { id: string; tenantId: string };
type Player = { id: string };
type Membership = {
  id: string;
  actorId: string;
  playerId: string | null;
  role: Role;
  status: "active";
};
type Invitation = {
  id: string;
  role: Role;
  playerId: string | null;
  status: "pending" | "claimed" | "revoked" | "expired";
  expiresAt: string;
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
  const [role, setRole] = useState<Role>("player");
  const [playerId, setPlayerId] = useState("");
  const [createdUrl, setCreatedUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function setupTenant() {
    if (
      !window.confirm(
        "Előkészíted a Habi tenantot az MVP-hez és alkalmazod az adatbázis-migrációkat?",
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
      setMessage("Habi előkészítve. Most létrehozhatod az első meghívót.");
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
        </header>
        <section
          className={styles.panel}
          aria-labelledby="admin-title"
          aria-live="polite"
        >
          <p className={styles.eyebrow}>HOZZÁFÉRÉSEK</p>
          <h1 id="admin-title">Szerepkörök kezelése</h1>
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
                            {player.id}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <button
                    className={styles.primary}
                    disabled={
                      busy ||
                      !tenantId ||
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
                          <span>
                            {membership.role === "player"
                              ? "Játékos"
                              : membership.role === "parent"
                                ? "Szülő"
                                : "Edző"}
                          </span>
                          <span>Habi-fiókazonosító: {membership.actorId}</span>
                          {membership.playerId && (
                            <span>Játékosazonosító: {membership.playerId}</span>
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
                          <span>
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
                            <span>Játékosazonosító: {invite.playerId}</span>
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
