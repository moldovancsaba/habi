import { randomBytes } from "node:crypto";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { getDatabase, getMongoClient } from "@/lib/database/mongo";
import { authenticateSsoOwnerRequest } from "@/lib/auth/browser-sso-session.mjs";
import {
  claimRoleInvitation,
  readRoleInvitation,
} from "@/lib/auth/role-invitations.mjs";
import { issueSession, SESSION_ABSOLUTE_MS } from "@/lib/auth/session.mjs";
import type { Document } from "mongodb";

type ClaimBody = { token: string };
const DEFAULT_PLAYER_TIME_ZONE = "Europe/Budapest";

function setSessionCookie(token: string) {
  return `__Host-hg_session=${token}; Path=/; Max-Age=${SESSION_ABSOLUTE_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute(request, "identity.claim", async () => {
    const appOrigin = process.env.HG_APP_ORIGIN;
    if (
      !appOrigin ||
      request.headers.get("origin") !== appOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new HabiApiError("ACCESS_DENIED");
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 4096)
      throw new HabiApiError("INVALID_INPUT");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HabiApiError("INVALID_INPUT");
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).join(",") !== "token" ||
      typeof (body as ClaimBody).token !== "string"
    )
      throw new HabiApiError("INVALID_INPUT");

    const hmacKey = process.env.HG_SESSION_HMAC_KEY ?? "";
    const [db, client] = await Promise.all([getDatabase(), getMongoClient()]);
    const ssoSession = await authenticateSsoOwnerRequest(db, request, {
      hmacKey,
    });
    if (!ssoSession) throw new HabiApiError("AUTHENTICATION_REQUIRED");
    if (
      typeof ssoSession.issuer !== "string" ||
      typeof ssoSession.subject !== "string" ||
      !["user", "admin"].includes(ssoSession.permissionRole ?? "")
    )
      throw new HabiApiError("ACCESS_DENIED");

    const identityHash = ssoSession.identityHash;
    const now = new Date();
    const issued = await client.withSession(async (mongoSession) =>
      mongoSession.withTransaction(async () => {
        const invitations = db.collection("habi_role_invitations");
        const invitation = (await claimRoleInvitation(invitations, {
          token: (body as ClaimBody).token,
          identityHash,
          hmacKey,
          now,
          mongoSession,
        })) as
          | (Document & {
              tenantId: string;
              role: "player" | "parent" | "coach";
              playerId: string | null;
              playerDisplayName?: string | null;
            })
          | null;
        if (!invitation) throw new HabiApiError("NOT_FOUND");
        const tenant = await db.collection("tenants").findOne(
          {
            id: invitation.tenantId,
            tenantId: invitation.tenantId,
            status: "active",
          },
          { session: mongoSession },
        );
        if (!tenant) throw new HabiApiError("NOT_FOUND");
        let identity: Document | null = await db
          .collection("identities")
          .findOne(
            {
              issuer: ssoSession.issuer,
              subject: ssoSession.subject,
            },
            { session: mongoSession },
          );
        let actor: Document | null;
        if (identity) {
          actor = await db
            .collection("actors")
            .findOne(
              { id: identity.actorId, status: "active" },
              { session: mongoSession },
            );
          if (!actor || actor.identityId !== identity.id)
            throw new HabiApiError("ACCESS_DENIED");
        } else {
          const timestamp = now.toISOString();
          const actorId = randomBytes(24).toString("hex");
          const identityId = randomBytes(24).toString("hex");
          identity = {
            id: identityId,
            schemaVersion: 2,
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
            retentionPolicyId: tenant.retentionPolicyId,
            issuer: ssoSession.issuer,
            subject: ssoSession.subject,
            actorId,
          };
          actor = {
            id: actorId,
            schemaVersion: 2,
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
            retentionPolicyId: tenant.retentionPolicyId,
            identityId,
            status: "active",
            accessRevision: 1,
          };
          await db
            .collection("identities")
            .insertOne(identity, { session: mongoSession });
          await db
            .collection("actors")
            .insertOne(actor, { session: mongoSession });
        }

        const membershipQuery = {
          actorId: actor.id,
          tenantId: invitation.tenantId,
          playerId: invitation.playerId,
          role: invitation.role,
          status: "active",
        };
        let membership: Document | null = await db
          .collection("memberships")
          .findOne(membershipQuery, { session: mongoSession });
        if (!membership) {
          if (invitation.role === "player") {
            const player = {
              id: invitation.playerId,
              tenantId: invitation.tenantId,
              schemaVersion: 2,
              revision: 1,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
              retentionPolicyId: tenant.retentionPolicyId,
              actorId: actor.id,
              registeredAt: now.toISOString(),
              timeZone: DEFAULT_PLAYER_TIME_ZONE,
              ...(invitation.playerDisplayName
                ? { displayName: invitation.playerDisplayName }
                : {}),
            };
            await db
              .collection("players")
              .insertOne(player, { session: mongoSession });
          }
          membership = {
            id: randomBytes(24).toString("hex"),
            tenantId: invitation.tenantId,
            schemaVersion: 2,
            revision: 1,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            retentionPolicyId: tenant.retentionPolicyId,
            actorId: actor.id,
            playerId: invitation.playerId,
            role: invitation.role,
            status: "active",
            expiresAt: null,
            representationEvidenceRef: null,
          };
          await db
            .collection("memberships")
            .insertOne(membership, { session: mongoSession });
        }
        if (!Number.isSafeInteger(actor.accessRevision))
          throw new HabiApiError("ACCESS_DENIED");
        return issueSession(db.collection("sessions"), {
          actorId: actor.id,
          tenantId: invitation.tenantId,
          retentionPolicyId: tenant.retentionPolicyId,
          activeRole: invitation.role,
          playerId: invitation.playerId,
          accessRevision: actor.accessRevision as number,
          hmacKey,
          now,
          mongoSession,
        });
      }),
    );
    if (!issued) throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
    return Response.json(
      {
        role: issued.document.activeRole,
        playerId: issued.document.playerId,
        csrfToken: issued.csrfToken,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Set-Cookie": setSessionCookie(issued.token),
        },
      },
    );
  });
}

export async function GET(request: Request): Promise<Response> {
  return runApiRoute(request, "identity.claim", async () => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (url.searchParams.size !== 1 || !token)
      throw new HabiApiError("INVALID_INPUT");
    const invitation = await readRoleInvitation(
      (await getDatabase()).collection("habi_role_invitations"),
      token,
      process.env.HG_SESSION_HMAC_KEY ?? "",
    );
    if (!invitation) throw new HabiApiError("NOT_FOUND");
    return Response.json(invitation, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
