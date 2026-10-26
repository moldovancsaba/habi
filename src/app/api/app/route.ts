import { runApiRoute } from "@/lib/api/route-boundary.mjs";
import { readLegacyCatalog } from "@/lib/legacy-mvp/content.mjs";
import {
  isValidLegacyPayload,
  legacyOwnerSession,
  readLegacyState,
  writeLegacyState,
} from "@/lib/legacy-mvp/store.mjs";
import { getDatabase } from "@/lib/database/mongo";
import { HabiApiError } from "@/lib/api/error-response.mjs";
import { authenticateSsoOwnerRequest } from "@/lib/auth/browser-sso-session.mjs";

const MAX_BODY_BYTES = 2_000_000;

function privateHeaders() {
  return {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
}

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status, headers: privateHeaders() });
}

function attachCookie(response: Response, cookie: string | null) {
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}

async function ownerContext(
  request: Request,
  db: Awaited<ReturnType<typeof getDatabase>>,
) {
  if (process.env.HG_MVP_MODE === "sso-browser") {
    const session = await authenticateSsoOwnerRequest(db, request, {
      hmacKey: process.env.HG_SESSION_HMAC_KEY ?? "",
    });
    if (!session) throw new HabiApiError("AUTHENTICATION_REQUIRED");
    return {
      owner: session.ownerHash,
      ownerKey: session.identityHash,
      cookie: null,
      existing: true,
    };
  }
  const owner = legacyOwnerSession(request.headers.get("cookie") ?? "");
  return { ...owner, ownerKey: null };
}

export async function GET(request: Request) {
  return runApiRoute(request, "api.legacy.storage", async () => {
    const db = await getDatabase();
    const owner = await ownerContext(request, db);
    const [catalog, state] = await Promise.all([
      readLegacyCatalog(db),
      readLegacyState(db.collection("habi_states"), owner.owner),
    ]);
    return attachCookie(
      Response.json(
        {
          catalog,
          ...state,
          ...(owner.ownerKey ? { ownerKey: owner.ownerKey } : {}),
        },
        { headers: privateHeaders() },
      ),
      owner.cookie,
    );
  });
}

export async function PUT(request: Request) {
  return runApiRoute(request, "api.legacy.storage", async () => {
    const db = await getDatabase();
    const owner = await ownerContext(request, db);
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    const expectedOrigin = process.env.HG_APP_ORIGIN;
    let expectedHost: string | null = null;
    try {
      expectedHost = new URL(expectedOrigin ?? "").host;
    } catch {
      expectedHost = null;
    }

    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (!owner.cookie &&
        process.env.HG_MVP_MODE !== "sso-browser" &&
        !owner.existing) ||
      !origin ||
      !host ||
      origin !== expectedOrigin ||
      host !== expectedHost ||
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      return errorResponse(403, "ORIGIN_REJECTED");
    }

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return errorResponse(413, "INVALID_STATE");
    }

    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
      return errorResponse(413, "INVALID_STATE");
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return errorResponse(400, "INVALID_STATE");
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !Number.isSafeInteger((body as { revision?: unknown }).revision) ||
      (body as { revision: number }).revision < 0 ||
      !isValidLegacyPayload((body as { payload?: unknown }).payload)
    ) {
      return errorResponse(400, "INVALID_STATE");
    }

    const result = await writeLegacyState(
      db.collection("habi_states"),
      owner.owner,
      (body as { revision: number }).revision,
      (body as { payload: Record<string, unknown> }).payload,
    );
    if (!result) return errorResponse(409, "REVISION_CONFLICT");
    return Response.json(result, { headers: privateHeaders() });
  });
}
