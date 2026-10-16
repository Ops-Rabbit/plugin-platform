import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { validateManifest } from "../src/index.js";
const manifest = {
  id: "specialist-workspace",
  name: "Specialist workspace",
  version: "1.0.0",
  description: "Dedicated plugin storage workspace",
  apiVersion: "1.0",
  main: "./dist/index.js",
  minimumOpsRabbitVersion: "0.8.0",
  navigation: {
    kind: "plugin_workspace",
    moduleKey: "specialist",
    path: "/apps/specialist",
    icon: "alert_triangle",
    fallbackTitle: "Specialist",
    section: "primary",
  },
  frontend: {
    kind: "native_workspace",
    entry: "./dist/frontend.js",
    styles: ["./dist/frontend.css"],
    assets: [],
    sdkVersion: "1",
    mountIsolation: "shadow_dom",
    capabilities: ["plugin.actions.invoke"],
    actionIds: ["list_records"],
  },
  capabilities: {
    actions: [{ id: "list_records", risk: "read", requiredRole: "viewer" }],
  },
};
const ajv = new Ajv2020({ strict: true, validateFormats: false });
const validateSchema = ajv.compile(
  JSON.parse(
    readFileSync(
      new URL("../schemas/opsrabbit-plugin.schema.json", import.meta.url),
      "utf8",
    ),
  ),
);
describe("standalone workspace navigation", () => {
  it("supports a real specialist workspace without Forms definitions or licensing", () => {
    expect(validateManifest(manifest)).toEqual({
      ok: true,
      value: manifest,
      issues: [],
    });
    expect(validateSchema(manifest)).toBe(true);
  });
  it("declares standard sharing and investigation navigation only with resource records", () => {
    const frontend = {
      ...manifest.frontend,
      capabilities: [
        "plugin.actions.invoke",
        "plugin.resources.manage",
        "plugin.investigations.open",
      ],
    };
    expect(validateManifest({ ...manifest, frontend }).ok).toBe(false);
    expect(validateSchema({ ...manifest, frontend })).toBe(false);
    const resourceRecords = {
      schemaVersion: "1",
      kinds: {
        incident: {
          labelKey: "incident.title",
          descriptionKey: "incident.description",
          retention: {
            defaultMode: "retain_indefinitely",
            supportedModes: [
              "do_not_persist",
              "retain_for_days",
              "retain_indefinitely",
            ],
          },
        },
      },
    };
    const input = {
      ...manifest,
      frontend,
      database: { migrationsPath: "./migrations/sql" },
      capabilities: {
        ...manifest.capabilities,
        database: { mode: "plugin_schema" },
        audit: { write: true },
        resourceRecords,
      },
    };
    expect(validateManifest(input).ok).toBe(true);
    expect(validateSchema(input)).toBe(true);
  });
  it.each([
    { frontend: undefined },
    {
      formStarterPack: {
        moduleKey: "specialist",
        path: "./forms/starter.json",
      },
    },
    {
      navigation: {
        ...manifest.navigation,
        workflow: { rootStarterKey: "incident", stageModelSetting: "stages" },
      },
    },
    {
      frontend: { ...manifest.frontend, capabilities: ["forms.catalog.read"] },
    },
    { navigation: { ...manifest.navigation, kind: "arbitrary_page" } },
  ])("schema/runtime reject mismatched standalone contracts: %j", (patch) => {
    const input = JSON.parse(JSON.stringify({ ...manifest, ...patch }));
    expect(validateManifest(input).ok).toBe(false);
    expect(validateSchema(input)).toBe(false);
  });
});
