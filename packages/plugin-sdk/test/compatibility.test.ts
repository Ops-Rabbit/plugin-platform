import { describe, expect, it } from "vitest";
import { checkApiCompatibility } from "../src/validation/compatibility.js";

describe("checkApiCompatibility", () => {
  it("accepts matching majors", () =>
    expect(checkApiCompatibility("1.2", "1.0").compatible).toBe(true));
  it("rejects different majors", () =>
    expect(checkApiCompatibility("2.0", "1.0").compatible).toBe(false));
  it("rejects malformed versions", () =>
    expect(checkApiCompatibility("latest").compatible).toBe(false));
});
