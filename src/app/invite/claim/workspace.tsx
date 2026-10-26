"use client";

import { useEffect, useState } from "react";
import styles from "../../admin/workspace.module.css";

type InviteRole = "player" | "parent" | "coach";
type View = "loading" | "ready" | "invalid" | "claimed" | "error";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.code ?? "REQUEST_FAILED");
  return body as T;
}

function roleName(role: InviteRole) {
  return role === "player" ? "Játékos" : role === "parent" ? "Szülő" : "Edző";
}

export default function InviteClaim() {
  const [view, setView] = useState<View>("loading");
  const [role, setRole] = useState<InviteRole | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const token =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("token") ?? "");

  useEffect(() => {
    const controller = new AbortController();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setView("invalid");
      return () => controller.abort();
    }
    fetch(`/api/invitations/claim?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) =>
        readResponse<{ role: InviteRole; tenantId: string }>(response),
      )
      .then((invitation) => {
        setRole(invitation.role);
        setTenantId(invitation.tenantId);
        setView("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setView("invalid");
      });
    return () => controller.abort();
  }, [token]);

  async function claim() {
    if (!role) return;
    setBusy(true);
    setMessage("");
    try {
      await readResponse<{ role: InviteRole }>(
        await fetch("/api/invitations/claim", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }),
      );
      setView("claimed");
    } catch (error) {
      const code = error instanceof Error ? error.message : "REQUEST_FAILED";
      if (code === "AUTHENTICATION_REQUIRED") {
        const returnTo = `/invite/claim?token=${encodeURIComponent(token)}`;
        window.location.assign(
          `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
        );
        return;
      }
      setMessage(
        code === "INVALID_INPUT"
          ? "A meghívó adatai nem érvényesek. Próbáld újra, vagy kérj új meghívót a Habi adminisztrátorától."
          : "A meghívó nem használható. Kérj új meghívót a Habi adminisztrátorától.",
      );
    } finally {
      setBusy(false);
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
          <p>Meghívó elfogadása</p>
        </header>
        <section
          className={styles.panel}
          aria-labelledby="invite-title"
          aria-live="polite"
        >
          <p className={styles.eyebrow}>HABI-HOZZÁFÉRÉS</p>
          <h1 id="invite-title">Meghívó elfogadása</h1>
          {view === "loading" && <p role="status">Ellenőrizzük a meghívót…</p>}
          {view === "invalid" && (
            <p role="alert">
              Ez a meghívó érvénytelen, lejárt vagy már felhasználták. Kérj új
              meghívót a Habi adminisztrátorától.
            </p>
          )}
          {view === "ready" && role && (
            <>
              <p>
                {roleName(role)} hozzáférést kapsz a(z){" "}
                <strong>{tenantId}</strong> szervezethez. A hozzáférés a saját,
                ellenőrzött DoneIsBetter-identitásodhoz kapcsolódik.
              </p>
              {message && <p role="alert">{message}</p>}
              <button
                className={styles.primary}
                type="button"
                onClick={claim}
                disabled={busy}
              >
                {busy
                  ? "Hozzáférés aktiválása…"
                  : "Folytatás DoneIsBetter SSO-val"}
              </button>
              <p>
                Ha még nem vagy bejelentkezve, a folytatás után a DoneIsBetter
                SSO-hoz irányítunk.
              </p>
            </>
          )}
          {view === "claimed" && (
            <div className={styles.notice}>
              <h2>A hozzáférés aktiválva</h2>
              <p>
                A szerepkör a bejelentkezett SSO-identitáshoz kapcsolódik.
                E-mail-cím alapján nem végeztünk automatikus egyeztetést.
              </p>
              <p>A Habi munkaterület megnyitásához folytasd a főoldalra.</p>
              <a className={styles.primary} href="/">
                Habi megnyitása
              </a>
            </div>
          )}
          {view === "error" && (
            <p role="alert">A meghívó most nem ellenőrizhető.</p>
          )}
        </section>
      </div>
    </main>
  );
}
