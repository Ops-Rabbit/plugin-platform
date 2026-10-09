import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  PLUGIN_TOOL_UPDATE_SCHEMA,
  isPluginToolUpdate,
  validatePluginToolUpdate,
} from "../src/index.js";

const schema = new Ajv2020({ strict: true, allErrors: true }).compile(
  PLUGIN_TOOL_UPDATE_SCHEMA,
);

describe("tool update contract", () => {
  it("ships an identical schema", () => {
    expect(
      JSON.parse(
        readFileSync(
          new URL(
            "../schemas/opsrabbit-tool-update.schema.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    ).toEqual(PLUGIN_TOOL_UPDATE_SCHEMA);
  });

  it.each([
    { text: "Checking available case data" },
    { text: "a".repeat(4096) },
    { text: "😀".repeat(4096) },
    { text: "Revisando datos" },
  ])("accepts bounded plain partial output: %j", (update) => {
    expect(isPluginToolUpdate(update)).toBe(true);
    expect(schema(update)).toBe(true);
    expect(() => validatePluginToolUpdate(update)).not.toThrow();
  });

  it.each([
    null,
    [],
    "checking",
    {},
    { text: 5 },
    { text: "" },
    { text: " \n\t" },
    { text: "a".repeat(4097) },
    { text: "😀".repeat(4097) },
    { text: "Checking", tenantId: "another-tenant" },
    { text: "Checking", presentation: { clientAction: { target: "delete" } } },
  ])("rejects invalid or authority-bearing output: %j", (update) => {
    expect(isPluginToolUpdate(update)).toBe(false);
    expect(schema(update)).toBe(false);
    expect(() => validatePluginToolUpdate(update)).toThrow(TypeError);
  });
});
