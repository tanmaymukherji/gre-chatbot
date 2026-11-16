import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilitiesFor,
  extractAccessToken,
  verifyAccessToken
} from "./verified-session-core.mjs";

const now = 2_000_000_000;
const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

function token(payload = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({
    sub: userId,
    session_id: sessionId,
    exp: now + 60,
    aud: "authenticated",
    ...payload
  })).toString("base64url");
  return `${header}.${body}.test-signature`;
}

function dependencies(user = {}) {
  return {
    getUserByToken: async () => ({
      data: {
        user: {
          id: userId,
          email: "USER@example.org",
          app_metadata: { grameee_role: "user" },
          user_metadata: {},
          ...user
        }
      },
      error: null
    }),
    isSessionActive: async () => true
  };
}

test("extracts only a bearer or signed-session cookie token", () => {
  assert.equal(extractAccessToken({ authorization: "Bearer signed.jwt.token", cookieToken: "cookie" }), "signed.jwt.token");
  assert.equal(extractAccessToken({ authorization: "Basic forged-summary", cookieToken: "valid-cookie" }), null);
  assert.equal(extractAccessToken({ cookieToken: "cookie.jwt.token", summaryCookie: '{"role":"admin"}' }), "cookie.jwt.token");
  assert.equal(extractAccessToken({ summaryCookie: '{"role":"admin"}' }), null);
});

test("rejects expired or non-user access tokens before remote lookup", async () => {
  let calls = 0;
  const deps = dependencies();
  deps.getUserByToken = async () => { calls += 1; return { data: { user: null } }; };

  assert.equal(await verifyAccessToken({ accessToken: token({ exp: now }), nowSeconds: now, ...deps }), null);
  assert.equal(await verifyAccessToken({ accessToken: token({ aud: "anon" }), nowSeconds: now, ...deps }), null);
  assert.equal(calls, 0);
});

test("fails closed when Supabase does not verify the user", async () => {
  const deps = dependencies();
  deps.getUserByToken = async () => ({ data: { user: null }, error: new Error("invalid") });
  assert.equal(await verifyAccessToken({ accessToken: token(), nowSeconds: now, ...deps }), null);
});

test("fails closed when user and token subjects differ", async () => {
  const deps = dependencies({ id: "33333333-3333-4333-8333-333333333333" });
  assert.equal(await verifyAccessToken({ accessToken: token(), nowSeconds: now, ...deps }), null);
});

test("rejects removed users and removed sessions", async () => {
  const removed = dependencies({ app_metadata: { grameee_role: "removed", grameee_removed: true } });
  assert.equal(await verifyAccessToken({ accessToken: token(), nowSeconds: now, ...removed }), null);

  const revoked = dependencies();
  revoked.isSessionActive = async () => false;
  assert.equal(await verifyAccessToken({ accessToken: token(), nowSeconds: now, ...revoked }), null);
});

test("derives role only from trusted app metadata", async () => {
  const deps = dependencies({
    app_metadata: { grameee_role: "user" },
    user_metadata: { grameee_role: "admin", role: "admin" }
  });
  const principal = await verifyAccessToken({ accessToken: token(), nowSeconds: now, ...deps });

  assert.equal(principal?.role, "user");
  assert.equal(principal?.email, "user@example.org");
  assert.equal(principal?.capabilities.includes("admin:api-keys"), false);
});

test("returns explicit least-privilege capabilities", () => {
  assert.deepEqual(capabilitiesFor("user", {}), ["contact:provider", "contact:sixm", "surface:askgre"]);
  assert.equal(capabilitiesFor("curator", {}).includes("phone:protected"), true);
  assert.equal(capabilitiesFor("admin", {}).includes("admin:console"), true);
  assert.equal(capabilitiesFor("admin", {}).includes("admin:uploads"), true);
  assert.deepEqual(capabilitiesFor("user", { grameee_privileges: { askGre: false, gre: false } }), []);
});
