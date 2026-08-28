import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { validateManifest } from "../src/validation/manifest.js";

const valid = {
  id: "schema-example",
  name: "Schema Example",
  version: "1.0.0",
  description: "Schema parity fixture.",
  apiVersion: "1.0",
  main: "./dist/index.js",
  capabilities: {
    tools: [
      {
        id: "status",
        risk: "read",
        audience: "all",
        requiredPermission: "read",
      },
    ],
    tenantRecords: { collections: ["records"] },
    ingressRoutes: [
      {
        path: "/events",
        methods: ["POST"],
        auth: "api_token",
        requiredScopes: ["events.write"],
        maxRequestBytes: 4096,
      },
    ],
    database: { mode: "plugin_schema" },
    objectStore: { write: true },
    knowledge: { write: true },
  },
  database: { migrationsPath: "./migrations/sql" },
};

describe("published manifest schema", () => {
  it("compiles and agrees with runtime validation for supported and rejected manifests", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, "../schemas/opsrabbit-plugin.schema.json"),
        "utf8",
      ),
    );
    const validateSchema = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(schema);
    expect(validateSchema(valid)).toBe(true);
    expect(validateManifest(valid).ok).toBe(true);
    const interaction = {
      ...valid,
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
                    minimum: -1,
                    maximum: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
      capabilities: {
        database: { mode: "plugin_schema" },
        audit: { write: true },
        identityDirectory: { read: true },
        localization: { schemaVersion: "1" },
        chatTurnAdmission: { schemaVersion: "1", scope: "deployment" },
        chatComposerStatus: { schemaVersion: "1" },
        deploymentAdminWorkspace: { schemaVersion: "1" },
        subjectLifecycle: { schemaVersion: "1", userDeletion: true },
        routes: [{ path: "/accounts", requiredRole: "admin" }],
        actions: [
          {
            id: "adjust",
            risk: "write",
            requiredRole: "admin",
            deploymentAdminOnly: true,
          },
        ],
      },
    };
    expect(validateSchema(interaction)).toBe(true);
    expect(validateManifest(interaction).ok).toBe(true);
    for (const candidate of [
      (() => {
        const candidate = structuredClone(interaction);
        Reflect.deleteProperty(candidate, "localization");
        return candidate;
      })(),
      (() => {
        const candidate = structuredClone(interaction);
        Reflect.set(candidate.adminWorkspace, "navigation", {
          schemaVersion: "2",
        });
        return candidate;
      })(),
      (() => {
        const candidate = structuredClone(interaction);
        Reflect.set(candidate.adminWorkspace, "navigation", {
          schemaVersion: "1",
          path: "/unsafe",
        });
        return candidate;
      })(),
      (() => {
        const candidate = structuredClone(interaction);
        Reflect.set(candidate.adminWorkspace, "navigation", true);
        return candidate;
      })(),
      (() => {
        const candidate = structuredClone(interaction);
        candidate.adminWorkspace.tables[0]!.columns[0]!.key = "Bad Key";
        return candidate;
      })(),
      (() => {
        const candidate = structuredClone(interaction);
        Reflect.set(
          candidate.adminWorkspace.tables[0]!.rowActions[0]!.fields[0]!,
          "options",
          [{ value: "valid", labelKey: "policy.valid" }],
        );
        return candidate;
      })(),
      (() => {
        const candidate = structuredClone(interaction);
        const field =
          candidate.adminWorkspace.tables[0]!.rowActions[0]!.fields[0]!;
        field.type = "select";
        Reflect.deleteProperty(field, "minimum");
        Reflect.deleteProperty(field, "maximum");
        Reflect.set(field, "options", [
          { value: " ", labelKey: "policy.whitespace" },
        ]);
        return candidate;
      })(),
      (() => {
        const candidate = structuredClone(interaction);
        candidate.adminWorkspace.tables[0]!.rowActions[0]!.fields[0]!.maximum =
          Number.MAX_SAFE_INTEGER + 1;
        return candidate;
      })(),
      {
        ...interaction,
        adminWorkspace: { ...interaction.adminWorkspace, order: 1.5 },
      },
      (() => {
        const candidate = structuredClone(interaction);
        Reflect.deleteProperty(candidate.capabilities, "audit");
        return candidate;
      })(),
    ]) {
      expect(validateSchema(candidate), JSON.stringify(candidate)).toBe(false);
      expect(validateManifest(candidate).ok).toBe(false);
    }
    const quotationNavigation = {
      ...valid,
      navigation: {
        kind: "forms_workspace",
        moduleKey: "quotations",
        path: "/apps/quotations",
        icon: "receipt",
        fallbackTitle: "Quotations",
      },
    };
    expect(validateSchema(quotationNavigation)).toBe(true);
    expect(validateManifest(quotationNavigation).ok).toBe(true);
    const nativeWorkspace = {
      ...quotationNavigation,
      formStarterPack: {
        moduleKey: "quotations",
        path: "./forms/quotations.json",
      },
      frontend: {
        kind: "native_workspace",
        entry: "./dist/frontend.js",
        styles: ["./dist/frontend.css"],
        assets: ["./dist/assets/**"],
        sdkVersion: "1",
        mountIsolation: "shadow_dom",
        capabilities: ["forms.catalog.read", "forms.submissions.read"],
      },
    };
    expect(validateSchema(nativeWorkspace)).toBe(true);
    expect(validateManifest(nativeWorkspace).ok).toBe(true);
    const nativeWorkspaceWithoutStarterPack = {
      ...nativeWorkspace,
      formStarterPack: undefined,
    };
    expect(validateSchema(nativeWorkspaceWithoutStarterPack)).toBe(false);
    expect(validateManifest(nativeWorkspaceWithoutStarterPack).ok).toBe(false);
    const invalidWorkspace = {
      ...nativeWorkspace,
      frontend: {
        ...nativeWorkspace.frontend,
        entry: "https://cdn.example/app.js",
      },
    };
    expect(validateSchema(invalidWorkspace)).toBe(false);
    expect(validateManifest(invalidWorkspace).ok).toBe(false);

    const invalid = {
      ...valid,
      main: "./dist/../private.js",
      capabilities: { tools: [{ id: "status", risk: "root" }] },
    };
    expect(validateSchema(invalid)).toBe(false);
    expect(validateManifest(invalid).ok).toBe(false);
  });

  it("publishes a strict Forms starter-pack schema", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(
          import.meta.dirname,
          "../schemas/opsrabbit-form-starter-pack.schema.json",
        ),
        "utf8",
      ),
    );
    const validateSchema = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(schema);
    const pack = {
      formatVersion: 1,
      moduleKey: "quality",
      starters: [
        {
          starterKey: "quality_report",
          title: "Quality report",
          description: "Capture quality data.",
          recordType: "quality_report",
          badge: "Quality",
          icon: "check",
          schema: {
            fields: [{ key: "batch", label: "Batch", type: "text" }],
            sections: [{ key: "main", label: "Main", fieldKeys: ["batch"] }],
            actions: [{ key: "submit", label: "Submit", kind: "submit" }],
          },
          listConfig: {
            columns: [{ fieldKey: "batch", label: "Batch" }],
            defaultSort: "updated_at_desc",
          },
        },
      ],
    };
    expect(validateSchema(pack)).toBe(true);
    expect(validateSchema({ ...pack, executable: "./script.js" })).toBe(false);
  });

  it("keeps Knowledge capability schema and runtime validation in parity", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, "../schemas/opsrabbit-plugin.schema.json"),
        "utf8",
      ),
    );
    const validateSchema = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(schema);
    for (const [knowledge, expected] of [
      [{ write: true }, true],
      [{ read: true }, true],
      [{ delete: true }, true],
      [{ write: false }, false],
      [{ read: true, delete: false }, false],
      [{}, false],
      [{ write: true, read: true, delete: true }, true],
    ] as const) {
      const manifest: Record<string, unknown> = structuredClone(valid);
      delete manifest.database;
      manifest.capabilities = { knowledge };
      expect(validateSchema(manifest)).toBe(expected);
      expect(validateManifest(manifest).ok).toBe(expected);
    }
  });

  it("keeps Knowledge email processor capability schema and runtime validation in parity", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, "../schemas/opsrabbit-plugin.schema.json"),
        "utf8",
      ),
    );
    const validateSchema = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(schema);
    for (const [knowledgeEmailProcessor, expected] of [
      [{ schemaVersion: "1" }, true],
      [{ schemaVersion: "2" }, false],
      [{}, false],
      [{ schemaVersion: "1", write: true }, false],
    ] as const) {
      const candidate: Record<string, unknown> = structuredClone(valid);
      delete candidate.database;
      candidate.capabilities = { knowledgeEmailProcessor };
      expect(validateSchema(candidate)).toBe(expected);
      expect(validateManifest(candidate).ok).toBe(expected);
    }
  });

  it("publishes the bounded Data Insight workspace shape", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, "../schemas/opsrabbit-plugin.schema.json"),
        "utf8",
      ),
    );
    const validateSchema = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(schema);
    expect(
      validateSchema({
        ...valid,
        dataInsight: {
          catalogRoute: "/analytics-catalog",
          templatesRoute: "/analytics-templates",
          workspace: {
            placement: "tab",
            defaultTemplateId: "quality-overview",
            defaultTab: "records",
            allowUserDefault: true,
          },
        },
      }),
    ).toBe(true);
    expect(
      validateSchema({
        ...valid,
        dataInsight: {
          catalogRoute: "/analytics-catalog",
          templatesRoute: "/analytics-templates",
          workspace: {
            placement: "menu",
            defaultTemplateId: "quality-overview",
            defaultTab: "insights",
          },
        },
      }),
    ).toBe(false);
    expect(
      validateSchema({
        ...valid,
        dataInsight: {
          catalogRoute: "/analytics-catalog",
          templatesRoute: "/analytics-templates",
          workspace: {
            placement: "menu",
            defaultTemplateId: "quality-overview",
          },
        },
      }),
    ).toBe(true);
    expect(
      validateSchema({
        ...valid,
        dataInsight: {
          catalogRoute: "/analytics-catalog",
          templatesRoute: "/analytics-templates",
          workspace: {
            placement: "panel",
            defaultTemplateId: "quality-overview",
          },
        },
      }),
    ).toBe(false);
  });
});
