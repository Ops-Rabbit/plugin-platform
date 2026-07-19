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
            placement: "panel",
            defaultTemplateId: "quality-overview",
          },
        },
      }),
    ).toBe(false);
  });
});
