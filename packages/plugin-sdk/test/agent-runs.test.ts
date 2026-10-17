import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  canonicalPluginAgentRunJson,
  definePlugin,
  matchesPluginAgentRunOutputSchema,
  parsePluginAgentRunBindingV1,
  parsePluginAgentRunRequestV1,
  validatePluginAgentRunRequestV1,
  PluginValidationError,
  validateManifest,
  validatePluginAgentRunJson,
  validatePluginAgentRunOutputSchema,
  validateRegistration,
  type PluginAgentRunBindingV1,
  type PluginManifest,
} from "../src/index.js";
import { createAuthorizedTestContext } from "../src/testing/index.js";

const binding: PluginAgentRunBindingV1 = {
  id: "summarize",
  agentSettingKeys: ["agent_name"],
  startActionId: "start-run",
  getActionId: "get-run",
  cancelActionId: "cancel-run",
  completionHandlerId: "receive-run",
  presets: [{ id: "short", instructions: "Summarize in one sentence." }],
};

const manifest: PluginManifest = {
  id: "run-example",
  name: "Run example",
  version: "1.0.0",
  description: "Runs a host-executed agent.",
  apiVersion: "1.0",
  main: "./dist/index.js",
  settings: [
    { key: "agent_name", label: "Agent", type: "string", required: true },
  ],
  capabilities: {
    actions: [
      { id: "start-run", risk: "external", requiredRole: "operator" },
      { id: "get-run", risk: "read", requiredRole: "operator" },
      { id: "cancel-run", risk: "write", requiredRole: "operator" },
      { id: "unrelated", risk: "read", requiredRole: "viewer" },
    ],
    agentRuns: { schemaVersion: "1", bindings: [binding] },
  },
};

const plugin = definePlugin({
  actions: ["start-run", "get-run", "cancel-run", "unrelated"].map((id) => ({
    id,
    title: id,
    risk: manifest.capabilities.actions!.find((action) => action.id === id)!
      .risk,
    requiredRole: manifest.capabilities.actions!.find(
      (action) => action.id === id,
    )!.requiredRole,
    async run() {
      return null;
    },
  })),
  agentRunCompletions: [{ id: "receive-run", async handle() {} }],
});

const request = {
  schemaVersion: "1",
  bindingId: "summarize",
  agentSettingKey: "agent_name",
  instructions: "Summarize the input.",
  inputs: { text: "Synthetic input" },
} as const;

const validateSchema = new Ajv2020({ strict: true, allErrors: true }).compile(
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../schemas/opsrabbit-plugin.schema.json"),
      "utf8",
    ),
  ),
);

function withBinding(patch: Record<string, unknown>): PluginManifest {
  const candidate = structuredClone(manifest);
  Object.assign(candidate.capabilities.agentRuns!.bindings[0]!, patch);
  return candidate;
}

function omit<T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function issuePaths(candidate: unknown): string[] {
  return validateManifest(candidate).issues.map((entry) => entry.path);
}

