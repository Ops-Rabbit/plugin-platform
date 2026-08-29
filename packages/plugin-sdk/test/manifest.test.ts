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
    knowledge: { write: true },
  },
};

function minimalInteractionManifest() {
  return {
    id: "policy",
    name: "Policy",
    version: "1.0.0",
    description: "Policy",
    apiVersion: "1.0",
    main: "./dist/index.js",
    database: { migrationsPath: "./migrations/sql" },
    localization: {
      schemaVersion: "1",
      defaultLocale: "en",
      supportedLocales: ["en"],
      path: "./locales/messages",
    },
    adminWorkspace: {
      schemaVersion: "1",
      titleKey: "policy.title",
      icon: "receipt",
      order: 1,
      navigation: { schemaVersion: "1" },
      tables: [
        {
          id: "accounts",
          titleKey: "policy.accounts",
          routePath: "/accounts",
          rowIdKey: "subject_id",
          columns: [
            { key: "balance", labelKey: "policy.balance", format: "decimal" },
          ],
          rowActions: [
            {
              id: "adjust",
              actionId: "adjust",
              labelKey: "policy.adjust",
              intent: "primary",
              fields: [
                {
                  key: "amount",
                  labelKey: "policy.amount",
                  type: "integer",
                  required: true,
                  minimum: -10,
                  maximum: 10,
                },
              ],
            },
          ],
        },
      ],
    },
    capabilities: {
      database: { mode: "plugin_schema" },
      routes: [{ path: "/accounts", requiredRole: "admin" }],
      actions: [
        {
          id: "adjust",
          risk: "write",
          requiredRole: "admin",
          deploymentAdminOnly: true,
        },
      ],
      chatTurnAdmission: { schemaVersion: "1", scope: "deployment" },
      chatComposerStatus: { schemaVersion: "1" },
      deploymentAdminWorkspace: { schemaVersion: "1" },
      identityDirectory: { read: true },
      audit: { write: true },
      subjectLifecycle: { schemaVersion: "1", userDeletion: true },
      localization: { schemaVersion: "1" },
    },
  };
}

type MutableObject = Record<string, unknown>;
function child(value: unknown, key: string): MutableObject {
  return (value as MutableObject)[key] as MutableObject;
}
function first(value: unknown, key: string): MutableObject {
  return ((value as MutableObject)[key] as unknown[])[0] as MutableObject;
}

