import { describe, expect, it } from "vitest";
import type { PluginManifest } from "../src/contracts/manifest.js";
import { PluginValidationError } from "../src/contracts/errors.js";
import { assertValidPlugin } from "../src/testing/assertions.js";
import { createTestContext } from "../src/testing/harness.js";

describe("test utilities", () => {
  it("captures structured logs, actors, settings, and tenant overrides", () => {
    const context = createTestContext({
      tenantId: "t-2",
      actor: { id: "operator-1", role: "operator", kind: "user" },
      settings: { limit: 4 },
    });
    context.logger.info("started", { count: 2 });
    context.logger.warn("slow");
    expect(context).toMatchObject({
      tenantId: "t-2",
      actor: { id: "operator-1" },
      settings: { limit: 4 },
    });
    expect(context.logs).toEqual([
      { level: "info", message: "started", fields: { count: 2 } },
      { level: "warn", message: "slow" },
    ]);
  });

  it("throws one structured error for manifest and registration issues", () => {
    const manifest = {
      id: "bad",
      name: "Bad",
      version: "nope",
      description: "Bad",
      apiVersion: "1.0",
      main: "./dist/index.js",
      capabilities: { tools: [{ id: "declared", risk: "read" }] },
    } as PluginManifest;
    expect(() => assertValidPlugin(manifest, { tools: [] })).toThrow(
      PluginValidationError,
    );
  });
});
