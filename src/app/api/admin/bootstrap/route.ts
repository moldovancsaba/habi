import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { authenticateSsoOwnerRequest } from "@/lib/auth/browser-sso-session.mjs";
import { hasAdminPermission } from "@/lib/auth/admin-permission.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { validateContractDocument } from "@/lib/database/contract-validation.mjs";
import { runMigrations } from "@/lib/database/migrations/runner.mjs";

const RETENTION_POLICY_ID = "habi-retention-v1-draft";
const CONTROLLER_POLICY_ID = "habi-controller-v1-draft";

export async function POST(request: Request): Promise<Response> {
  return runApiRoute(request, "admin.bootstrap", async () => {
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
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 1024) {
      throw new HabiApiError("INVALID_INPUT");
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HabiApiError("INVALID_INPUT");
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).sort().join(",") !== "confirm,tenantId" ||
      (body as { confirm?: unknown }).confirm !== true ||
      (body as { tenantId?: unknown }).tenantId !== "habi"
    ) {
      throw new HabiApiError("INVALID_INPUT");
    }

    const hmacKey = process.env.HG_SESSION_HMAC_KEY ?? "";
    const db = await getDatabase();
    const session = await authenticateSsoOwnerRequest(db, request, {
      hmacKey,
    });
    if (!session) throw new HabiApiError("AUTHENTICATION_REQUIRED");
    if (!hasAdminPermission(request, session, hmacKey)) {
      throw new HabiApiError("ACCESS_DENIED");
    }
    if (
      process.env.HG_ENVIRONMENT !== "production" ||
      process.env.HG_MVP_MODE !== "role-workflow" ||
      process.env.HG_TENANT_ID !== "habi" ||
      process.env.HG_ATLAS_DATABASE !== "habi"
    ) {
      throw new HabiApiError("DEPENDENCY_UNAVAILABLE");
    }

    const migration = await runMigrations(db);
    const now = new Date().toISOString();
    const tenant = {
      id: "habi",
      tenantId: "habi",
      schemaVersion: 2,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      retentionPolicyId: RETENTION_POLICY_ID,
      status: "active",
      controllerPolicyId: CONTROLLER_POLICY_ID,
    };
    validateContractDocument("tenants", tenant);
    await db
      .collection("tenants")
      .updateOne(
        { id: tenant.id, tenantId: tenant.tenantId },
        { $setOnInsert: tenant },
        { upsert: true },
      );
    const stored = await db.collection("tenants").findOne(
      { id: "habi", tenantId: "habi" },
      {
        projection: {
          _id: 0,
          id: 1,
          status: 1,
          retentionPolicyId: 1,
          controllerPolicyId: 1,
        },
      },
    );
    if (
      stored?.status !== "active" ||
      stored.retentionPolicyId !== RETENTION_POLICY_ID ||
      stored.controllerPolicyId !== CONTROLLER_POLICY_ID
    ) {
      throw new HabiApiError("REVISION_CONFLICT");
    }
    return Response.json(
      {
        ready: true,
        tenantId: stored.id,
        migration,
        policyReferences: {
          retentionPolicyId: stored.retentionPolicyId,
          controllerPolicyId: stored.controllerPolicyId,
          status: "draft-mvp-configuration",
        },
      },
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
    );
  });
}
