import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(
  join(tmpdir(), "opsrabbit-workspace-session-identity-consumer-"),
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
    join(root, "packages/plugin-sdk/reference/workspace-session-identity.mjs"),
    join(target, "reference.mjs"),
  );
  await writeFile(
    join(target, "verify.mjs"),
    `
import assert from "node:assert/strict";
import {
  PLUGIN_FRONTEND_CAPABILITIES,
  WORKSPACE_ACTOR_EMAIL_CAPABILITY,
  WORKSPACE_SESSION_END_CAPABILITY,
  WORKSPACE_SESSION_IDENTITY_MINIMUM_OPSRABBIT_VERSION,
  validateManifest,
} from "@opsrabbit/plugin-sdk";
import { profileView, signOutWithConfirmation } from "./reference.mjs";

assert.ok(PLUGIN_FRONTEND_CAPABILITIES.includes(WORKSPACE_ACTOR_EMAIL_CAPABILITY));
assert.ok(PLUGIN_FRONTEND_CAPABILITIES.includes(WORKSPACE_SESSION_END_CAPABILITY));
const manifest = (minimumOpsRabbitVersion) => ({
  id: "profile_app", name: "Profile", version: "1.0.0", description: "Profile", apiVersion: "1.0",
  main: "./dist/index.js", minimumOpsRabbitVersion,
  navigation: { kind: "plugin_workspace", moduleKey: "profile_app", path: "/apps/profile_app", icon: "building", fallbackTitle: "Profile" },
  frontend: { kind: "native_workspace", entry: "./dist/frontend.js", styles: [], assets: [], sdkVersion: "1", mountIsolation: "shadow_dom",
    capabilities: ["plugin.actions.invoke", WORKSPACE_ACTOR_EMAIL_CAPABILITY, WORKSPACE_SESSION_END_CAPABILITY], actionIds: ["list_records"] },
  capabilities: { actions: [{ id: "list_records", risk: "read", requiredRole: "viewer" }] },
});
assert.equal(validateManifest(manifest(WORKSPACE_SESSION_IDENTITY_MINIMUM_OPSRABBIT_VERSION)).ok, true);
assert.equal(validateManifest(manifest("0.12.0")).ok, false);

let signedOut = 0;
const context = {
  actor: { id: "user-1", displayName: "Asha Rao", email: "asha@example.test", role: "viewer", access: {} },
  confirmation: { confirm: async () => true },
  session: { signOut: async () => { signedOut += 1; } },
};
assert.deepEqual(profileView(context), { name: "Asha Rao", email: "asha@example.test", canSignOut: true });
assert.equal(await signOutWithConfirmation(context, "Sign out?"), "signing-out");
assert.equal(signedOut, 1);
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
    "--lib",
    "ES2022,DOM",
  ];
  // Use the pinned compiler, but resolve all SDK imports from the isolated packed consumer.
  const compiler = join(root, "node_modules/typescript/bin/tsc");
  await writeFile(
    join(target, "verify-types.ts"),
    `
import type { OpsRabbitWorkspaceContext, OpsRabbitWorkspaceSessionV1 } from "@opsrabbit/plugin-sdk";
export function label(context: OpsRabbitWorkspaceContext): string {
  const email: string | undefined = context.actor.email;
  return email === undefined ? context.actor.displayName : context.actor.displayName + " <" + email + ">";
}
export async function end(context: OpsRabbitWorkspaceContext): Promise<void> {
  const session: OpsRabbitWorkspaceSessionV1 | undefined = context.session;
  if (session) await session.signOut();
}
`,
  );
  execFileSync("node", [compiler, ...typeArguments, "verify-types.ts"], {
    cwd: target,
    stdio: "inherit",
  });
  await writeFile(
    join(target, "invalid-types.ts"),
    `
import type { OpsRabbitWorkspaceContext } from "@opsrabbit/plugin-sdk";
export async function end(context: OpsRabbitWorkspaceContext): Promise<void> {
  await context.session.signOut();
}
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
    // Line 4 of invalid-types.ts uses the optional session without a check.
    !negative.stdout.includes("invalid-types.ts(4,") ||
    !negative.stdout.includes("TS18048")
  )
    throw new Error(
      "Packed SDK types must keep OpsRabbitWorkspaceContext.session optional.",
    );
  process.stdout.write(
    "Workspace session identity reference verified against packed SDK outside workspace.\n",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}
