import test from "node:test";
import assert from "node:assert/strict";
import {
  adminPermissionCookie,
  createAdminPermissionToken,
  expiredAdminPermissionCookie,
  hasAdminPermission,
  HABI_ADMIN_COOKIE,
  verifyAdminPermissionToken,
} from "../src/lib/auth/admin-permission.mjs";

const key = "k".repeat(48);
const now = new Date("2026-10-26T12:00:00.000Z");
const session = {
  _id: "a".repeat(48),
  identityHash: "b".repeat(64),
  expiresAt: new Date(now.getTime() + 60_000),
};

test("only verified SSO admin permission creates a session-bound admin token", () => {
  const token = createAdminPermissionToken(session, "admin", key);
  assert.equal(typeof token, "string");
  assert.equal(createAdminPermissionToken(session, "user", key), null);
  assert.equal(verifyAdminPermissionToken(token, session, key, now), true);
  assert.equal(
    verifyAdminPermissionToken(
      token,
      { ...session, _id: "c".repeat(48) },
      key,
      now,
    ),
    false,
  );
  assert.equal(
    verifyAdminPermissionToken(
      token,
      session,
      key,
      new Date(now.getTime() + 61_000),
    ),
    false,
  );
});

test("admin permission token rejects tampering and malformed claims", () => {
  const token = createAdminPermissionToken(session, "admin", key);
  assert.equal(
    verifyAdminPermissionToken(`${token}x`, session, key, now),
    false,
  );
  assert.equal(verifyAdminPermissionToken(token, session, "weak", now), false);
  assert.equal(
    verifyAdminPermissionToken("not-a-token", session, key, now),
    false,
  );
});

test("admin cookie is host-only HttpOnly secure and same-site", () => {
  assert.match(
    adminPermissionCookie("opaque"),
    new RegExp(`^${HABI_ADMIN_COOKIE}=opaque;`),
  );
  assert.match(
    adminPermissionCookie("opaque"),
    /HttpOnly; Secure; SameSite=Lax$/,
  );
  assert.equal(
    expiredAdminPermissionCookie(),
    `${HABI_ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );
  const token = createAdminPermissionToken(session, "admin", key);
  const request = new Request("https://habigoal.com/api/admin", {
    headers: { cookie: `${HABI_ADMIN_COOKIE}=${token}` },
  });
  assert.equal(hasAdminPermission(request, session, key, now), true);
});
