import { describe, expect, it } from "vitest";
import { validateManifest } from "../src/validation/manifest.js";

const valid = {
  id: "incident-tools",
  name: "Incident Tools",
  version: "1.2.3",
  description: "Incident response helpers.",
  apiVersion: "1.0",
  main: "./dist/index.js",
  publisher: { name: "Example", url: "https://example.com" },
  settings: [
    {
      key: "title",
      label: "Title",
      type: "string",
      default: "Incidents",
    },
    {
      key: "mode",
      label: "Mode",
      type: "select",
      options: ["safe"],
      default: "safe",
    },
  ],
  navigation: {
    kind: "forms_workspace",
    moduleKey: "incidents",
    path: "/apps/incidents",
    icon: "shield_check",
    fallbackTitle: "Incidents",
    titleSetting: "title",
    order: 20,
  },
  formStarterPack: {
    moduleKey: "incidents",
    path: "./forms/incidents.json",
  },
  capabilities: {
    tools: [
      {
        id: "status",
        risk: "read",
        audience: "all",
        requiredPermission: "read",
      },
    ],
    actions: [
      {
        id: "restart",
        risk: "destructive",
        requiredRole: "admin",
        deploymentAdminOnly: true,
      },
    ],
    scheduledJobs: [{ id: "snapshot" }],
    routes: [{ path: "/status", requiredRole: "viewer" }],
    widgets: [{ id: "summary" }],
    tenantRecords: { collections: ["notes"] },
  },
};

describe("validateManifest", () => {
  it("accepts a complete named capability manifest", () =>
    expect(validateManifest(valid)).toEqual({
      ok: true,
      value: valid,
      issues: [],
    }));
  it("rejects non-objects", () =>
    expect(validateManifest(null).issues).toContainEqual(
      expect.objectContaining({ path: "$", code: "type" }),
    ));
  it("rejects invalid identity, compatibility, entry, unknown fields, and empty capabilities", () => {
    const result = validateManifest({
      id: "Bad Name",
      name: "",
      version: "latest",
      description: "",
      apiVersion: "2.0",
      main: "./dist/../private.js",
      minimumOpsRabbitVersion: "next",
      unexpected: true,
      capabilities: {},
    });
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.id",
        "$.name",
        "$.version",
        "$.description",
        "$.apiVersion",
        "$.main",
        "$.minimumOpsRabbitVersion",
        "$.unexpected",
        "$.capabilities",
      ]),
    );
  });
  it("rejects malformed, duplicate, and invalid capability declarations", () => {
    const result = validateManifest({
      ...valid,
      capabilities: {
        tools: [
          { id: "status", risk: "root" },
          { id: "status", risk: "read" },
        ],
        actions: [
          {
            id: "restart",
            risk: "write",
            requiredRole: "owner",
            deploymentAdminOnly: "yes",
          },
        ],
        routes: [{ path: "/../secret", requiredRole: "viewer" }],
        tenantRecords: { collections: ["notes", "notes"] },
      },
    });
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["invalid", "duplicate", "type"]),
    );
  });
  it("validates publishers and setting safety", () => {
    const result = validateManifest({
      ...valid,
      publisher: { name: "", url: "file:///secret", extra: true },
      settings: [
        { key: "token", label: "Token", type: "secret", default: "bad" },
        { key: "token", label: "Token again", type: "select" },
      ],
    });
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "unknown-property",
        "invalid",
        "forbidden",
        "duplicate",
        "required",
      ]),
    );
  });
  it("rejects empty capability arrays and malformed sections", () => {
    expect(
      validateManifest({
        ...valid,
        capabilities: { tools: [], tenantRecords: { collections: [] } },
      }).issues,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "required" })]),
    );
    expect(validateManifest({ ...valid, capabilities: [] }).issues[0]).toEqual(
      expect.objectContaining({ path: "$.capabilities", code: "type" }),
    );
  });

  it("rejects malformed optional sections and unknown nested properties", () => {
    const result = validateManifest({
      ...valid,
      name: "n".repeat(101),
      publisher: "publisher",
      settings: "settings",
      capabilities: {
        tools: [{ id: "status", risk: "read", extra: true }],
        tenantRecords: "records",
      },
    });
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["too-long", "type", "unknown-property"]),
    );
  });

  it("rejects unsafe Forms navigation and invalid setting references", () => {
    const result = validateManifest({
      ...valid,
      navigation: {
        kind: "custom_bundle",
        moduleKey: "Bad Module",
        path: "/apps/../secret",
        icon: "script",
        fallbackTitle: "",
        titleSetting: "missing",
        iconSetting: "mode",
        order: "first",
        extra: true,
      },
    });
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.navigation.kind",
        "$.navigation.moduleKey",
        "$.navigation.path",
        "$.navigation.icon",
        "$.navigation.fallbackTitle",
        "$.navigation.titleSetting",
        "$.navigation.iconSetting",
        "$.navigation.order",
        "$.navigation.extra",
      ]),
    );
  });

  it("requires starter packs to use safe paths and the navigation module", () => {
    const unsafe = validateManifest({
      ...valid,
      formStarterPack: {
        moduleKey: "other",
        path: "./forms/../secret.json",
        extra: true,
      },
    });
    expect(unsafe.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.formStarterPack.moduleKey",
        "$.formStarterPack.path",
        "$.formStarterPack.extra",
      ]),
    );
    expect(
      validateManifest({
        ...valid,
        navigation: undefined,
        formStarterPack: {
          moduleKey: "incidents",
          path: "./forms/incidents.json",
        },
      }).issues,
    ).toContainEqual(
      expect.objectContaining({ path: "$.formStarterPack", code: "invalid" }),
    );
  });
});
