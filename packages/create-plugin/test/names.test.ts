import { describe, expect, it } from "vitest";
import { normalizePluginName } from "../src/generator/names.js";
import { renderTemplate } from "../src/generator/render.js";

describe("generator primitives", () => {
  it("normalizes user-facing names", () => {
    expect(normalizePluginName("Incident Helper")).toEqual({
      id: "incident-helper",
      packageName: "opsrabbit-plugin-incident-helper",
      displayName: "Incident Helper",
    });
    expect(normalizePluginName("statusAPI")).toEqual(
      expect.objectContaining({ id: "status-api" }),
    );
  });

  it("rejects unusable names", () =>
    expect(() => normalizePluginName("123")).toThrow());

  it("renders known variables and rejects unknown variables", () => {
    expect(renderTemplate("Hello {{name}}", { name: "Ops" })).toBe("Hello Ops");
    expect(() => renderTemplate("{{missing}}", {})).toThrow(
      "Unknown template variable",
    );
  });
});
