import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHostRedirect } from "../src/lib/canonical-host.mjs";

test("keeps canonical and local development hosts unchanged", () => {
  for (const host of [
    "habigoal.com",
    "HABIGOAL.COM",
    "localhost",
    "127.0.0.1",
    "::1",
  ]) {
    assert.equal(canonicalHostRedirect(host, "/", ""), null);
  }
});

test("redirects aliases and deployment hosts to the canonical origin", () => {
  assert.equal(
    canonicalHostRedirect("habi.doneisbetter.com", "/admin", ""),
    "https://habigoal.com/admin",
  );
  assert.equal(
    canonicalHostRedirect("habi-abc123-narimato.vercel.app", "/api/health", ""),
    "https://habigoal.com/api/health",
  );
});

test("preserves callback paths and query parameters", () => {
  assert.equal(
    canonicalHostRedirect(
      "habi.doneisbetter.com",
      "/api/oauth/callback",
      "?code=abc&state=xyz",
    ),
    "https://habigoal.com/api/oauth/callback?code=abc&state=xyz",
  );
});

test("refuses malformed paths and never uses an untrusted host as redirect target", () => {
  assert.equal(
    canonicalHostRedirect("attacker.example", "//attacker.example/path"),
    null,
  );
  assert.equal(
    canonicalHostRedirect(
      "attacker.example",
      "/safe",
      "?next=https://attacker.example",
    ),
    "https://habigoal.com/safe?next=https://attacker.example",
  );
});
