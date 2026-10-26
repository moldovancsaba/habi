import { randomBytes } from "node:crypto";
import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { authenticateSsoOwnerRequest } from "@/lib/auth/browser-sso-session.mjs";
import { getDatabase } from "@/lib/database/mongo";

type Role = "player" | "parent" | "coach";
type IdentityRecord = {
  id: string;
  issuer: string;
  subject: string;
  actorId?: string;
};
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function requireSameOrigin(request: Request) {
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

async function identityContext(request: Request) {
  const hmacKey = process.env.HG_SESSION_HMAC_KEY ?? "";
  const db = await getDatabase();
  const sso = await authenticateSsoOwnerRequest(db, request, { hmacKey });
  if (
    !sso?.issuer ||
    !sso.subject ||
    !["user", "admin"].includes(sso.permissionRole ?? "")
  )
    throw new HabiApiError("AUTHENTICATION_REQUIRED");
  const identity = await db
    .collection<IdentityRecord>("identities")
    .findOne({ issuer: sso.issuer, subject: sso.subject });
  const tenantId = process.env.HG_TENANT_ID ?? "habi";
  const tenant = await db
    .collection("tenants")
    .findOne({ id: tenantId, tenantId, status: "active" });
  if (!tenant) throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
  return { db, sso, identity, tenant, tenantId };
}

export async function GET(request: Request): Promise<Response> {
  return runApiRoute(request, "identity.role-requests", async () => {
    const { db, sso, identity, tenantId } = await identityContext(request);
    if (!identity?.actorId)
      return Response.json(
        { request: null, identity: { displayName: sso.displayName ?? null } },
        { headers: privateHeaders },
      );
    const latest = await db
      .collection("habi_role_requests")
      .find({ tenantId, actorId: identity.actorId })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();
    const memberships = await db
      .collection("memberships")
      .find({ tenantId, actorId: identity.actorId, status: "active" })
      .project({ _id: 0, role: 1 })
      .toArray();
    const requestState =
      latest && memberships.some((item) => item.role === latest.role)
        ? "active"
        : (latest?.status ?? null);
    return Response.json(
      {
        request: latest
          ? {
              id: latest.id,
              role: latest.role,
              displayName: latest.displayName,
              status: requestState,
              createdAt: latest.createdAt,
            }
          : null,
        identity: { displayName: sso.displayName ?? null },
      },
      { headers: privateHeaders },
    );
  });
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute(request, "identity.role-requests", async () => {
    requireSameOrigin(request);
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
      Object.keys(body).sort().join(",") !== "displayName,role"
    )
      throw new HabiApiError("INVALID_INPUT");
    const input = body as { role: Role; displayName: string };
    if (
      !["player", "parent", "coach"].includes(input.role) ||
      typeof input.displayName !== "string" ||
      input.displayName.trim().length > 100
    )
      throw new HabiApiError("INVALID_INPUT");
    const { db, sso, identity, tenant, tenantId } =
      await identityContext(request);
    const displayName =
      typeof sso.displayName === "string" && sso.displayName.trim().length >= 2
        ? sso.displayName.trim()
        : input.displayName.trim();
    if (displayName.length < 2) throw new HabiApiError("INVALID_INPUT");
    let requester: IdentityRecord | null = identity;
    if (!requester?.actorId) {
      const now = new Date().toISOString();
      const actorId = randomBytes(24).toString("hex");
      const createdIdentity: IdentityRecord & Record<string, unknown> = {
        id: randomBytes(24).toString("hex"),
        schemaVersion: 2,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        retentionPolicyId: tenant.retentionPolicyId,
        issuer: sso.issuer,
        subject: sso.subject,
        actorId,
      };
      try {
        await db
          .collection<IdentityRecord>("identities")
          .insertOne(createdIdentity);
        await db.collection("actors").insertOne({
          id: actorId,
          schemaVersion: 2,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          retentionPolicyId: tenant.retentionPolicyId,
          identityId: createdIdentity.id,
          status: "active",
          accessRevision: 1,
        });
        requester = createdIdentity;
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
        requester = await db
          .collection<IdentityRecord>("identities")
          .findOne({ issuer: sso.issuer, subject: sso.subject });
        if (!requester?.actorId) throw new HabiApiError("CONFLICT");
      }
    }
    const activeMembership = await db.collection("memberships").findOne({
      tenantId,
      actorId: requester.actorId,
      role: input.role,
      status: "active",
    });
    if (activeMembership) throw new HabiApiError("CONFLICT");
    const requests = db.collection("habi_role_requests");
    const existing = await requests.findOne({
      tenantId,
      actorId: requester.actorId,
      role: input.role,
      status: "pending",
    });
    if (existing)
      return Response.json(
        {
          request: {
            id: existing.id,
            role: existing.role,
            displayName: existing.displayName,
            status: existing.status,
            createdAt: existing.createdAt,
          },
        },
        { headers: privateHeaders },
      );
    const now = new Date().toISOString();
    const doc = {
      id: randomBytes(24).toString("hex"),
      tenantId,
      actorId: requester.actorId,
      identityHash: sso.identityHash,
      role: input.role,
      displayName,
      status: "pending",
      invitationId: null,
      createdAt: now,
      updatedAt: now,
      retentionPolicyId: tenant.retentionPolicyId,
    };
    await requests.insertOne(doc);
    return Response.json(
      {
        request: {
          id: doc.id,
          role: doc.role,
          displayName: doc.displayName,
          status: doc.status,
          createdAt: doc.createdAt,
        },
      },
      { status: 201, headers: privateHeaders },
    );
  });
}