describe("agent runs manifest contract", () => {
  it("accepts a binding with schema/runtime parity and a registered completion", () => {
    expect(
      validateSchema(manifest),
      JSON.stringify(validateSchema.errors),
    ).toBe(true);
    expect(validateManifest(manifest)).toMatchObject({ ok: true, issues: [] });
    expect(validateRegistration(manifest, plugin)).toEqual([]);
    expect(parsePluginAgentRunBindingV1(binding)).toBe(binding);
  });

  it("leaves manifests without agentRuns unchanged", () => {
    const capabilities = omit(manifest.capabilities, "agentRuns");
    const legacy = { ...manifest, capabilities };
    expect(validateSchema(legacy)).toBe(true);
    expect(validateManifest(legacy).ok).toBe(true);
    const legacyPlugin = omit(plugin, "agentRunCompletions");
    expect(validateRegistration(legacy, legacyPlugin)).toEqual([]);
  });

  it("rejects plugin-declared limits, tools, skills and malformed shapes in both validators", () => {
    for (const patch of [
      { limits: { inputBytes: 1024 } },
      { runtimeTools: "disabled" },
      { runtimeTools: "enabled" },
      { tools: ["bash"] },
      { id: "Bad id" },
      { id: "b-" },
      { agentSettingKeys: [] },
      { agentSettingKeys: ["agent_name", "agent_name"] },
      { skills: [{ name: "guide", referencePaths: ["references/guide.md"] }] },
      { skills: [] },
      { presets: [{ id: "blank", instructions: "   " }] },
      { presets: [{ id: "long", instructions: "é".repeat(12_289) }] },
    ]) {
      const candidate = withBinding(patch);
      expect(validateSchema(candidate), JSON.stringify(patch)).toBe(false);
      expect(validateManifest(candidate).ok, JSON.stringify(patch)).toBe(false);
    }
    for (const agentRuns of [
      { schemaVersion: "2", bindings: [binding] },
      { schemaVersion: "1", bindings: [] },
      { schemaVersion: "1", tasks: [] },
      { schemaVersion: "1", bindings: [binding], extra: true },
    ]) {
      const candidate = {
        ...manifest,
        capabilities: { ...manifest.capabilities, agentRuns },
      };
      expect(validateSchema(candidate), JSON.stringify(agentRuns)).toBe(false);
      expect(validateManifest(candidate).ok).toBe(false);
    }
  });

  it("accepts 12,288-character presets in both validators", () => {
    const candidate = withBinding({
      presets: [{ id: "long", instructions: "é".repeat(12_288) }],
    });
    expect(validateSchema(candidate)).toBe(true);
    expect(validateManifest(candidate).ok).toBe(true);
  });

  it("reports each invalid field at its own path", () => {
    expect(
      issuePaths(withBinding({ runtimeTools: "enabled", startActionId: "x" })),
    ).toEqual(
      expect.arrayContaining([
        "$.capabilities.agentRuns.bindings[0].runtimeTools",
        "$.capabilities.agentRuns.bindings[0].startActionId",
      ]),
    );
    expect(issuePaths(withBinding({ agentSettingKeys: ["missing"] }))).toEqual([
      "$.capabilities.agentRuns.bindings[0].agentSettingKeys[0]",
    ]);
  });

  it("requires bound actions with matching risk, operator role and no reuse", () => {
    for (const patch of [
      { startActionId: "unrelated" },
      { getActionId: "start-run" },
      { cancelActionId: "get-run" },
    ])
      expect(validateManifest(withBinding(patch)).ok).toBe(false);
    const weak = structuredClone(manifest);
    weak.capabilities.actions![0]!.requiredRole = "viewer";
    expect(validateManifest(weak).ok).toBe(false);
    const optional = structuredClone(manifest);
    optional.settings![0]!.required = false;
    expect(validateManifest(optional).ok).toBe(false);
    const defaulted = structuredClone(manifest);
    defaulted.settings![0]!.default = "any_agent";
    expect(validateManifest(defaulted).ok).toBe(false);
    const duplicate = structuredClone(manifest);
    duplicate.capabilities.agentRuns = {
      schemaVersion: "1",
      bindings: [binding, { ...binding }],
    };
    expect(issuePaths(duplicate)).toContain(
      "$.capabilities.agentRuns.bindings[1].id",
    );
  });

  it("requires every declared completion handler with a handle function", () => {
    expect(
      validateRegistration(manifest, { ...plugin, agentRunCompletions: [] }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-registration" }),
      ]),
    );
    expect(
      validateRegistration(manifest, {
        ...plugin,
        agentRunCompletions: [{ id: "wrong", async handle() {} }],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "undeclared-capability" }),
      ]),
    );
    expect(
      validateRegistration(manifest, {
        ...plugin,
        agentRunCompletions: [{ id: "receive-run" } as never],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.agentRunCompletions[0].handle" }),
      ]),
    );
  });

  it("allows workspace observation only for declared bindings with an allowlisted get action", () => {
    const workspace = {
      ...manifest,
      navigation: {
        kind: "forms_workspace",
        moduleKey: "runs",
        path: "/apps/runs",
        icon: "receipt",
        fallbackTitle: "Runs",
      },
      formStarterPack: { moduleKey: "runs", path: "./forms/runs.json" },
      frontend: {
        kind: "native_workspace",
        entry: "./dist/frontend.js",
        styles: [],
        assets: [],
        sdkVersion: "1",
        mountIsolation: "shadow_dom",
        capabilities: ["plugin.actions.invoke", "agent.runs.observe"],
        actionIds: ["get-run"],
        agentRunBindingIds: ["summarize"],
      },
    };
    expect(
      validateSchema(workspace),
      JSON.stringify(validateSchema.errors),
    ).toBe(true);
    expect(validateManifest(workspace)).toMatchObject({ ok: true });
    for (const frontend of [
      { ...workspace.frontend, agentRunBindingIds: undefined },
      {
        ...workspace.frontend,
        capabilities: ["plugin.actions.invoke"],
      },
    ]) {
      const candidate = { ...workspace, frontend };
      expect(validateSchema(candidate)).toBe(false);
      expect(validateManifest(candidate).ok).toBe(false);
    }
    for (const frontend of [
      { ...workspace.frontend, agentRunBindingIds: ["unknown"] },
      { ...workspace.frontend, actionIds: ["start-run"] },
    ])
      expect(validateManifest({ ...workspace, frontend }).ok).toBe(false);
  });
});

