import { HabiApiError } from "../../../../../lib/api/error-response.mjs";
import { isValidApiInput } from "../../../../../lib/api/input-validation.mjs";
import { runAuthorizedHabiRoute } from "../../../../../lib/api/runtime-route";
import { runtimeSessionSettings } from "../../../../../lib/auth/runtime-auth.mjs";
import { deriveCsrfToken } from "../../../../../lib/auth/session.mjs";
import { runIdempotentCommand } from "../../../../../lib/database/idempotent-command.mjs";
import type { ClientSession } from "mongodb";

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const equalsAt = part.indexOf("=");
    if (equalsAt < 0 || part.slice(0, equalsAt).trim() !== name) continue;
    return part.slice(equalsAt + 1).trim();
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  return runAuthorizedHabiRoute(
    request,
    "me.scope.switch",
    async ({ db, client, principal }) => {
      const body = await request.json().catch(() => null);
      if (!isValidApiInput("ScopeSwitchInput", body))
        throw new HabiApiError("INVALID_INPUT");
      const input = body as { membershipId: string; playerId: string | null };
      const key = request.headers.get("idempotency-key");
      if (!key || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(key))
        throw new HabiApiError("INVALID_INPUT");

      const now = new Date();
      const command = await runIdempotentCommand({
        client,
        db,
        tenantId: principal.tenantId,
        retentionPolicyId: principal.retentionPolicyId,
        actorOrClientId: principal.actorId,
        method: request.method,
        path: new URL(request.url).pathname,
        key,
        body: input,
        async execute({
          db: transactionDb,
          session,
        }: {
          db: typeof db;
          session: ClientSession;
        }) {
          const membership = await transactionDb
            .collection("memberships")
            .findOne(
              {
                id: input.membershipId,
                actorId: principal.actorId,
                tenantId: principal.tenantId,
                playerId: input.playerId,
                status: "active",
                $or: [
                  { expiresAt: null },
                  { expiresAt: { $gt: now.toISOString() } },
                ],
              },
              { session },
            );
          if (!membership) throw new HabiApiError("NOT_FOUND");

          if (membership.playerId !== null) {
            const player = await transactionDb.collection("players").findOne(
              {
                id: membership.playerId,
                tenantId: principal.tenantId,
                ...(membership.role === "player"
                  ? { actorId: principal.actorId }
                  : {}),
              },
              { session },
            );
            if (!player) throw new HabiApiError("NOT_FOUND");
          }

          const activeSession = await transactionDb
            .collection("sessions")
            .findOne(
              {
                id: principal.sessionId,
                actorId: principal.actorId,
                tenantId: principal.tenantId,
                accessRevision: principal.accessRevision,
                activeRole: principal.role,
                playerId: principal.playerId,
                revokedAt: null,
              },
              { session },
            );
          if (!activeSession) throw new HabiApiError("REVISION_CONFLICT");

          const switched = await transactionDb.collection("sessions").updateOne(
            {
              id: activeSession.id,
              actorId: principal.actorId,
              revision: activeSession.revision,
              accessRevision: principal.accessRevision,
              activeRole: principal.role,
              playerId: principal.playerId,
              revokedAt: null,
            },
            {
              $set: {
                activeRole: membership.role,
                playerId: membership.playerId,
                retentionPolicyId: membership.retentionPolicyId,
                lastSeenAt: now.toISOString(),
                updatedAt: now.toISOString(),
              },
              $inc: { revision: 1 },
            },
            { session },
          );
          if (switched.modifiedCount !== 1)
            throw new HabiApiError("REVISION_CONFLICT");
          return {
            status: 200,
            resultRef: { id: membership.id, revision: membership.revision },
          };
        },
      });

      const target = await db.collection("memberships").findOne({
        id: command.resultRef?.id ?? input.membershipId,
        actorId: principal.actorId,
        tenantId: principal.tenantId,
        status: "active",
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now.toISOString() } }],
      });
      if (!target) throw new HabiApiError("REVISION_CONFLICT");
      const scopedSession = await db.collection("sessions").findOne({
        id: principal.sessionId,
        actorId: principal.actorId,
        tenantId: principal.tenantId,
        activeRole: target.role,
        playerId: target.playerId,
        retentionPolicyId: target.retentionPolicyId,
        accessRevision: principal.accessRevision,
        revokedAt: null,
      });
      if (!scopedSession) throw new HabiApiError("REVISION_CONFLICT");

      const memberships = await db
        .collection("memberships")
        .find({
          actorId: principal.actorId,
          tenantId: principal.tenantId,
          status: "active",
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date().toISOString() } },
          ],
        })
        .toArray();
      const playerIds = [
        ...new Set(
          memberships
            .map((membership) => membership.playerId)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      const token = readCookie(request, runtimeSessionSettings().cookieName);
      if (!token) throw new HabiApiError("AUTHENTICATION_REQUIRED");

      return Response.json(
        {
          actorId: principal.actorId,
          activeRole: target.role,
          activePlayerId: target.playerId,
          allowedRoles: [...new Set(memberships.map((item) => item.role))],
          playerIds,
          accessRevision: principal.accessRevision,
          csrfToken: deriveCsrfToken(token, runtimeSessionSettings().hmacKey),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    },
  );
}
