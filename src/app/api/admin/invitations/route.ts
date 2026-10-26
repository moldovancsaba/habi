import { randomBytes } from "node:crypto";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { authenticateSsoOwnerRequest } from "@/lib/auth/browser-sso-session.mjs";
import { hasAdminPermission } from "@/lib/auth/admin-permission.mjs";
import { issueRoleInvitation } from "@/lib/auth/role-invitations.mjs";

type InviteBody = {
  tenantId: string;
  role: "player" | "parent" | "coach";
  playerId: string | null;
  playerDisplayName: string | null;
};

function privateHeaders() {
  return {
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  };
}

async function requireAdmin(request: Request) {
  const hmacKey = process.env.HG_SESSION_HMAC_KEY ?? "";
  const db = await getDatabase();
  const session = await authenticateSsoOwnerRequest(db, request, { hmacKey });
  if (!session) throw new HabiApiError("AUTHENTICATION_REQUIRED");
  if (!hasAdminPermission(request, session, hmacKey)) {
    throw new HabiApiError("ACCESS_DENIED");
  }
  return { db, session, hmacKey };
}

function validId(value: unknown): value is string {
  return (
    typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)
  );
}

function configuredTenantId(): string {
  const tenantId = process.env.HG_TENANT_ID;
  if (!validId(tenantId)) throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
  return tenantId;
}

export async function GET(request: Request): Promise<Response> {
  return runApiRoute(request, "admin.invitations", async () => {
    const { db } = await requireAdmin(request);
    const url = new URL(request.url);
    const configuredId = configuredTenantId();
    const requestedTenantId = url.searchParams.get("tenantId");
    const tenantId = requestedTenantId ?? configuredId;
    if (url.searchParams.size > 1 || (tenantId && !validId(tenantId))) {
      throw new HabiApiError("INVALID_INPUT");
    }
    if (tenantId !== configuredId) throw new HabiApiError("ACCESS_DENIED");
    if (!requestedTenantId) {
      const tenant = await db
        .collection("tenants")
        .findOne(
          { id: configuredId, tenantId: configuredId, status: "active" },
          { projection: { _id: 0, id: 1, tenantId: 1 } },
        );
      return Response.json(
        {
          tenants: tenant ? [{ id: tenant.id, tenantId: tenant.tenantId }] : [],
        },
        { headers: privateHeaders() },
      );
    }
    const tenant = await db.collection("tenants").findOne({
      id: tenantId,
      tenantId,
      status: "active",
    });
    if (!tenant) throw new HabiApiError("NOT_FOUND");
    const invitations = await db
      .collection("habi_role_invitations")
      .find({ tenantId })
      .sort({ createdAt: -1, id: -1 })
      .limit(100)
      .toArray();
    const players = await db
      .collection("players")
      .find({ tenantId })
      .sort({ id: 1 })
      .limit(500)
      .project({ _id: 0, id: 1, displayName: 1 })
      .toArray();
    const memberships = await db
      .collection("memberships")
      .find({ tenantId, status: "active" })
      .sort({ role: 1, playerId: 1, actorId: 1 })
      .limit(1000)
      .toArray();
    const now = new Date();
    return Response.json(
      {
        tenantId,
        players: players.map((player) => ({
          id: player.id,
          displayName: player.displayName ?? null,
        })),
        memberships: memberships.map((membership) => ({
          id: membership.id,
          actorId: membership.actorId,
          playerId: membership.playerId,
          role: membership.role,
          status: membership.status,
        })),
        invitations: invitations.map((item) => ({
          id: item.id,
          role: item.role,
          playerId: item.playerId,
          playerDisplayName: item.playerDisplayName ?? null,
          createdAt: item.createdAt,
          expiresAt: item.expiresAt,
          status: item.claimedAt
            ? "claimed"
            : item.revokedAt
              ? "revoked"
              : item.expiresAt <= now
                ? "expired"
                : "pending",
        })),
      },
      { headers: privateHeaders() },
    );
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return runApiRoute(request, "admin.invitations", async () => {
    const origin = process.env.HG_APP_ORIGIN;
    if (
      !origin ||
      request.headers.get("origin") !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new HabiApiError("ACCESS_DENIED");
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (url.searchParams.size !== 1 || !id || !/^[a-f0-9]{48}$/.test(id))
      throw new HabiApiError("INVALID_INPUT");
    const { db } = await requireAdmin(request);
    const revoked = await db.collection("habi_role_invitations").updateOne(
      {
        id,
        claimedAt: null,
        claimedIdentityHash: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { revokedAt: new Date().toISOString() } },
    );
    if (revoked.modifiedCount !== 1) throw new HabiApiError("NOT_FOUND");
    return Response.json({ revoked: true }, { headers: privateHeaders() });
  });
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute(request, "admin.invitations", async () => {
    const origin = process.env.HG_APP_ORIGIN;
    if (
      !origin ||
      request.headers.get("origin") !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      throw new HabiApiError("ACCESS_DENIED");
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 16_384) throw new HabiApiError("INVALID_INPUT");
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 16_384)
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
      Object.keys(body).sort().join(",") !==
        "playerDisplayName,playerId,role,tenantId"
    )
      throw new HabiApiError("INVALID_INPUT");
    const input = body as InviteBody;
    const configuredId = configuredTenantId();
    if (
      !validId(input.tenantId) ||
      input.tenantId !== configuredId ||
      !["player", "parent", "coach"].includes(input.role) ||
      (input.role === "coach" && input.playerId !== null) ||
      (input.role === "parent" && !validId(input.playerId)) ||
      (input.role === "player" &&
        (input.playerId !== null ||
          typeof input.playerDisplayName !== "string" ||
          input.playerDisplayName.trim().length < 1 ||
          input.playerDisplayName.trim().length > 100)) ||
      (input.role !== "player" && input.playerDisplayName !== null)
    )
      throw new HabiApiError("INVALID_INPUT");

    const { db, session, hmacKey } = await requireAdmin(request);
    const tenant = await db.collection("tenants").findOne({
      id: input.tenantId,
      tenantId: input.tenantId,
      status: "active",
    });
    if (!tenant) throw new HabiApiError("NOT_FOUND");
    let playerId: string | null = input.playerId;
    if (input.role === "player") playerId = randomBytes(24).toString("hex");
    if (input.role === "parent") {
      const player = await db.collection("players").findOne({
        id: playerId,
        tenantId: input.tenantId,
      });
      if (!player) throw new HabiApiError("NOT_FOUND");
    }
    const issued = await issueRoleInvitation(
      db.collection("habi_role_invitations"),
      {
        tenantId: input.tenantId,
        role: input.role,
        playerId,
        playerDisplayName: input.playerDisplayName,
        createdByIdentityHash: session.identityHash,
        hmacKey,
      },
    );
    const claimUrl = new URL("/invite/claim", origin);
    claimUrl.searchParams.set("token", issued.token);
    return Response.json(
      {
        invitation: {
          id: issued.invitation.id,
          role: issued.invitation.role,
          playerId: issued.invitation.playerId,
          playerDisplayName: issued.invitation.playerDisplayName ?? null,
          expiresAt: issued.invitation.expiresAt,
        },
        claimUrl: claimUrl.toString(),
      },
      { status: 201, headers: privateHeaders() },
    );
  });
}