describe("agent run requests", () => {
  it("accepts caller instructions or exactly one preset", () => {
    expect(parsePluginAgentRunRequestV1(request, binding)).toEqual(request);
    const withoutInstructions = omit(request, "instructions");
    expect(
      parsePluginAgentRunRequestV1(
        { ...withoutInstructions, presetId: "short" },
        binding,
      ).instructions,
    ).toBe("Summarize in one sentence.");
  });

  it("rejects forged scope, coercible values and ambiguous instructions", () => {
    for (const patch of [
      { schemaVersion: "2" },
      { bindingId: "other" },
      { agentSettingKey: "other" },
      { agentSettingKey: ["agent_name"] },
      { tenantId: "other" },
      { tools: ["fetch"] },
      { instructions: " " },
      { presetId: "short" },
      { instructions: undefined },
      { inputs: undefined },
      { outputSchema: { type: "object", $ref: "https://example.test" } },
    ]) {
      const candidate: Record<string, unknown> = { ...request, ...patch };
      for (const [key, value] of Object.entries(patch))
        if (value === undefined) delete candidate[key];
      expect(
        () => parsePluginAgentRunRequestV1(candidate, binding),
        JSON.stringify(patch),
      ).toThrow(PluginValidationError);
    }
    const withoutInstructions = omit(request, "instructions");
    expect(() =>
      parsePluginAgentRunRequestV1(
        { ...withoutInstructions, presetId: "unknown" },
        binding,
      ),
    ).toThrow(PluginValidationError);
  });

  it("canonicalizes requests for a shared digest", () => {
    const accepted = parsePluginAgentRunRequestV1(request, binding);
    const reordered = {
      inputs: { text: "Synthetic input" },
      instructions: "Summarize the input.",
      agentSettingKey: "agent_name",
      bindingId: "summarize",
      schemaVersion: "1",
    } as const;
    expect(canonicalPluginAgentRunJson(accepted)).toBe(
      canonicalPluginAgentRunJson(reordered),
    );
    expect(canonicalPluginAgentRunJson({ b: [1, "é"], a: null })).toBe(
      '{"a":null,"b":[1,"é"]}',
    );
    expect(
      createHash("sha256")
        .update(canonicalPluginAgentRunJson(accepted))
        .digest("hex"),
    ).toMatch(/^[0-9a-f]{64}$/);
  });

  it("omits undefined optional fields so the digest matches the serialized request", () => {
    const sparse = { ...request, presetId: undefined, outputSchema: undefined };
    const accepted = parsePluginAgentRunRequestV1(sparse, binding);
    expect(Object.keys(accepted)).not.toContain("presetId");
    expect(Object.keys(accepted)).not.toContain("outputSchema");
    expect(canonicalPluginAgentRunJson(sparse as never)).toBe(
      canonicalPluginAgentRunJson(JSON.parse(JSON.stringify(sparse))),
    );
    expect(canonicalPluginAgentRunJson([1, undefined] as never)).toBe(
      JSON.stringify([1, undefined]),
    );
  });

  it("keeps presetId as provenance on the accepted request", () => {
    const accepted = parsePluginAgentRunRequestV1(
      { ...omit(request, "instructions"), presetId: "short" },
      binding,
    );
    expect(accepted).toEqual({
      ...omit(request, "instructions"),
      presetId: "short",
      instructions: "Summarize in one sentence.",
    });
  });

  it("bounds caller instructions like presets", () => {
    expect(
      parsePluginAgentRunRequestV1(
        { ...request, instructions: "é".repeat(12_288) },
        binding,
      ).instructions,
    ).toHaveLength(12_288);
    expect(() =>
      parsePluginAgentRunRequestV1(
        { ...request, instructions: "é".repeat(12_289) },
        binding,
      ),
    ).toThrow(PluginValidationError);
  });

  it("applies the host byte limit after preset instructions are resolved", () => {
    const long = "x".repeat(10_000);
    const presetBinding = {
      ...binding,
      presets: [{ id: "long", instructions: long }],
    };
    const selected = { ...omit(request, "instructions"), presetId: "long" };
    const raw = new TextEncoder().encode(JSON.stringify(selected)).byteLength;
    expect(() =>
      parsePluginAgentRunRequestV1(selected, presetBinding, {
        maxRequestBytes: raw + 100,
      }),
    ).toThrow(PluginValidationError);
    expect(
      parsePluginAgentRunRequestV1(selected, presetBinding, {
        maxRequestBytes: raw + long.length + 100,
      }).instructions,
    ).toBe(long);
  });

  it("applies the same depth bound to inputs with or without a byte limit", () => {
    let atLimit: unknown = "leaf";
    for (let index = 0; index < 32; index += 1) atLimit = [atLimit];
    const deepInputs = { ...request, inputs: atLimit };
    expect(validatePluginAgentRunRequestV1(deepInputs, binding)).toEqual([]);
    expect(
      validatePluginAgentRunRequestV1(deepInputs, binding, {
        maxRequestBytes: 1_000_000,
      }),
    ).toEqual([]);
  });

  it("measures the accepted request exactly against the byte limit", () => {
    const accepted = parsePluginAgentRunRequestV1(request, binding);
    const exact = new TextEncoder().encode(JSON.stringify(accepted)).byteLength;
    expect(
      parsePluginAgentRunRequestV1(request, binding, {
        maxRequestBytes: exact,
      }),
    ).toEqual(accepted);
    expect(
      validatePluginAgentRunRequestV1(request, binding, {
        maxRequestBytes: exact - 1,
      }),
    ).toEqual([expect.objectContaining({ path: "$", code: "too-large" })]);
  });

  it("leaves byte size to host policy", () => {
    const large = { ...request, inputs: { text: "x".repeat(400_000) } };
    expect(parsePluginAgentRunRequestV1(large, binding).inputs).toEqual(
      large.inputs,
    );
    expect(() =>
      parsePluginAgentRunRequestV1(large, binding, {
        maxRequestBytes: 100_000,
      }),
    ).toThrow(PluginValidationError);
  });

  it("enforces structural JSON bounds without a fixed byte cap", () => {
    const recursive: Record<string, unknown> = {};
    recursive.child = recursive;
    let deep: unknown = "leaf";
    for (let index = 0; index < 34; index += 1) deep = { deep };
    for (const value of [
      recursive,
      deep,
      new Date(),
      undefined,
      Infinity,
      Array(4_097).fill(0),
      Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`k${i}`, i])),
      JSON.parse('{"__proto__":{}}'),
    ])
      expect(validatePluginAgentRunJson(value)).not.toEqual([]);
    expect(
      validatePluginAgentRunJson({
        code: { constructor: "Widget", prototype: "render" },
      }),
    ).toEqual([]);
  });

  it("rejects shared references and measures serialized size", () => {
    const shared = { text: "x" };
    for (const value of [{ a: shared, b: shared }, [shared, [shared]]])
      expect(validatePluginAgentRunJson(value)).toEqual([
        expect.objectContaining({ code: "type" }),
      ]);
    let dag: unknown = "leaf";
    for (let index = 0; index < 31; index += 1) dag = [dag, dag];
    const started = performance.now();
    expect(validatePluginAgentRunJson(dag)).toEqual([
      expect.objectContaining({ code: "type" }),
    ]);
    expect(() =>
      parsePluginAgentRunRequestV1({ ...request, inputs: dag }, binding),
    ).toThrow(PluginValidationError);
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(
      validatePluginAgentRunJson({ a: { text: "x" }, b: { text: "x" } }),
    ).toEqual([]);
    const value = { b: [1, "é", null, { c: true }], a: { ké: -0.5 } };
    const exact = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    expect(validatePluginAgentRunJson(value, "$", { maxBytes: exact })).toEqual(
      [],
    );
    expect(
      validatePluginAgentRunJson(value, "$", { maxBytes: exact - 1 }),
    ).not.toEqual([]);
  });

  it("validates the supported output schema subset", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["names"],
      properties: {
        names: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          items: { type: "string", minLength: 1, maxLength: 3 },
        },
        tone: { type: "string", enum: ["formal", "casual"] },
      },
    };
    expect(validatePluginAgentRunOutputSchema(schema)).toEqual([]);
    expect(matchesPluginAgentRunOutputSchema(schema, { names: ["abc"] })).toBe(
      true,
    );
    for (const output of [
      { names: [] },
      { names: ["long"] },
      { names: [1] },
      { names: ["a"], injected: true },
      { names: ["a"], tone: "loud" },
      {},
    ])
      expect(matchesPluginAgentRunOutputSchema(schema, output)).toBe(false);
    for (const invalid of [
      { type: "string", minLength: 5, maxLength: 1 },
      { type: "string", items: { type: "string" } },
      { type: "object", required: ["missing"] },
      { type: "string", pattern: ".*" },
      { type: "string", enum: [1] },
      { type: "function" },
    ])
      expect(validatePluginAgentRunOutputSchema(invalid)).not.toEqual([]);
  });
});

