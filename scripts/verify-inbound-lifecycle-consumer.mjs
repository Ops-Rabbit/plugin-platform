import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(
  join(tmpdir(), "opsrabbit-inbound-lifecycle-consumer-"),
);
try {
  const packed = JSON.parse(
    execFileSync(
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
    ),
  );
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
    join(root, "packages/plugin-sdk/reference/inbound-lifecycle.mjs"),
    join(target, "reference.mjs"),
  );
  await writeFile(
    join(target, "verify.mjs"),
    `
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { validateInboundLifecycleEvent, INBOUND_LIFECYCLE_SCHEMA_VERSION, INBOUND_LIFECYCLE_EVENT_SCHEMA } from "@opsrabbit/plugin-sdk";
import { deliverInboundLifecycleEvent } from "./reference.mjs";
const require = createRequire(import.meta.url);
const schema = JSON.parse(readFileSync(require.resolve("@opsrabbit/plugin-sdk/inbound-lifecycle-event-schema"), "utf8"));
assert.deepEqual(schema, INBOUND_LIFECYCLE_EVENT_SCHEMA);
assert.equal(INBOUND_LIFECYCLE_SCHEMA_VERSION, "1");
const event = { schemaVersion: "1", eventId: "event-1", tenantId: "tenant-a", inboundId: "inbound-1", sourceEventId: "source-1", sourceSystemId: "account-1", bindingRevision: 1, revision: 1, occurredAt: "2026-10-16T09:10:11.000Z", change: { type: "received", title: "Bounded source title" } };
assert.deepEqual(validateInboundLifecycleEvent(event), []);
assert.ok(validateInboundLifecycleEvent({ ...event, change: { type: "correlated", disposition: "joined" } }).length);
let delivered = 0;
const context = { tenantId: "tenant-a", signal: new AbortController().signal };
const definition = { schemaVersion: "1", handle: async (value, ctx) => { assert.equal(value.tenantId, ctx.tenantId); delivered += 1; } };
await deliverInboundLifecycleEvent(definition, event, context);
assert.equal(delivered, 1);
await assert.rejects(() => deliverInboundLifecycleEvent(definition, event, { ...context, tenantId: "tenant-b" }), /tenant mismatch/);
await assert.rejects(() => deliverInboundLifecycleEvent(definition, { ...event, raw: {} }, context), /Invalid Inbound/);
assert.equal(delivered, 1);
`,
  );
  execFileSync("node", ["verify.mjs"], { cwd: target, stdio: "inherit" });
  process.stdout.write(
    "Inbound lifecycle reference and schema exports verified against packed SDK outside workspace.\n",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}
