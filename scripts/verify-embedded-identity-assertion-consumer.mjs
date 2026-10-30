import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(
  join(tmpdir(), "opsrabbit-embedded-identity-assertion-consumer-"),
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
    join(root, "packages/plugin-sdk/reference/embedded-identity-assertion.mjs"),
    join(target, "reference.mjs"),
  );
  await writeFile(
    join(target, "verify.mjs"),
    `
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createAuthorizedTestContext, createTestContext } from "@opsrabbit/plugin-sdk/testing";
import { callDownstreamApi, verifyEmbeddedIdentityAssertionV1 } from "./reference.mjs";

const issuer = "https://ops.example.test/widget/chat/identity/tenants/tenant-1";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "key-1", alg: "ES256", use: "sig" }] };
const now = Math.floor(Date.now() / 1000);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const input = encode({ alg: "ES256", typ: "JWT", kid: "key-1" }) + "." + encode({
  iss: issuer, aud: "https://api.example.test", sub: "user-1", external_user_id: "user-1",
  widget_client_id: "widget-1", tenant_id: "tenant-1", plugin_id: "example-plugin", tool_id: "lookup",
  iat: now, nbf: now, exp: now + 60, jti: randomUUID(),
});
const token = input + "." + sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");

const context = createTestContext({ embeddedChat: { widgetId: "widget-1", externalUserId: "user-1", identityAssertion: token } });
assert.equal(context.embeddedChat.identityAssertion, token);
assert.ok(Object.isFrozen(context.embeddedChat));
assert.throws(() => createTestContext({ embeddedChat: { widgetId: "widget-1", externalUserId: "user-1", identityAssertion: "" } }), /compact JWS/);
assert.equal(createTestContext().embeddedChat, undefined);
const manifest = { id: "example-plugin", capabilities: { actions: [{ id: "lookup", risk: "read", requiredRole: "viewer" }] } };
assert.deepEqual(createAuthorizedTestContext(manifest, { kind: "action", id: "lookup" }, { embeddedChat: context.embeddedChat }).embeddedChat, { widgetId: "widget-1", externalUserId: "user-1" });

let forwarded;
await callDownstreamApi(context, {
  url: "https://api.example.test/lookup",
  headerName: "x-agent-user-token",
  body: {},
  fetch: async (_url, init) => { forwarded = init.headers["x-agent-user-token"]; return { ok: true, status: 200, json: async () => ({}) }; },
});
assert.equal(forwarded, token);
const claims = verifyEmbeddedIdentityAssertionV1(forwarded, {
  jwks, issuer, audience: "https://api.example.test", pluginId: "example-plugin", widgetId: "widget-1", externalUserId: "user-1",
});
assert.equal(claims.external_user_id, "user-1");
assert.throws(() => verifyEmbeddedIdentityAssertionV1(forwarded, {
  jwks, issuer, audience: "https://api.example.test", pluginId: "other-plugin", widgetId: "widget-1", externalUserId: "user-1",
}), (error) => error.code === "plugin");
`,
  );
  execFileSync("node", ["verify.mjs"], { cwd: target, stdio: "inherit" });

  const typeArguments = [
    "--strict",
    "--exactOptionalPropertyTypes",
    "--noEmit",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
  ];
  // Use the pinned compiler, but resolve all SDK imports from the isolated packed consumer.
  const compiler = join(root, "node_modules/typescript/bin/tsc");
  await writeFile(
    join(target, "verify-types.ts"),
    `
import type { PluginInvocationContext } from "@opsrabbit/plugin-sdk";
import { createTestContext, type TestEmbeddedChatOptions } from "@opsrabbit/plugin-sdk/testing";
export function assertionHeader(context: PluginInvocationContext): Record<string, string> {
  const assertion: string | undefined = context.embeddedChat?.identityAssertion;
  return assertion === undefined ? {} : { "x-agent-user-token": assertion };
}
const options: TestEmbeddedChatOptions = { widgetId: "widget-1", externalUserId: "user-1", identityAssertion: "a.b.c" };
const withoutAssertion: TestEmbeddedChatOptions = { widgetId: "widget-1", externalUserId: "user-1" };
void assertionHeader(createTestContext({ embeddedChat: options }));
void assertionHeader(createTestContext({ embeddedChat: withoutAssertion }));
`,
  );
  execFileSync("node", [compiler, ...typeArguments, "verify-types.ts"], {
    cwd: target,
    stdio: "inherit",
  });
  await writeFile(
    join(target, "invalid-types.ts"),
    `
import type { PluginInvocationContext } from "@opsrabbit/plugin-sdk";
const embeddedChat: PluginInvocationContext["embeddedChat"] = {
  widgetId: "widget-1",
  externalUserId: "user-1",
  identityAssertion: 42,
};
void embeddedChat;
`,
  );
  const negative = spawnSync(
    "node",
    [compiler, ...typeArguments, "invalid-types.ts"],
    { cwd: target, encoding: "utf8" },
  );
  if (
    negative.error ||
    negative.status !== 2 ||
    // Line 6 of invalid-types.ts is the identityAssertion property.
    !negative.stdout.includes("invalid-types.ts(6,") ||
    !negative.stdout.includes("TS2322")
  )
    throw new Error(
      "Packed SDK types must reject a non-string embeddedChat.identityAssertion.",
    );
  process.stdout.write(
    "Embedded identity assertion reference verified against packed SDK outside workspace.\n",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}
