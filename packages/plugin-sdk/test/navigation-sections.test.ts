import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  PLUGIN_NAVIGATION_SECTIONS,
  type PluginNavigationSection,
} from "../src/contracts/manifest.js";
import { validateManifest } from "../src/validation/manifest.js";

const schema = JSON.parse(
  readFileSync(
    new URL("../schemas/opsrabbit-plugin.schema.json", import.meta.url),
    "utf8",
  ),
);
const validateSchema = new Ajv2020({ strict: true }).compile(schema);
const manifest = {
  id: "navigation-example",
  name: "Navigation example",
  version: "1.0.0",
  description: "Navigation parity fixture",
  apiVersion: "1.0",
  main: "./dist/index.js",
  minimumOpsRabbitVersion: "0.6.0",
  capabilities: {
    tools: [
      {
        id: "status",
        risk: "read",
        audience: "all",
        requiredPermission: "read",
      },
    ],
  },
  navigation: {
    kind: "forms_workspace",
    moduleKey: "operations",
    path: "/apps/operations",
    icon: "headset",
    fallbackTitle: "Operations",
  },
};

describe("navigation section public contract", () => {
  it.each([true, false])("accepts explicit adminOnly %s", (adminOnly) => {
    const value = {
      ...manifest,
      navigation: { ...manifest.navigation, adminOnly },
    };
    expect(validateSchema(value)).toBe(true);
    expect(validateManifest(value).value?.navigation?.adminOnly).toBe(
      adminOnly,
    );
  });
  it.each(["true", 0, null, {}, []])(
    "rejects malformed adminOnly %j",
    (adminOnly) => {
      const value = {
        ...manifest,
        navigation: { ...manifest.navigation, adminOnly },
      };
      expect(validateSchema(value)).toBe(false);
      expect(validateManifest(value).ok).toBe(false);
    },
  );
  it.each(PLUGIN_NAVIGATION_SECTIONS)(
    "accepts and preserves %s without authorizing access",
    (section: PluginNavigationSection) => {
      const value = {
        ...manifest,
        navigation: { ...manifest.navigation, section },
      };
      expect(validateSchema(value), JSON.stringify(validateSchema.errors)).toBe(
        true,
      );
      const result = validateManifest(value);
      expect(result.ok).toBe(true);
      expect(result.value?.navigation?.section).toBe(section);
    },
  );
  it("preserves the backward-compatible omission", () => {
    expect(
      validateSchema(manifest),
      JSON.stringify(validateSchema.errors),
    ).toBe(true);
    expect(
      validateManifest(manifest).value?.navigation?.section,
    ).toBeUndefined();
  });
  it.each([
    ["section", undefined],
    ["section", "0.5.9"],
    ["adminOnly", "0.5.9"],
    ["section", "0.6.0-rc.1"],
  ] as const)(
    "rejects %s on an incompatible host version %s",
    (field, minimumOpsRabbitVersion) => {
      const value = {
        ...manifest,
        minimumOpsRabbitVersion,
        navigation: {
          ...manifest.navigation,
          [field]: field === "section" ? "control" : true,
        },
      };
      expect(validateSchema(value)).toBe(false);
      expect(validateManifest(value).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "$.minimumOpsRabbitVersion" }),
        ]),
      );
    },
  );
  it.each(["CONTROL", "", "admin", null, 1, {}, []])(
    "rejects unsupported section %j in schema and runtime",
    (section) => {
      const value = {
        ...manifest,
        navigation: { ...manifest.navigation, section },
      };
      expect(validateSchema(value)).toBe(false);
      const result = validateManifest(value);
      expect(result.ok).toBe(false);
      expect(
        result.issues.some((issue) => issue.path === "$.navigation.section"),
      ).toBe(true);
    },
  );
});
