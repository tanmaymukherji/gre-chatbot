import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decideAdminAuthorization } from "./admin-authorization-core.mjs";

const adminPrincipal = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "admin@example.org",
  role: "admin",
  sessionId: "22222222-2222-4222-8222-222222222222",
  capabilities: ["admin:console", "admin:api-keys", "admin:cache", "admin:imports", "admin:showcase", "admin:templates", "admin:uploads"]
};

test("missing identity is unauthorized", () => {
  assert.deepEqual(
    decideAdminAuthorization({ principal: null, legacySession: null, requiredCapability: "admin:cache" }),
    { ok: false, status: 401 }
  );
});

test("ordinary verified identity is forbidden", () => {
  const principal = { ...adminPrincipal, role: "user", capabilities: ["surface:askgre"] };
  assert.deepEqual(
    decideAdminAuthorization({ principal, legacySession: null, requiredCapability: "admin:cache" }),
    { ok: false, status: 403 }
  );
});

test("verified administrator receives only declared capabilities", () => {
  const allowed = decideAdminAuthorization({
    principal: adminPrincipal,
    legacySession: null,
    requiredCapability: "admin:api-keys"
  });
  const denied = decideAdminAuthorization({
    principal: { ...adminPrincipal, capabilities: ["admin:console"] },
    legacySession: null,
    requiredCapability: "admin:api-keys"
  });

  assert.equal(allowed.ok, true);
  assert.equal(allowed.session.source, "grameee");
  assert.deepEqual(denied, { ok: false, status: 403 });
});

test("server-side legacy admin session remains a staged compatibility path", () => {
  const decision = decideAdminAuthorization({
    principal: null,
    legacySession: { username: "admin" },
    requiredCapability: "admin:showcase"
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.session.source, "legacy");
});

test("every privileged admin route declares its least-privilege capability", async () => {
  const expected = new Map([
    ["app/api/admin/api-keys/route.ts", "admin:api-keys"],
    ["app/api/gre-admin/cache/route.ts", "admin:cache"],
    ["app/api/gre-admin/import/route.ts", "admin:imports"],
    ["app/api/gre-admin/provider-email-template/route.ts", "admin:templates"],
    ["app/api/gre-admin/session/route.ts", "admin:console"],
    ["app/api/gre-admin/showcase/route.ts", "admin:showcase"],
    ["app/api/gre-admin/sixm-email-template/route.ts", "admin:templates"],
    ["app/api/gre-admin/upload-image/route.ts", "admin:uploads"]
  ]);

  for (const [path, capability] of expected) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, new RegExp(`requireAdminUser\\(request, ["']${capability}["']\\)`), path);
  }
});

test("summary cookie is absent from server-side admin authorization", async () => {
  const source = await readFile(new URL("./auth.ts", import.meta.url), "utf8");
  const adminSection = source.slice(source.indexOf("export async function requireAdminUser"));
  assert.doesNotMatch(adminSection, /grameee_user_summary|getSharedUserSummary|role\s*===\s*["']admin/);
});
