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
  requiredEntitlements: ["configured_forms", "vision_agent"],
  database: { migrationsPath: "./migrations/sql" },
  dataInsight: {
    catalogRoute: "/status",
    templatesRoute: "/insights-templates",
    workspace: {
      enabledSetting: "insights_enabled",
      placement: "tab",
      defaultTemplateId: "operations-overview",
      defaultTab: "records",
      allowUserDefault: true,
    },
  },
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
    { key: "stages", label: "Stages", type: "json", default: [] },
    { key: "prefix", label: "Prefix", type: "string", default: "INC" },
    { key: "digits", label: "Digits", type: "number", default: 8 },
    {
      key: "insights_enabled",
      label: "Insights enabled",
      type: "boolean",
      default: true,
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
    workflow: {
      rootStarterKey: "incident",
      stageModelSetting: "stages",
      recordNumber: { prefixSetting: "prefix", digitsSetting: "digits" },
    },
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
        formPlacement: {
          moduleKey: "incidents",
          recordType: "incident",
          intent: "danger",
        },
      },
    ],
    scheduledJobs: [{ id: "snapshot" }],
    routes: [
      { path: "/status", requiredRole: "viewer" },
      { path: "/insights-templates", requiredRole: "viewer" },
    ],
    ingressRoutes: [
      {
        path: "/events",
        methods: ["POST", "PUT"],
        auth: "api_token",
        requiredScopes: ["events.write"],
        maxRequestBytes: 65536,
      },
    ],
    widgets: [{ id: "summary" }],
    tenantRecords: { collections: ["notes"] },
    database: { mode: "plugin_schema" },
    objectStore: { read: true, write: true },
  },
};

describe("validateManifest", () => {
  it("accepts a complete named capability manifest", () =>
    expect(validateManifest(valid)).toEqual({
      ok: true,
      value: valid,
      issues: [],
    }));
  it("rejects empty, malformed, excessive, and duplicate entitlement declarations", () => {
    expect(
      validateManifest({ ...valid, requiredEntitlements: [] }).issues,
    ).toContainEqual(
      expect.objectContaining({ path: "$.requiredEntitlements" }),
    );
    const malformed = validateManifest({
      ...valid,
      requiredEntitlements: ["Vision-Agent", "vision_agent", "vision_agent"],
    });
    expect(malformed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.requiredEntitlements[0]" }),
        expect.objectContaining({
          path: "$.requiredEntitlements[2]",
          code: "duplicate",
        }),
      ]),
    );
    expect(
      validateManifest({
        ...valid,
        requiredEntitlements: Array.from(
          { length: 17 },
          (_, index) => `entitlement_${index}`,
        ),
      }).issues,
    ).toContainEqual(
      expect.objectContaining({ path: "$.requiredEntitlements" }),
    );
  });
  it("rejects unsafe ingress, unrequested migrations, and empty object-store access", () => {
    const result = validateManifest({
      ...valid,
      database: { migrationsPath: "../outside" },
      capabilities: {
        ...valid.capabilities,
        database: undefined,
        objectStore: { read: false, write: false },
        ingressRoutes: [
          {
            path: "/../events",
            methods: ["GET", "POST", "POST"],
            auth: "none",
            requiredScopes: [],
            maxRequestBytes: 2_000_000,
          },
        ],
      },
    });
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.database.migrationsPath",
        "$.database",
        "$.capabilities.objectStore",
        "$.capabilities.ingressRoutes[0].path",
        "$.capabilities.ingressRoutes[0].methods[0]",
        "$.capabilities.ingressRoutes[0].methods[2]",
        "$.capabilities.ingressRoutes[0].auth",
        "$.capabilities.ingressRoutes[0].requiredScopes",
        "$.capabilities.ingressRoutes[0].maxRequestBytes",
      ]),
    );
  });
  it("requires declared Data Insight routes and matching form-action modules", () => {
    const result = validateManifest({
      ...valid,
      dataInsight: { catalogRoute: "/missing" },
      capabilities: {
        ...valid.capabilities,
        actions: [
          {
            id: "restart",
            risk: "write",
            requiredRole: "operator",
            formPlacement: {
              moduleKey: "other",
              recordType: "incident",
              intent: "primary",
            },
          },
        ],
      },
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.dataInsight.catalogRoute" }),
        expect.objectContaining({
          path: "$.capabilities.actions[0].formPlacement.moduleKey",
        }),
      ]),
    );
  });
  it("validates Insights workspace settings and template routes", () => {
    const result = validateManifest({
      ...valid,
      dataInsight: {
        catalogRoute: "/status",
        templatesRoute: "/missing-templates",
        workspace: {
          enabledSetting: "title",
          placement: "panel",
          defaultTemplateId: "Bad Template",
          defaultTab: "dashboard",
          allowUserDefault: "yes",
        },
      },
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.dataInsight.templatesRoute" }),
        expect.objectContaining({
          path: "$.dataInsight.workspace.enabledSetting",
        }),
        expect.objectContaining({ path: "$.dataInsight.workspace.placement" }),
        expect.objectContaining({
          path: "$.dataInsight.workspace.defaultTemplateId",
        }),
        expect.objectContaining({ path: "$.dataInsight.workspace.defaultTab" }),
        expect.objectContaining({
          path: "$.dataInsight.workspace.allowUserDefault",
        }),
      ]),
    );
  });
  it("requires Data Insight routes to be viewer-readable", () => {
    const result = validateManifest({
      ...valid,
      capabilities: {
        ...valid.capabilities,
        routes: valid.capabilities.routes.map((route) => ({
          ...route,
          requiredRole: "operator",
        })),
      },
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.dataInsight.catalogRoute" }),
        expect.objectContaining({ path: "$.dataInsight.templatesRoute" }),
      ]),
    );
  });
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
  it("rejects malformed workflows and incompatible setting references", () => {
    const result = validateManifest({
      ...valid,
      navigation: {
        ...valid.navigation,
        workflow: {
          rootStarterKey: "Bad Key",
          stageModelSetting: "title",
          recordNumber: {
            prefixSetting: "digits",
            digitsSetting: "prefix",
            extra: true,
          },
        },
      },
    });
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.navigation.workflow.rootStarterKey",
        "$.navigation.workflow.stageModelSetting",
        "$.navigation.workflow.recordNumber.prefixSetting",
        "$.navigation.workflow.recordNumber.digitsSetting",
        "$.navigation.workflow.recordNumber.extra",
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
    expect(
      validateManifest({ ...valid, capabilities: [] }).issues,
    ).toContainEqual(
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
