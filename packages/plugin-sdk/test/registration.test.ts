import { describe, expect, it } from "vitest";
import { definePlugin } from "../src/contracts/registration.js";
import { validateRegistration } from "../src/validation/registration.js";

const manifest = {
  id: "tools",
  name: "Tools",
  version: "1.0.0",
  description: "Tools",
  apiVersion: "1.0" as const,
  main: "./dist/index.js",
  capabilities: ["tools"] as const,
};

describe("plugin registration", () => {
  it("captures immutable declared capabilities", () => {
    const plugin = definePlugin({
      manifest: { ...manifest, capabilities: [...manifest.capabilities] },
    });
    expect(plugin.declaredCapabilities).toEqual(["tools"]);
    expect(Object.isFrozen(plugin)).toBe(true);
  });

  it("rejects registered functionality without its capability", () => {
    const issues = validateRegistration({
      manifest: { ...manifest, capabilities: ["tools"] },
      actions: [{ id: "restart", description: "Restart", async run() {} }],
    });
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "undeclared-capability" }),
    );
  });

  it("rejects duplicate ids within a registration section", () => {
    const run = async () => undefined;
    const issues = validateRegistration({
      manifest: { ...manifest, capabilities: ["tools"] },
      tools: [
        { id: "same", description: "One", run },
        { id: "same", description: "Two", run },
      ],
    });
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "duplicate" }),
    );
  });
});
