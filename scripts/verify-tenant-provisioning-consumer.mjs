import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(
  join(tmpdir(), "opsrabbit-tenant-provisioning-consumer-"),
);
try {
  const raw = execFileSync(
    "pnpm",
    [
      "--dir",
      "packages/plugin-sdk",
      "pack",
      "--pack-destination",
      target,
      "--json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  const packed = JSON.parse(raw);
  await writeFile(
    join(target, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { "@opsrabbit/plugin-sdk": `file:${packed.filename}` },
    }),
  );
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: target, stdio: "inherit" },
  );
  await copyFile(
    join(root, "packages/plugin-sdk/reference/tenant-provisioning.mjs"),
    join(target, "reference.mjs"),
  );
  await writeFile(
    join(target, "verify.mjs"),
    `
import assert from "node:assert/strict";
import requestSchema from "@opsrabbit/plugin-sdk/tenant-provisioning-request-schema" with { type: "json" };
import resultSchema from "@opsrabbit/plugin-sdk/tenant-provisioning-result-schema" with { type: "json" };
import {
  TENANT_PROVISIONING_SCHEMA_VERSION,
  TENANT_PROVISIONING_FRONTEND_CAPABILITY,
  PLUGIN_FRONTEND_CAPABILITIES,
  validateManifest,
} from "@opsrabbit/plugin-sdk";
import { createTestTenantProvisioningService } from "@opsrabbit/plugin-sdk/testing";
import { createCustomer, createShowOnceCredential, loadProvisioningAccess, uploadLogo } from "./reference.mjs";
assert.equal(TENANT_PROVISIONING_SCHEMA_VERSION, "1");
assert.ok(PLUGIN_FRONTEND_CAPABILITIES.includes(TENANT_PROVISIONING_FRONTEND_CAPABILITY));
assert.ok(requestSchema.$defs.createCustomer);
assert.ok(resultSchema.$defs.createCustomer);
assert.deepEqual(await loadProvisioningAccess({}), { available: false, deploymentAdmin: false });
const fake = createTestTenantProvisioningService({ logo: true });
const context = { tenantProvisioning: fake.service };
assert.deepEqual(await loadProvisioningAccess(context), { available: true, deploymentAdmin: true });
const failingAuthority = (code) => ({ tenantProvisioning: { getAuthority: async () => { throw { code }; } } });
assert.deepEqual(await loadProvisioningAccess(failingAuthority("not_available")), { available: false, deploymentAdmin: false });
assert.deepEqual(await loadProvisioningAccess(failingAuthority("host_error")), { available: true, deploymentAdmin: false });
// A malformed authority answer, even one that looks truthy, never unlocks provisioning screens.
const oddAuthority = { tenantProvisioning: { getAuthority: async () => ({ deploymentAdmin: true, extra: 1 }) } };
assert.deepEqual(await loadProvisioningAccess(oddAuthority), { available: true, deploymentAdmin: false });
const credential = createShowOnceCredential();
const input = { requestId: "consumer-request-0001", tenant: { slug: "acme", displayName: "Acme" }, admin: { email: "owner@acme.test", displayName: "Owner" } };
const created = await createCustomer(context, input, credential);
assert.equal(created.ok, true);
assert.equal(created.outcome, "created");
// The reference returns the frozen copy that was checked, never the host's original object.
assert.ok(Object.isFrozen(created.tenant) && Object.isFrozen(created.admin));
const shown = credential.take();
assert.equal(typeof shown, "string");
assert.equal(credential.take(), null);
assert.ok(!fake.snapshot().includes(shown));
const replayed = await createCustomer(context, input, credential);
assert.equal(replayed.outcome, "replayed");
assert.equal(replayed.needsReset, true);
assert.equal(credential.pending, false);
const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
const logo = await uploadLogo(context, created.tenant.id, png);
assert.equal(logo.ok, true);
assert.equal((await uploadLogo(context, created.tenant.id, new Blob(["x"], { type: "image/gif" }))).code, "logo_invalid");
assert.equal((await uploadLogo(context, created.tenant.id, new Blob([await png.arrayBuffer()], { type: "" }))).ok, true);
const badLogoHost = { tenantProvisioning: { uploadLogo: async () => ({ url: "javascript:alert(1)" }) } };
assert.deepEqual(await uploadLogo(badLogoHost, created.tenant.id, png), { ok: false, code: "host_error" });
assert.ok(Object.isFrozen(logo.logo));
assert.deepEqual(await uploadLogo(context, created.tenant.id, undefined), { ok: false, code: "logo_invalid" });
// A reply whose fields are getters could answer differently after a check; it is rejected.
const shiftingHost = { tenantProvisioning: { createCustomer: async () => { const reply = await fake.service.createCustomer({ ...input, requestId: "consumer-request-0002", tenant: { slug: "shift", displayName: "Shift" }, admin: { email: "owner@shift.test", displayName: "Owner" } }); return { ...reply, get credential() { return reply.credential; } }; } } };
assert.equal((await createCustomer(shiftingHost, { ...input, requestId: "consumer-request-0002" }, credential)).checkTenantsAndReset, true);
// A password not yet shown for one customer is dropped before the next customer is created, so
// an existing-account result can never display it.
const pendingFake = createTestTenantProvisioningService({ existingAccounts: ["known@beta.test"] });
const pendingContext = { tenantProvisioning: pendingFake.service };
await createCustomer(pendingContext, { tenant: { slug: "alpha", displayName: "Alpha" }, admin: { email: "new@alpha.test", displayName: "New" } }, credential);
assert.equal(credential.pending, true);
const existing = await createCustomer(pendingContext, { tenant: { slug: "beta", displayName: "Beta" }, admin: { email: "known@beta.test", displayName: "Known" } }, credential);
assert.equal(existing.ok, true);
assert.equal(credential.pending, false);
let calls = 0;
const flaky = (error) => ({ tenantProvisioning: { createCustomer: async () => { calls += 1; throw error; } } });
assert.equal((await createCustomer(flaky(new TypeError("boom")), input, credential, 3, 1)).code, "host_error");
assert.equal(calls, 1);
calls = 0;
assert.equal((await createCustomer(flaky({ code: "host_error" }), input, credential, 3, 1)).code, "host_error");
assert.equal(calls, 3);
// Every response is lost after the host commits: the returned requestId lets the next submit
// of the same form come back as replayed instead of slug_taken.
const lossy = { tenantProvisioning: { createCustomer: async (request) => { await fake.service.createCustomer(request); throw { code: "host_error" }; } } };
const lostInput = { tenant: { slug: "lost-co", displayName: "Lost Co" }, admin: { email: "owner@lost.test", displayName: "Owner" } };
const lost = await createCustomer(lossy, lostInput, credential, 2, 1);
assert.equal(lost.ok, false);
assert.equal(typeof lost.requestId, "string");
const resubmitted = await createCustomer(context, { ...lostInput, requestId: lost.requestId }, credential);
assert.equal(resubmitted.outcome, "replayed");
assert.equal(resubmitted.requestId, lost.requestId);
assert.equal(credential.pending, false);
const manifest = validateManifest({
  id: "onboarding", name: "Onboarding", version: "1.0.0", description: "Onboarding", apiVersion: "1.0", main: "./dist/index.js", minimumOpsRabbitVersion: "0.12.0",
  navigation: { kind: "plugin_workspace", moduleKey: "customer_app", path: "/apps/customer_app", icon: "alert_triangle", fallbackTitle: "Customers" },
  frontend: { kind: "native_workspace", entry: "./dist/workspace.js", styles: [], assets: [], sdkVersion: "1", mountIsolation: "shadow_dom", capabilities: ["tenant.provisioning.manage"] },
  capabilities: { tenantProvisioning: { schemaVersion: "1", logo: true } },
});
assert.equal(manifest.ok, true, JSON.stringify(manifest.issues));
`,
  );
  execFileSync("node", ["verify.mjs"], { cwd: target, stdio: "inherit" });
  process.stdout.write(
    "Tenant provisioning reference verified against packed SDK outside workspace.\n",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}
