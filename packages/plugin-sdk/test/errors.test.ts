import { describe, expect, it } from "vitest";
import { PluginActionError } from "../src/index.js";

describe("PluginActionError", () => {
  it("carries a bounded action status and stable code", () => {
    const error = new PluginActionError(
      409,
      "idempotency_conflict",
      "The request key was reused.",
    );
    expect(error).toMatchObject({
      name: "PluginActionError",
      status: 409,
      code: "idempotency_conflict",
      message: "The request key was reused.",
    });
  });
});
