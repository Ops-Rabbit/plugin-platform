import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(
  join(tmpdir(), "opsrabbit-chat-turn-records-consumer-"),
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
    join(root, "packages/plugin-sdk/reference/chat-turn-records.mjs"),
    join(target, "reference.mjs"),
  );
  await writeFile(
    join(target, "verify.mjs"),
    `
import assert from "node:assert/strict";
import requestSchema from "@opsrabbit/plugin-sdk/chat-turn-records-request-schema" with { type: "json" };
import resultSchema from "@opsrabbit/plugin-sdk/chat-turn-records-result-schema" with { type: "json" };
import {
  CHAT_TURN_RECORDS_SCHEMA_VERSION,
  CHAT_TURN_RECORDS_MAX_TURN_IDS,
  CHAT_TURN_RECORDS_ERROR_STATUS,
  validateChatTurnRecordsRequest,
  validateChatTurnRecordsResult,
  validateManifest,
} from "@opsrabbit/plugin-sdk";
import { readChatTurnRecords } from "./reference.mjs";
assert.equal(CHAT_TURN_RECORDS_SCHEMA_VERSION, "1");
assert.equal(CHAT_TURN_RECORDS_MAX_TURN_IDS, 25);
assert.equal(CHAT_TURN_RECORDS_ERROR_STATUS.readLimitExceeded, 429);
assert.deepEqual(validateChatTurnRecordsRequest({ turnIds: ["turn-1"] }), []);
assert.ok(validateChatTurnRecordsRequest({ turnIds: [] }).length);
const turn = { turnId: "turn-1", threadId: "thread-1", userMessage: "Question", userMessageTruncated: false, feedback: null, feedbackUpdatedAt: null };
assert.deepEqual(validateChatTurnRecordsResult({ turns: [turn] }, { turnIds: ["turn-1"] }), []);
assert.ok(validateChatTurnRecordsResult({ turns: [turn], debug: true }, { turnIds: ["turn-1"] }).length);
assert.equal(requestSchema.additionalProperties, false);
assert.equal(resultSchema.properties.turns.items.additionalProperties, false);
const { records, unavailable } = await readChatTurnRecords({ chatTurnRecords: { getTurns: async () => ({ turns: [turn] }) } }, ["turn-1"]);
assert.equal(unavailable.size, 0);
assert.equal(records.get("turn-1").userMessage, "Question");
assert.deepEqual([...(await readChatTurnRecords({}, ["turn-1"])).unavailable], ["turn-1"]);
const manifest = validateManifest({
  id: "policy", name: "Policy", version: "1.0.0", description: "Policy", apiVersion: "1.0", main: "./dist/index.js", minimumOpsRabbitVersion: "0.11.0",
  database: { migrationsPath: "./migrations/sql" },
  localization: { schemaVersion: "1", defaultLocale: "en", supportedLocales: ["en"], path: "./locales/messages" },
  adminWorkspace: { schemaVersion: "1", titleKey: "p.title", icon: "receipt", tables: [{ id: "queries", titleKey: "p.queries", routePath: "/queries", rowIdKey: "event_id", columns: [{ key: "query", labelKey: "p.query", format: "text" }] }] },
  capabilities: {
    database: { mode: "plugin_schema" }, routes: [{ path: "/queries", requiredRole: "admin" }],
    chatTurnAdmission: { schemaVersion: "1", scope: "deployment" }, deploymentAdminWorkspace: { schemaVersion: "1" },
    identityDirectory: { read: true }, audit: { write: true }, localization: { schemaVersion: "1" },
    chatTurnRecords: { schemaVersion: "1", read: true },
  },
});
assert.equal(manifest.ok, true);
`,
  );
  execFileSync("node", ["verify.mjs"], { cwd: target, stdio: "inherit" });
  process.stdout.write(
    "Chat turn records reference verified against packed SDK outside workspace.\n",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}
