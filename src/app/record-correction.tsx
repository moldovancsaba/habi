"use client";
import { useState } from "react";
import {
  BodyText,
  GdsInline,
  GdsStack,
  SectionPanel,
  SemanticButton,
  StateBlock,
  Textarea as GdsTextarea,
} from "@sovereignsquad/gds/client";
import { productRequest, commandMessage } from "./product-request";
type Source = {
  id: string;
  revision: number;
  text?: string | null;
  supersedesId?: string | null;
  supersededByRef?: { id: string; revision: number } | null;
  correctionReason?: string | null;
};
export default function RecordCorrection({
  playerId,
  source,
  csrfToken,
  onSaved,
}: {
  playerId: string;
  source: Source;
  csrfToken: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(source.text ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Source | null>(null);
  return (
    <GdsStack gap="sm">
      {source.supersedesId && (
        <BodyText>
          Korábbi bejegyzés pontosítása · {source.correctionReason}
        </BodyText>
      )}
      {source.supersededByRef && (
        <GdsStack gap="xs">
          <StateBlock
            variant="info"
            title="Ehhez a bejegyzéshez már készült pontosítás"
          />
          <BodyText>
            Az eredeti szöveg megmaradt; az új bejegyzés a naplóban külön
            olvasható.
          </BodyText>
        </GdsStack>
      )}
      {!source.supersededByRef && !editing && !saved && (
        <SemanticButton
          action="edit"
          label="Bejegyzés pontosítása"
          onClick={() => setEditing(true)}
        />
      )}
      {editing && (
        <SectionPanel title="Pontosítás az eredeti megőrzésével">
          <GdsStack gap="sm">
            <BodyText>Eredeti: {source.text}</BodyText>
            <GdsTextarea
              label="Pontosított szöveg"
              required
              maxLength={4000}
              disabled={busy}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
            />
            <GdsTextarea
              label="Miért pontosítod?"
              required
              maxLength={1500}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
            {error && (
              <GdsStack gap="xs">
                <StateBlock
                  variant="error"
                  title="A pontosítás nem mentődött"
                />
                <BodyText>{error}</BodyText>
              </GdsStack>
            )}
            <GdsInline gap="sm">
              <SemanticButton
                action="save"
                label="Pontosítás mentése"
                loading={busy}
                disabled={!text.trim() || !reason.trim()}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void productRequest(
                    `/api/v1/players/${encodeURIComponent(playerId)}/records/${encodeURIComponent(source.id)}/corrections`,
                    csrfToken,
                    {
                      expectedRevision: source.revision,
                      reason,
                      replacement: { text },
                    },
                  )
                    .then((next) => {
                      setSaved(next);
                      setEditing(false);
                      onSaved();
                      window.dispatchEvent(
                        new CustomEvent("habi:activity", {
                          detail: { playerId },
                        }),
                      );
                    })
                    .catch((e) => setError(commandMessage(e)))
                    .finally(() => setBusy(false));
                }}
              />
              <SemanticButton
                action="close"
                label="Szerkesztés bezárása"
                disabled={busy}
                onClick={() => setEditing(false)}
              />
            </GdsInline>
          </GdsStack>
        </SectionPanel>
      )}
      {saved && (
        <GdsStack gap="xs">
          <StateBlock variant="success" title="A pontosítás elmentve" />
          <BodyText>
            Az eredeti bejegyzés változatlanul megmaradt. A pontosítás külön
            bejegyzésként olvasható.
          </BodyText>
        </GdsStack>
      )}
    </GdsStack>
  );
}