describe("validateManifest", () => {
  it("accepts a deployment interaction policy surface", () => {
    const manifest = {
      ...valid,
      localization: {
        schemaVersion: "1",
        defaultLocale: "en",
        supportedLocales: ["en", "de"],
        path: "./locales/messages",
      },
      adminWorkspace: {
        schemaVersion: "1",
        titleKey: "points.admin.title",
        icon: "receipt",
        tables: [
          {
            id: "accounts",
            titleKey: "points.admin.accounts",
            routePath: "/accounts",
            rowIdKey: "subject_id",
            columns: [
              { key: "balance", labelKey: "points.balance", format: "decimal" },
            ],
            rowActions: [
              {
                id: "adjust",
                actionId: "adjust-points",
                labelKey: "points.adjust",
                intent: "primary",
              },
            ],
          },
        ],
      },
      capabilities: {
        database: { mode: "plugin_schema" },
        routes: [
          { path: "/status", requiredRole: "viewer" },
          { path: "/insights-templates", requiredRole: "viewer" },
          { path: "/accounts", requiredRole: "admin" },
        ],
        actions: [
          {
            id: "adjust-points",
            risk: "write",
            requiredRole: "admin",
            deploymentAdminOnly: true,
          },
        ],
        chatTurnAdmission: { schemaVersion: "1", scope: "deployment" },
        chatComposerStatus: { schemaVersion: "1" },
        deploymentAdminWorkspace: { schemaVersion: "1" },
        identityDirectory: { read: true },
        audit: { write: true },
        subjectLifecycle: {
          schemaVersion: "1",
          userDeletion: true,
          tenantAttributionRemoval: true,
        },
        localization: { schemaVersion: "1" },
      },
    };
    expect(validateManifest(manifest)).toEqual({
      ok: true,
      value: manifest,
      issues: [],
    });
  });

  it("rejects interaction surfaces that escape their declared boundaries", () => {
    const manifest = {
      ...valid,
      adminWorkspace: {
        schemaVersion: "1",
        titleKey: "points.admin.title",
        icon: "receipt",
        tables: [
          {
            id: "accounts",
            titleKey: "points.accounts",
            routePath: "/accounts",
            rowIdKey: "subject_id",
            columns: [
              { key: "balance", labelKey: "points.balance", format: "decimal" },
            ],
            rowActions: [
              {
                id: "adjust",
                actionId: "adjust",
                labelKey: "points.adjust",
                intent: "primary",
              },
            ],
          },
        ],
      },
      capabilities: {
        deploymentAdminWorkspace: { schemaVersion: "1" },
        routes: [{ path: "/accounts", requiredRole: "viewer" }],
        actions: [{ id: "adjust", risk: "write", requiredRole: "operator" }],
      },
    };
    expect(validateManifest(manifest).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "$.adminWorkspace.tables[0].routePath",
        }),
        expect.objectContaining({
          path: "$.adminWorkspace.tables[0].rowActions[0].actionId",
        }),
      ]),
    );
  });
  it("rejects malformed interaction policy metadata", () => {
    const mutations: Array<(manifest: MutableObject) => void> = [
      (m) => {
        delete m.localization;
      },
      (m) => {
        const localization = child(m, "localization");
        localization.schemaVersion = "2";
        localization.defaultLocale = "EN";
        localization.supportedLocales = [];
        localization.path = "../messages";
      },
      (m) => {
        child(m, "localization").defaultLocale = "de";
      },
      (m) => {
        delete m.adminWorkspace;
      },
      (m) => {
        m.adminWorkspace = "invalid";
      },
      (m) => {
        const workspace = child(m, "adminWorkspace");
        workspace.schemaVersion = "2";
        workspace.order = 1.5;
        workspace.tables = [];
      },
      (m) => {
        child(child(m, "adminWorkspace"), "navigation").schemaVersion = "2";
      },
      (m) => {
        child(m, "adminWorkspace").navigation = {
          schemaVersion: "1",
          path: "/unsafe",
        };
      },
      (m) => {
        child(m, "adminWorkspace").tables = [null];
      },
      (m) => {
        const table = first(child(m, "adminWorkspace"), "tables");
        table.columns = [];
        table.rowActions = [null];
      },
      (m) => {
        const table = first(child(m, "adminWorkspace"), "tables");
        table.columns = [
          null,
          { key: "balance", labelKey: "bad key", format: "money" },
          { key: "balance", labelKey: "policy.balance", format: "decimal" },
        ];
      },
      (m) => {
        const table = first(child(m, "adminWorkspace"), "tables");
        const action = first(table, "rowActions");
        action.id = "Bad";
        action.intent = "unknown";
        action.fields = "invalid";
      },
      (m) => {
        const table = first(child(m, "adminWorkspace"), "tables");
        const action = first(table, "rowActions");
        const field = first(action, "fields");
        field.key = "Bad";
        field.labelKey = "bad key";
        field.type = "select";
        field.required = "yes";
        field.minimum = 1.5;
        field.options = [];
      },
      (m) => {
        const table = first(child(m, "adminWorkspace"), "tables");
        const action = first(table, "rowActions");
        const field = first(action, "fields");
        field.type = "select";
        field.minimum = 10;
        field.maximum = 1;
        field.options = [
          null,
          { value: "same", labelKey: "bad key" },
          { value: "same", labelKey: "policy.same", extra: true },
        ];
      },
      (m) => {
        const table = first(child(m, "adminWorkspace"), "tables");
        const action = first(table, "rowActions");
        const field = first(action, "fields");
        field.options = [
          { value: "unexpected", labelKey: "policy.unexpected" },
        ];
      },
      (m) => {
        const capabilities = child(m, "capabilities");
        child(capabilities, "chatTurnAdmission").schemaVersion = "2";
        child(capabilities, "chatTurnAdmission").scope = "tenant";
        child(capabilities, "identityDirectory").read = false;
        child(capabilities, "audit").write = false;
        child(capabilities, "subjectLifecycle").userDeletion = false;
        child(capabilities, "subjectLifecycle").tenantAttributionRemoval =
          "yes";
      },
      (m) => {
        delete child(m, "capabilities").database;
      },
      (m) => {
        delete child(m, "capabilities").audit;
      },
      (m) => {
        delete child(m, "capabilities").localization;
      },
      (m) => {
        delete child(m, "capabilities").identityDirectory;
      },
    ];
    for (const mutate of mutations) {
      const manifest = structuredClone(
        minimalInteractionManifest(),
      ) as MutableObject;
      mutate(manifest);
      expect(validateManifest(manifest).ok).toBe(false);
    }
  });
  it("accepts a complete named capability manifest", () =>
    expect(validateManifest(valid)).toEqual({
      ok: true,
      value: valid,
      issues: [],
    }));
  it("accepts a bounded native Forms workspace declaration", () => {
    const manifest = {
      ...valid,
      frontend: {
        kind: "native_workspace",
        entry: "./dist/frontend.js",
        styles: ["./dist/frontend.css"],
        assets: ["./dist/assets/**"],
        sdkVersion: "1",
        mountIsolation: "shadow_dom",
        capabilities: [
          "forms.catalog.read",
          "forms.submissions.read",
          "forms.submissions.write",
          "plugin.actions.invoke",
        ],
        actionIds: ["restart"],
      },
    };
    expect(validateManifest(manifest)).toEqual({
      ok: true,
      value: manifest,
      issues: [],
    });
  });

  it("requires a declared action when a native workspace requests action invocation", () => {
    const manifest = structuredClone(valid) as unknown as {
      capabilities: Record<string, unknown>;
      frontend?: unknown;
    };
    delete manifest.capabilities.actions;
    manifest.frontend = {
      kind: "native_workspace",
      entry: "./dist/frontend.js",
      styles: [],
      assets: [],
      sdkVersion: "1",
      mountIsolation: "shadow_dom",
      capabilities: ["plugin.actions.invoke"],
      actionIds: ["missing"],
    };
    expect(validateManifest(manifest).issues).toContainEqual(
      expect.objectContaining({
        path: "$.frontend.capabilities",
        code: "invalid",
      }),
    );
  });

  it("requires every frontend action id to reference a declared action", () => {
    const manifest = structuredClone(valid) as unknown as {
      frontend?: unknown;
    };
    manifest.frontend = {
      kind: "native_workspace",
      entry: "./dist/frontend.js",
      styles: [],
      assets: [],
      sdkVersion: "1",
      mountIsolation: "shadow_dom",
      capabilities: ["plugin.actions.invoke"],
      actionIds: ["missing"],
    };
    expect(validateManifest(manifest).issues).toContainEqual(
      expect.objectContaining({
        path: "$.frontend.actionIds[0]",
        code: "invalid",
      }),
    );
  });

  it("rejects frontend action ids without the invocation capability", () => {
    const manifest = structuredClone(valid) as unknown as {
      frontend?: unknown;
    };
    manifest.frontend = {
      kind: "native_workspace",
      entry: "./dist/frontend.js",
      styles: [],
      assets: [],
      sdkVersion: "1",
      mountIsolation: "shadow_dom",
      capabilities: ["forms.catalog.read"],
      actionIds: ["restart"],
    };
    expect(validateManifest(manifest).issues).toContainEqual(
      expect.objectContaining({
        path: "$.frontend.actionIds",
        code: "invalid",
      }),
    );
  });

  it("rejects unsafe, incompatible, duplicate, and unowned native workspaces", () => {
    const result = validateManifest({
      ...valid,
      navigation: undefined,
      frontend: {
        kind: "remote_workspace",
        entry: "https://cdn.example/frontend.js",
        styles: ["./dist/../shell.css", "./dist/../shell.css"],
        assets: ["./dist/assets/*"],
        sdkVersion: "2",
        mountIsolation: "iframe",
        capabilities: ["forms.catalog.read", "host.internal"],
      },
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.frontend.kind" }),
        expect.objectContaining({ path: "$.frontend.entry" }),
        expect.objectContaining({
          path: "$.frontend.styles[1]",
          code: "duplicate",
        }),
        expect.objectContaining({ path: "$.frontend.assets[0]" }),
        expect.objectContaining({ path: "$.frontend.sdkVersion" }),
        expect.objectContaining({ path: "$.frontend.mountIsolation" }),
        expect.objectContaining({ path: "$.frontend.capabilities[1]" }),
        expect.objectContaining({ path: "$.frontend", code: "invalid" }),
      ]),
    );
  });
  it("requires native workspaces to own a matching Forms starter pack", () => {
    const result = validateManifest({
      ...valid,
      formStarterPack: undefined,
      frontend: {
        kind: "native_workspace",
        entry: "./dist/frontend.js",
        styles: [],
        assets: [],
        sdkVersion: "1",
        mountIsolation: "shadow_dom",
        capabilities: [],
      },
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "$.frontend", code: "invalid" }),
    );
  });
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
  it("requires explicit Knowledge write access", () => {
    const result = validateManifest({
      ...valid,
      capabilities: { ...valid.capabilities, knowledge: { write: false } },
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "$.capabilities.knowledge.write" }),
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
  it("accepts separate-menu Insights workspaces without tab preferences", () => {
    expect(
      validateManifest({
        ...valid,
        dataInsight: {
          catalogRoute: "/status",
          templatesRoute: "/insights-templates",
          workspace: {
            placement: "menu",
            defaultTemplateId: "quality-overview",
          },
        },
      }).issues,
    ).toEqual([]);
  });
  it("rejects tab defaults for separate-menu Insights workspaces", () => {
    const result = validateManifest({
      ...valid,
      dataInsight: {
        catalogRoute: "/status",
        templatesRoute: "/insights-templates",
        workspace: {
          placement: "menu",
          defaultTemplateId: "quality-overview",
          defaultTab: "insights",
          allowUserDefault: true,
        },
      },
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: "$.dataInsight.workspace.defaultTab",
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: "$.dataInsight.workspace.allowUserDefault",
      }),
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

  it.each([
    "activity",
    "alert_triangle",
    "bar_chart",
    "book_open",
    "building",
    "check",
    "headset",
    "mail",
    "message_square",
    "receipt",
    "search",
    "shield_check",
    "variable",
    "waves",
  ])("accepts the plugin-selected navigation icon %s", (icon) => {
    expect(
      validateManifest({
        ...valid,
        navigation: { ...valid.navigation, icon },
      }),
    ).toMatchObject({ ok: true, issues: [] });
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
