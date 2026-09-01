import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type {
  PluginManifest,
  PluginStructuredClassificationCapability,
  PluginStructuredClassificationInputV1,
  PluginStructuredClassificationResultV1,
} from "../src/index.js";
import { createAuthorizedTestContext } from "../src/testing/index.js";

const actionOnly = {
  schemaVersion: "1",
  actionIds: ["classify-item"],
} as const;
const jobOnly = {
  schemaVersion: "1",
  scheduledJobIds: ["classify-pending"],
} as const;
const both = {
  schemaVersion: "1",
  actionIds: ["classify-item"],
  scheduledJobIds: ["classify-pending"],
} as const;

const input: PluginStructuredClassificationInputV1 = {
  schemaVersion: "1",
  content: "A bounded support item.",
  instructions: "Recommend one supplied class.",
  classes: [
    {
      key: "verified_case",
      label: "Verified case",
      description: "Cause and resolution are proven.",
      qualificationRequirements: ["Confirmed cause"],
    },
    {
      key: "reject",
      label: "Reject",
      description: "Not reusable technical knowledge.",
      qualificationRequirements: ["No reusable support value"],
    },
  ],
  evidence: [],
  timeoutMs: 5_000,
};

const manifest: PluginManifest = {
  id: "classification-contract",
  name: "Classification contract",
  description: "Exercises structured-classification contract semantics.",
  version: "1.0.0",
  apiVersion: "1.0",
  main: "./dist/index.js",
  capabilities: {
    actions: [{ id: "classify-item", risk: "write", requiredRole: "operator" }],
    scheduledJobs: [{ id: "classify-pending" }],
    structuredClassification: both,
  },
  settings: [],
};

describe("structured-classification public contract", () => {
  it("requires at least one non-empty binding in the TypeScript capability", () => {
    expectTypeOf(
      actionOnly,
    ).toMatchTypeOf<PluginStructuredClassificationCapability>();
    expectTypeOf(
      jobOnly,
    ).toMatchTypeOf<PluginStructuredClassificationCapability>();
    expectTypeOf(
      both,
    ).toMatchTypeOf<PluginStructuredClassificationCapability>();
    expectTypeOf<{
      readonly schemaVersion: "1";
    }>().not.toMatchTypeOf<PluginStructuredClassificationCapability>();
    expectTypeOf<{
      readonly schemaVersion: "1";
      readonly actionIds: readonly [];
    }>().not.toMatchTypeOf<PluginStructuredClassificationCapability>();
    expectTypeOf<{
      readonly schemaVersion: "1";
      readonly scheduledJobIds: readonly [];
    }>().not.toMatchTypeOf<PluginStructuredClassificationCapability>();
  });

  it("propagates invocation cancellation instead of converting it to a result", async () => {
    const cancellation = new DOMException("Invocation cancelled", "AbortError");
    const controller = new AbortController();
    const classify = vi.fn(
      async (): Promise<PluginStructuredClassificationResultV1> => {
        controller.signal.throwIfAborted();
        return { status: "timeout" };
      },
    );
    const context = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "classify-item" },
      {
        signal: controller.signal,
        structuredClassification: { classify },
      },
    );

    controller.abort(cancellation);

    await expect(
      context.structuredClassification?.classify(input),
    ).rejects.toBe(cancellation);
  });

  it("keeps broker deadline expiry as an explicit timeout result", async () => {
    const classify = vi.fn(
      async (): Promise<PluginStructuredClassificationResultV1> => ({
        status: "timeout",
      }),
    );
    const context = createAuthorizedTestContext(
      manifest,
      { kind: "scheduledJob", id: "classify-pending" },
      { structuredClassification: { classify } },
    );

    await expect(
      context.structuredClassification?.classify(input),
    ).resolves.toEqual({ status: "timeout" });
  });
});
