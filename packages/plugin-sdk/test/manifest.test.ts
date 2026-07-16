import { describe, expect, it } from "vitest";
import { validateManifest } from "../src/validation/manifest.js";

const valid = {
  id: "incident-tools",
  name: "Incident Tools",
  version: "1.2.3",
  description: "Incident response helpers.",
  apiVersion: "1.0",
  main: "./dist/index.js",
  capabilities: ["tools"],
};

describe("validateManifest", () => {
  it("accepts a valid public manifest", () => {
    expect(validateManifest(valid)).toEqual({
      ok: true,
      value: valid,
      issues: [],
    });
  });

  it("rejects non-objects", () => {
    expect(validateManifest(null).issues).toContainEqual(
      expect.objectContaining({ path: "$", code: "type" }),
    );
  });

  it("reports invalid identity, version, entry, API, and capabilities together", () => {
    const result = validateManifest({
      id: "Bad Name",
      name: "",
      description: "",
      version: "latest",
      apiVersion: "2.0",
      main: "../private.js",
      capabilities: ["root", "root"],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "$.id",
        "$.name",
        "$.description",
        "$.version",
        "$.main",
        "$.apiVersion",
        "$.capabilities[0]",
      ]),
    );
  });

  it("rejects missing and duplicate capabilities", () => {
    expect(
      validateManifest({ ...valid, capabilities: [] }).issues[0]?.path,
    ).toBe("$.capabilities");
    expect(
      validateManifest({ ...valid, capabilities: ["tools", "tools"] }).issues,
    ).toContainEqual(expect.objectContaining({ code: "duplicate" }));
  });

  it("keeps runtime validation aligned with bounded schema fields", () => {
    const result = validateManifest({
      ...valid,
      unexpected: true,
      name: "n".repeat(101),
      description: "d".repeat(501),
      publisher: { name: "Publisher", url: "file:///private", secret: true },
    });
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["unknown-property", "too-long", "invalid"]),
    );
  });

  it("rejects malformed publishers", () => {
    expect(validateManifest({ ...valid, publisher: {} }).issues).toContainEqual(
      expect.objectContaining({ path: "$.publisher", code: "invalid" }),
    );
  });

  it("rejects traversal entries and invalid host compatibility versions", () => {
    const result = validateManifest({
      ...valid,
      main: "./dist/../private.js",
      minimumOpsRabbitVersion: "latest",
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.main" }),
        expect.objectContaining({ path: "$.minimumOpsRabbitVersion" }),
      ]),
    );
  });
});
