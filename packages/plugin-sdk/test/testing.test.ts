import { describe, expect, it } from "vitest";
import { PluginValidationError } from "../src/contracts/errors.js";
import { assertValidPlugin } from "../src/testing/assertions.js";
import { createTestContext } from "../src/testing/harness.js";

describe("test utilities", () => {
  it("captures structured logs and accepts context overrides", () => {
    const context = createTestContext({
      tenantId: "t-2",
      actor: { id: "operator-1", role: "operator" },
    });
    context.logger.info("started", { count: 2 });
    context.logger.warn("slow");
    expect(context.tenantId).toBe("t-2");
    expect(context.logs).toEqual([
      { level: "info", message: "started", fields: { count: 2 } },
      { level: "warn", message: "slow" },
    ]);
  });

  it("throws a structured validation error", () => {
    expect(() =>
      assertValidPlugin({
        manifest: {
          id: "bad",
          name: "Bad",
          version: "nope",
          description: "Bad",
          apiVersion: "1.0",
          main: "./dist/index.js",
          capabilities: ["tools"],
        },
      }),
    ).toThrow(PluginValidationError);
  });
});