describe("agent run test harness", () => {
  const snapshot = { runId: "run-1", bindingId: "summarize" };
  const service = () => ({
    start: vi.fn().mockResolvedValue({ runId: "run-1" }),
    get: vi.fn().mockResolvedValue(snapshot),
    cancel: vi.fn().mockResolvedValue(snapshot),
  });

  it("exposes the broker only to bound actions", () => {
    const agentRuns = service();
    expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "action", id: "unrelated" },
        { agentRuns },
      ).agentRuns,
    ).toBeUndefined();
    expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "action", id: "undeclared" },
        { agentRuns },
      ).agentRuns,
    ).toBeUndefined();
  });

  it("starts only the binding owned by the start action and validates the request", async () => {
    const agentRuns = service();
    const start = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "start-run" },
      { agentRuns },
    ).agentRuns!;
    await expect(start.start(request)).resolves.toEqual({ runId: "run-1" });
    await expect(
      start.start({ ...request, agentSettingKey: "other" }),
    ).rejects.toThrow(PluginValidationError);
    await expect(start.get({ runId: "run-1" })).rejects.toThrow(
      "not authorized",
    );
    const get = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "get-run" },
      { agentRuns },
    ).agentRuns!;
    await expect(get.start(request)).rejects.toThrow("not authorized");
    await expect(get.cancel({ runId: "run-1" })).rejects.toThrow(
      "not authorized",
    );
    await expect(get.get({ runId: "run-1" })).resolves.toEqual(snapshot);
    expect(agentRuns.start).toHaveBeenCalledTimes(1);
  });

  it("rejects a broker result that is not a snapshot", async () => {
    const agentRuns = {
      ...service(),
      get: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "action", id: "get-run" },
        { agentRuns },
      ).agentRuns!.get({ runId: "run-1" }),
    ).rejects.toThrow("must resolve a snapshot");
  });

  it("rejects runs of a binding that does not own the get or cancel action", async () => {
    const other = {
      ...binding,
      id: "other",
      startActionId: "start-other",
      getActionId: "get-other",
      cancelActionId: "cancel-other",
      completionHandlerId: "receive-other",
    };
    const twoBindings = structuredClone(manifest);
    twoBindings.capabilities.actions!.push(
      { id: "start-other", risk: "external", requiredRole: "operator" },
      { id: "get-other", risk: "read", requiredRole: "operator" },
      { id: "cancel-other", risk: "write", requiredRole: "operator" },
    );
    twoBindings.capabilities.agentRuns = {
      schemaVersion: "1",
      bindings: [binding, other],
    };
    const agentRuns = service();
    for (const [id, operation] of [
      ["get-other", "get"],
      ["cancel-other", "cancel"],
    ] as const)
      await expect(
        createAuthorizedTestContext(
          twoBindings,
          { kind: "action", id },
          { agentRuns },
        ).agentRuns![operation]({ runId: "run-1" }),
      ).rejects.toThrow("not authorized");
    await expect(
      createAuthorizedTestContext(
        twoBindings,
        { kind: "action", id: "cancel-run" },
        { agentRuns },
      ).agentRuns!.cancel({ runId: "run-1" }),
    ).resolves.toEqual(snapshot);
  });
});
