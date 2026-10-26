import { randomBytes } from "node:crypto";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { authenticateSsoOwnerRequest } from "@/lib/auth/browser-sso-session.mjs";
import { hasAdminPermission } from "@/lib/auth/admin-permission.mjs";
import { issueRoleInvitation } from "@/lib/auth/role-invitations.mjs";
import { getDatabase } from "@/lib/database/mongo";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
type Role = "player" | "parent" | "coach";

async function context(request: Request) {
  const hmacKey = process.env.HG_SESSION_HMAC_KEY ?? "";
  const db = await getDatabase();
  const session = await authenticateSsoOwnerRequest(db, request, { hmacKey });
  if (!session) throw new HabiApiError("AUTHENTICATION_REQUIRED");
  if (!hasAdminPermission(request, session, hmacKey))
    throw new HabiApiError("ACCESS_DENIED");
  const tenantId = process.env.HG_TENANT_ID ?? "habi";
  return { db, session, hmacKey, tenantId };
}

function sameOrigin(request: Request) {
  if (
    !process.env.HG_APP_ORIGIN ||
    request.headers.get("origin") !== process.env.HG_APP_ORIGIN ||
    request.headers.get("sec-fetch-site") === "cross-site" ||
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HabiApiError("ACCESS_DENIED");
}

export async function GET(request: Request): Promise<Response> {
  return runApiRoute(request, "admin.role-requests", async () => {
    const { db, tenantId } = await context(request);
    const rows = await db
      .collection("habi_role_requests")
      .find({ tenantId, status: "pending" })
      .sort({ createdAt: 1 })
      .limit(100)
      .toArray();
    return Response.json(
      {
        items: rows.map((row) => ({
          id: row.id,
          role: row.role,
          displayName: row.displayName,
          createdAt: row.createdAt,
        })),
      },
      { headers },
    );
  });
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute(request, "admin.role-requests", async () => {
    sameOrigin(request);
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 2048)
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
      Object.keys(body).sort().join(",") !== "playerId,requestId"
    )
      throw new HabiApiError("INVALID_INPUT");
    const input = body as { requestId: string; playerId: string | null };
    if (
      !/^[a-f0-9]{48}$/.test(input.requestId) ||
      (input.playerId !== null &&
        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.playerId))
    )
      throw new HabiApiError("INVALID_INPUT");
    const { db, session, hmacKey, tenantId } = await context(request);
    const requests = db.collection("habi_role_requests");
    const row = await requests.findOne({
      id: input.requestId,
      tenantId,
      status: "pending",
    });
    if (!row) throw new HabiApiError("NOT_FOUND");
    const role = row.role as Role;
    if (
      (role === "parent" && !input.playerId) ||
      (role !== "parent" && input.playerId !== null)
    )
      throw new HabiApiError("INVALID_INPUT");
    const tenant = await db
      .collection("tenants")
      .findOne({ id: tenantId, tenantId, status: "active" });
    if (!tenant) throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
    let playerId: string | null = input.playerId;
    if (role === "player") playerId = randomBytes(24).toString("hex");
    if (
      role === "parent" &&
      !(await db.collection("players").findOne({ id: playerId, tenantId }))
    )
      throw new HabiApiError("NOT_FOUND");
    const issued = await issueRoleInvitation(
      db.collection("habi_role_invitations"),
      {
        tenantId,
        role,
        playerId,
        playerDisplayName: role === "player" ? row.displayName : null,
        targetIdentityHash: row.identityHash,
        createdByIdentityHash: session.identityHash,
        hmacKey,
      },
    );
    const changed = await requests.updateOne(
      { id: row.id, status: "pending" },
      {
        $set: {
          status: "invitation-issued",
          invitationId: issued.invitation.id,
          updatedAt: new Date().toISOString(),
        },
      },
    );
    if (changed.modifiedCount !== 1) throw new HabiApiError("CONFLICT");
    const claimUrl = new URL("/invite/claim", process.env.HG_APP_ORIGIN);
    claimUrl.searchParams.set("token", issued.token);
    return Response.json(
      { claimUrl: claimUrl.toString(), role, displayName: row.displayName },
      { status: 201, headers },
    );
  });
}
