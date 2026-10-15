import { execFileSync } from "node:child_process";
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
  await writeFile(
    join(target, "verify.mjs"),
    `
import assert from "node:assert/strict";
import { validateChannelMessagingInput, CHANNEL_MESSAGING_VERSION } from "@opsrabbit/plugin-sdk";
import { sendChannelMessage } from "./reference.mjs";
assert.equal(CHANNEL_MESSAGING_VERSION, "1");
const input = { instanceId: "slack-main", channelId: "C123", text: "hello" };
assert.deepEqual(validateChannelMessagingInput(input), []);
assert.ok(validateChannelMessagingInput({ ...input, token: "forbidden" }).length);
const receipt = await sendChannelMessage({ messaging: { schemaVersion: "1", sendMessage: async () => ({ channelId: "C123", messageId: "123.456" }) } }, input);
assert.equal(receipt.messageId, "123.456");
await assert.rejects(() => sendChannelMessage({}, input));
`,
  );
  execFileSync("node", ["verify.mjs"], { cwd: target, stdio: "inherit" });
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
