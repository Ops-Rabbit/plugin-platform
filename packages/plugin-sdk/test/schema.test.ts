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
  },
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
});
