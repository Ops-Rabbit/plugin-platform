import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(join(tmpdir(), "opsrabbit-tool-update-consumer-"));
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
  await writeFile(
    join(target, "verify.mjs"),
    `
import assert from 'node:assert/strict';
import { definePlugin, toolResult, validatePluginToolUpdate } from '@opsrabbit/plugin-sdk';
import schema from '@opsrabbit/plugin-sdk/tool-update-schema' with { type: 'json' };
import { createTestContext } from '@opsrabbit/plugin-sdk/testing';
const tool = definePlugin({ tools: [{ id: 'inspect', description: 'Inspect', risk: 'read', async run(input, context, onUpdate) {
  onUpdate?.({ text: 'Checking ' + context.tenantId });
  return toolResult('Complete', { count: 2 });
} }] }).tools[0];
const updates = [];
const result = await tool.run({}, createTestContext({ tenantId: 'tenant-a' }), update => { validatePluginToolUpdate(update); updates.push(update); });
assert.deepEqual(updates, [{ text: 'Checking tenant-a' }]);
assert.deepEqual(result, await tool.run({}, createTestContext()));
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.text.maxLength, 4096);
assert.throws(() => validatePluginToolUpdate({ text: 'bad', tenantId: 'tenant-b' }), TypeError);
`,
  );
  execFileSync("node", ["verify.mjs"], { cwd: target, stdio: "inherit" });
  process.stdout.write(
    "Tool update contract verified against packed SDK outside workspace.\n",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}
