import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  PLUGIN_FRONTEND_CAPABILITIES,
  WORKSPACE_ACTOR_EMAIL_CAPABILITY,
  WORKSPACE_SESSION_END_CAPABILITY,
  WORKSPACE_SESSION_IDENTITY_MINIMUM_OPSRABBIT_VERSION,
  validateManifest,
  type OpsRabbitWorkspaceContext,
  type OpsRabbitWorkspaceSessionV1,
} from "../src/index.js";

async function manifestSchema() {
  return JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "../schemas/opsrabbit-plugin.schema.json"),
      "utf8",
    ),
  );
}

function sessionManifest(
  overrides: Record<string, unknown> = {},
  capabilities: string[] = ["actor.email.read", "session.end"],
): Record<string, unknown> {
  // A standalone workspace needs at least one host surface; a read action keeps the fixture minimal.
  return {
    id: "profile_app",
    name: "Profile",
    version: "1.0.0",
    description: "Signed-in profile",
    apiVersion: "1.0",
    main: "./dist/index.js",
    minimumOpsRabbitVersion: "0.13.0",
    navigation: {
      kind: "plugin_workspace",
      moduleKey: "profile_app",
      path: "/apps/profile_app",
      icon: "building",
      fallbackTitle: "Profile",
    },
    frontend: {
      kind: "native_workspace",
      entry: "./dist/frontend.js",
      styles: [],
      assets: [],
      sdkVersion: "1",
      mountIsolation: "shadow_dom",
      capabilities: ["plugin.actions.invoke", ...capabilities],
      actionIds: ["list_records"],
    },
    capabilities: {
      actions: [{ id: "list_records", risk: "read", requiredRole: "viewer" }],
    },
    ...overrides,
  };
}

function strip(manifest: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
}

const rejected: Array<{ name: string; manifest: Record<string, unknown> }> = [
  {
    name: "email on a host older than 0.13.0",
    manifest: sessionManifest({ minimumOpsRabbitVersion: "0.12.9" }, [
      "actor.email.read",
    ]),
  },
  {
    name: "sign-out on a host older than 0.13.0",
    manifest: sessionManifest({ minimumOpsRabbitVersion: "0.12.0" }, [
      "session.end",
    ]),
  },
  {
    name: "pre-release of 0.13.0",
    manifest: sessionManifest({ minimumOpsRabbitVersion: "0.13.0-rc.1" }),
  },
  {
    name: "missing minimum host version",
    manifest: sessionManifest({ minimumOpsRabbitVersion: undefined }),
  },
  {
    name: "misspelled sign-out capability",
    manifest: sessionManifest({}, ["session.signout"]),
  },
  {
    name: "duplicate capability",
    manifest: sessionManifest({}, ["session.end", "session.end"]),
  },
];

describe("workspace signed-in identity and sign-out capabilities", () => {
  it("publishes both frontend capabilities and the host gate", () => {
    expect(PLUGIN_FRONTEND_CAPABILITIES).toContain(
      WORKSPACE_ACTOR_EMAIL_CAPABILITY,
    );
    expect(PLUGIN_FRONTEND_CAPABILITIES).toContain(
      WORKSPACE_SESSION_END_CAPABILITY,
    );
    expect(WORKSPACE_ACTOR_EMAIL_CAPABILITY).toBe("actor.email.read");
    expect(WORKSPACE_SESSION_END_CAPABILITY).toBe("session.end");
    expect(WORKSPACE_SESSION_IDENTITY_MINIMUM_OPSRABBIT_VERSION).toBe("0.13.0");
  });

  it("accepts them on a standalone workspace from host 0.13.0", () => {
    const standalone = sessionManifest();
    expect(validateManifest(standalone)).toEqual({
      ok: true,
      value: standalone,
      issues: [],
    });
    expect(
      validateManifest(sessionManifest({ minimumOpsRabbitVersion: "1.0.0" }))
        .ok,
    ).toBe(true);
    expect(validateManifest(sessionManifest({}, ["session.end"])).ok).toBe(
      true,
    );
    expect(validateManifest(sessionManifest({}, ["actor.email.read"])).ok).toBe(
      true,
    );
  });

  it("rejects older hosts, unknown names and duplicates", () => {
    for (const { name, manifest } of rejected)
      expect(validateManifest(strip(manifest)).ok, name).toBe(false);
    expect(
      validateManifest(
        sessionManifest({ minimumOpsRabbitVersion: "0.12.0" }),
      ).issues.map((entry) => entry.message),
    ).toEqual([
      "actor.email.read requires minimumOpsRabbitVersion 0.13.0 or later.",
      "session.end requires minimumOpsRabbitVersion 0.13.0 or later.",
    ]);
  });

  it("leaves manifests without the capabilities unchanged", () => {
    const manifest = sessionManifest({ minimumOpsRabbitVersion: "0.8.0" }, []);
    expect(validateManifest(manifest).ok).toBe(true);
  });

  it("matches the published manifest JSON Schema", async () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      await manifestSchema(),
    );
    expect(validate(sessionManifest())).toBe(true);
    expect(validate(sessionManifest({}, ["session.end"]))).toBe(true);
    for (const { name, manifest } of rejected)
      expect(Boolean(validate(strip(manifest))), name).toBe(false);
  });

  it("types the context members as optional host-owned services", () => {
    expectTypeOf<OpsRabbitWorkspaceContext["actor"]["email"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<OpsRabbitWorkspaceContext["session"]>().toEqualTypeOf<
      OpsRabbitWorkspaceSessionV1 | undefined
    >();
    expectTypeOf<OpsRabbitWorkspaceSessionV1["signOut"]>().toEqualTypeOf<
      () => Promise<void>
    >();
  });
});
