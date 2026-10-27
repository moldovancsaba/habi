"use client";
import { useEffect, useRef, useState } from "react";
import { commandMessage, productRequest } from "./product-request";
export function useContinuityDraft(
  playerId: string | null,
  actorId: string | null,
  csrfToken: string,
  kind: "player-workspace" | "support-loop",
  fields: Record<string, string>,
  restore: (values: Record<string, string>) => void,
) {
  const [status, setStatus] = useState(""),
    [loaded, setLoaded] = useState(false),
    [cycle, setCycle] = useState(0);
  const revision = useRef(0),
    saved = useRef(""),
    running = useRef(false),
    conflict = useRef(false),
    identity = useRef("");
  const values = useRef(fields),
    restoreRef = useRef(restore);
  values.current = fields;
  restoreRef.current = restore;
  const owner = `${actorId}:${playerId}:${kind}`;
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    let current = true;
    setLoaded(false);
    setStatus("");
    revision.current = 0;
    saved.current = "";
    conflict.current = false;
    identity.current = owner;
    if (!playerId || !actorId) return;
    restoreRef.current(
      Object.fromEntries(Object.keys(values.current).map((k) => [k, ""])),
    );
    void productRequest(
      `/api/v1/players/${encodeURIComponent(playerId)}/drafts/${kind}`,
      csrfToken,
      undefined,
      "GET",
    )
      .then((body) => {
        if (!current) return;
        const payload =
          body.draft?.payload ??
          Object.fromEntries(Object.keys(values.current).map((k) => [k, ""]));
        revision.current = body.draft?.revision ?? 0;
        restoreRef.current(payload);
        saved.current = JSON.stringify(payload);
        setLoaded(true);
        if (body.draft) setStatus("A korábbi piszkozatod folytatható.");
      })
      .catch(() => {
        if (current)
          setStatus(
            "A piszkozat most nem tölthető be. A meglévő változatot nem írjuk felül.",
          );
      });
    return () => {
      current = false;
    };
  }, [owner, playerId, actorId, csrfToken, kind]);
  const fingerprint = JSON.stringify(fields);
  useEffect(() => {
    if (!loaded || fingerprint === saved.current) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(values.current) === saved.current) return;
      event.preventDefault();
    };
    const beforeNavigate = (event: Event) => {
      if (JSON.stringify(values.current) === saved.current) return;
      if (event.defaultPrevented) return;
      if (
        !window.confirm(
          "A piszkozat mentése még nem fejeződött be. Mentés nélkül lépsz tovább?",
        )
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("habi:before-navigate", beforeNavigate);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("habi:before-navigate", beforeNavigate);
    };
  }, [fingerprint, loaded]);

  useEffect(() => {
    if (
      !loaded ||
      !playerId ||
      !actorId ||
      conflict.current ||
      fingerprint === saved.current
    )
      return;
    const timer = setTimeout(async () => {
      let succeeded = false;
      if (running.current) return;
      running.current = true;
      setStatus("Piszkozat mentése…");
      const body = {
        expectedRevision: revision.current,
        contentVersion: `${kind}-v1`,
        payload: values.current,
      };
      const fp = JSON.stringify(body);
      if (pending.current?.fingerprint !== fp)
        pending.current = { fingerprint: fp, key: crypto.randomUUID() };
      try {
        const result = await productRequest(
          `/api/v1/players/${encodeURIComponent(playerId)}/drafts/${kind}`,
          csrfToken,
          body,
          "PUT",
          pending.current.key,
        );
        if (identity.current === owner) {
          revision.current = result.draft.revision;
          saved.current = JSON.stringify(body.payload);
          pending.current = null;
          succeeded = true;
          setStatus("Piszkozat mentve.");
        }
      } catch (error) {
        if (identity.current === owner) {
          if (error instanceof Error && error.message === "REVISION_CONFLICT")
            conflict.current = true;
          setStatus(commandMessage(error));
        }
      } finally {
        running.current = false;
        if (identity.current !== owner) setCycle((c) => Math.max(c, cycle + 1));
        if (
          succeeded &&
          identity.current === owner &&
          JSON.stringify(values.current) !== saved.current &&
          !conflict.current
        )
          setCycle((c) => Math.max(c, cycle + 1));
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [fingerprint, loaded, playerId, actorId, csrfToken, kind, owner, cycle]);
  return { loaded, status };
}
