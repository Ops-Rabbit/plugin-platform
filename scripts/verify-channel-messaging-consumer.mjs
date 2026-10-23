import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(
  join(tmpdir(), "opsrabbit-channel-messaging-consumer-"),
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
    join(root, "packages/plugin-sdk/reference/channel-messaging.mjs"),
    join(target, "reference.mjs"),
  );
  await copyFile(
    join(
      root,
      "packages/plugin-sdk/reference/channel-messaging-references.mjs",
    ),
    join(target, "references.mjs"),
  );
  await writeFile(
    join(target, "verify.mjs"),
    `
import assert from "node:assert/strict";
import { validateChannelMessagingInput, CHANNEL_MESSAGING_VERSION } from "@opsrabbit/plugin-sdk";
import { sendChannelMessage } from "./reference.mjs";
import { resolveChannelMessagingReference } from "./references.mjs";
import { createChannelMessagingReferencesHarness } from "@opsrabbit/plugin-sdk/testing";
import requestSchema from "@opsrabbit/plugin-sdk/channel-messaging-reference-request-schema" with { type: "json" };
import resultSchema from "@opsrabbit/plugin-sdk/channel-messaging-reference-result-schema" with { type: "json" };
assert.equal(requestSchema.oneOf.length, 2);
assert.equal(resultSchema.oneOf.length, 3);
const referenceRequest = {kind: "sent_message", channelId: "wa:chat", messageId: "ABC123"};
const originalMessage = {...referenceRequest, text: "First message"};
const references = createChannelMessagingReferencesHarness([originalMessage]);
assert.deepEqual(await resolveChannelMessagingReference({messagingReferences: references}, referenceRequest), originalMessage);
assert.equal(await references.resolve({...referenceRequest, messageId: "missing"}), null);
await assert.rejects(() => resolveChannelMessagingReference({}, referenceRequest), /unavailable/);
assert.equal(CHANNEL_MESSAGING_VERSION, "1");
const input = { instanceId: "slack-main", channelId: "C123", text: "hello" };
assert.deepEqual(validateChannelMessagingInput(input), []);
assert.ok(validateChannelMessagingInput({ ...input, token: "forbidden" }).length);
const receipt = await sendChannelMessage({ messaging: { schemaVersion: "1", sendMessage: async () => ({ channelId: "C123", messageId: "123.456" }) } }, input);
assert.equal(receipt.messageId, "123.456");
const followUp = { ...input, threadId: receipt.messageId };
assert.deepEqual(validateChannelMessagingInput(followUp), []);
await assert.rejects(() => sendChannelMessage({ messaging: { schemaVersion: "1", sendMessage: async () => { throw new Error("must not execute"); } } }, followUp), /Thread replies are unavailable/);
const reply = await sendChannelMessage({ messaging: { schemaVersion: "1", supportsThreadReplies: true, sendMessage: async (value) => { assert.equal(value.threadId, receipt.messageId); return { channelId: "C123", messageId: "124.456", threadId: value.threadId }; } } }, followUp);
assert.equal(reply.threadId, receipt.messageId);
await assert.rejects(() => sendChannelMessage({}, input));
`,
  );
  execFileSync("node", ["verify.mjs"], { cwd: target, stdio: "inherit" });
  await copyFile(
    join(root, "packages/plugin-sdk/reference/channel-messaging-consumer.ts"),
    join(target, "verify-types.ts"),
  );
  const typeArguments = [
    "--strict",
    "--noEmit",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "verify-types.ts",
  ];
  // Use the pinned compiler, but resolve all SDK imports from the isolated packed consumer.
  const compiler = join(root, "node_modules/typescript/bin/tsc");
  execFileSync("node", [compiler, ...typeArguments], {
    cwd: target,
    stdio: "inherit",
  });
  await writeFile(
    join(target, "invalid-types.ts"),
    `
import type { ChannelMessagingReferenceRequestV1 } from "@opsrabbit/plugin-sdk";
const request: ChannelMessagingReferenceRequestV1 = {kind: "sent_message", channelId: "wa:chat"};
void request;
`,
  );
  const negative = spawnSync(
    "node",
    [compiler, ...typeArguments.slice(0, -1), "invalid-types.ts"],
    { cwd: target, encoding: "utf8" },
  );
  if (
    negative.error ||
    negative.status !== 2 ||
    !negative.stdout.includes("messageId")
  )
    throw new Error(
      "Packed reference types must reject a sent-message request without messageId.",
    );

  const schema = JSON.parse(
    await readFile(
      join(
        target,
        "node_modules/@opsrabbit/plugin-sdk/schemas/opsrabbit-channel-messaging-input.schema.json",
      ),
      "utf8",
    ),
  );
  if (
    schema.properties.text.maxLength !== 4000 ||
    schema.additionalProperties !== false
  )
    throw new Error(
      "Packed messaging schema does not preserve bounded inputs.",
    );
  process.stdout.write(
    "Channel messaging reference verified against packed SDK outside workspace.\n",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}
