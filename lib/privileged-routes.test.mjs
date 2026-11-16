import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("mail routes authorize with verified principals and never summary cookies", async () => {
  const [providerRoute, sixmRoute] = await Promise.all([
    read("../app/api/provider-email/route.ts"),
    read("../app/api/sixm-email/route.ts")
  ]);

  for (const source of [providerRoute, sixmRoute]) {
    assert.match(source, /requireVerifiedPrincipal\(request,/);
    assert.doesNotMatch(source, /grameee_user_summary|getSharedUserSummary/);
    assert.match(source, /principal\.userId/);
    assert.match(source, /claimPrivilegedAction/);
  }
  assert.match(providerRoute, /loadCanonicalOffering/);
  assert.match(sixmRoute, /getOfferingDetail/);
  assert.match(sixmRoute, /To: \$\{principal\.email\}/);
});

test("protected phone pages use verified access-token principals", async () => {
  const sources = await Promise.all([
    read("../app/provider/page.tsx"),
    read("../app/offering/[id]/page.tsx"),
    read("../app/detail/[source]/[id]/page.tsx")
  ]);

  for (const source of sources) {
    assert.match(source, /getVerifiedPrincipalFromCredentials/);
    assert.match(source, /grameee_access_token/);
    assert.doesNotMatch(source, /grameee_user_summary|parseSharedUserSummaryCookie/);
  }
});

test("quota audit is atomic and inaccessible to browser roles", async () => {
  const migration = await read("../supabase/migrations/20261116105331_add_privileged_action_quota_audit.sql");
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /user_id uuid not null references auth\.users/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]+to service_role/);
});
