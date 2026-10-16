import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  INBOUND_LIFECYCLE_EVENT_SCHEMA,
  isInboundLifecycleEvent,
  validateInboundLifecycleEvent,
  validateManifest,
  validateRegistration,
  type InboundLifecycleEventV1,
  type PluginManifest,
} from "../src/index.js";

const received: InboundLifecycleEventV1 = {
  schemaVersion: "1",
  eventId: "delivery-001",
  tenantId: "tenant-a",
  inboundId: "inbound-a",
  sourceEventId: "source-event-1",
  sourceSystemId: "source-account-1",
  bindingRevision: 1,
  revision: 1,
  occurredAt: "2026-10-16T09:10:11.000Z",
  change: {
    type: "received",
    title: "AUTH-42",
    description: "A synthetic login alert.",
    upstreamIncidentId: "source/account/1048",
    severity: "high",
  },
};
const manifest: PluginManifest = {
  id: "incident-register-example",
  name: "Incident register example",
  version: "1.0.0",
  description: "Consumes tenant-scoped Inbound lifecycle events.",
  apiVersion: "1.0",
  main: "./dist/index.js",
  settings: [],
  capabilities: { inboundLifecycle: { schemaVersion: "1" } },
};
// Schema parity must not depend on optional format assertion behavior.
const ajv = new Ajv2020({ strict: true, validateFormats: false });
const schemaValidate = ajv.compile(INBOUND_LIFECYCLE_EVENT_SCHEMA);

describe("Inbound lifecycle public contract", () => {
  it("ships the same event schema as the runtime validator", () => {
    const shipped = JSON.parse(
      readFileSync(
        new URL(
          "../schemas/opsrabbit-inbound-lifecycle-event.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(shipped).toEqual(INBOUND_LIFECYCLE_EVENT_SCHEMA);
  });
  it("keeps manifest schema and runtime declaration validation aligned", () => {
    const published = JSON.parse(
      readFileSync(
        new URL("../schemas/opsrabbit-plugin.schema.json", import.meta.url),
        "utf8",
      ),
    );
    const capabilitySchema =
      published.properties.capabilities.properties.inboundLifecycle;
    const validate = new Ajv2020({ strict: true }).compile(capabilitySchema);
    for (const capability of [
      { schemaVersion: "1" },
      { schemaVersion: "2" },
      {},
      [],
      { schemaVersion: "1", allowAllTenants: true },
    ]) {
      const result = validateManifest({
        ...manifest,
        capabilities: { inboundLifecycle: capability },
      });
      expect(validate(capability)).toBe(result.ok);
    }
  });
  it("delivers only validated events in the correct tenant and honors cancellation", async () => {
    const { deliverInboundLifecycleEvent } = await import(
      new URL("../reference/inbound-lifecycle.mjs", import.meta.url).href
    );
    const handle = vi.fn(async () => {});
    const definition = { schemaVersion: "1", handle };
    const signal = new AbortController().signal;
    const context = { tenantId: "tenant-a", signal };
    await deliverInboundLifecycleEvent(definition, received, context);
    expect(handle).toHaveBeenCalledWith(received, context);
    handle.mockClear();
    await expect(
      deliverInboundLifecycleEvent(definition, received, {
        ...context,
        tenantId: "tenant-b",
      }),
    ).rejects.toThrow("tenant mismatch");
    await expect(
      deliverInboundLifecycleEvent(
        definition,
        { ...received, raw: {} },
        context,
      ),
    ).rejects.toThrow("Invalid Inbound");
    await expect(
      deliverInboundLifecycleEvent(undefined, received, context),
    ).rejects.toThrow("unavailable");
    const controller = new AbortController();
    controller.abort(new Error("cancelled by host"));
    await expect(
      deliverInboundLifecycleEvent(definition, received, {
        ...context,
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled by host");
    expect(handle).not.toHaveBeenCalled();
  });
  it("does not acknowledge a failed consumer transaction", async () => {
    const { deliverInboundLifecycleEvent } = await import(
      new URL("../reference/inbound-lifecycle.mjs", import.meta.url).href
    );
    const failure = new Error("transaction rejected");
    await expect(
      deliverInboundLifecycleEvent(
        {
          schemaVersion: "1",
          handle: async () => {
            throw failure;
          },
        },
        received,
        { tenantId: "tenant-a", signal: new AbortController().signal },
      ),
    ).rejects.toBe(failure);
  });
  it.each([
    received.change,
    {
      type: "correlated",
      disposition: "joined",
      threadId: "thread-2",
      reason: "Same source correlation key",
    },
    { type: "correlated", disposition: "suppressed" },
    {
      type: "investigation_updated",
      threadId: "thread-2",
      turnId: "turn-1",
      status: "completed",
    },
    {
      type: "writeback_updated",
      operationId: "writeback-1",
      status: "succeeded",
    },
    { type: "deleted" },
  ])(
    "accepts the bounded $type envelope in runtime and JSON Schema",
    (change) => {
      const event = { ...received, change };
      expect(validateInboundLifecycleEvent(event)).toEqual([]);
      expect(isInboundLifecycleEvent(event)).toBe(true);
      expect(schemaValidate(event)).toBe(true);
    },
  );

  it.each([
    null,
    [],
    "event",
    { ...received, credentials: "not-a-secret" },
    { ...received, tenantId: "tenant-a\n" },
    { ...received, eventId: "" },
    { ...received, inboundId: 42 },
    { ...received, change: { type: "correlated", disposition: "joined" } },
    { ...received, revision: 0 },
    { ...received, sourceSystemId: undefined },
    { ...received, bindingRevision: 0 },
    { ...received, revision: 1.5 },
    { ...received, revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...received, revision: "1" },
    { ...received, occurredAt: "2026-02-30T09:10:11.000Z" },
    { ...received, occurredAt: "2026-10-16T09:10:11.000Z\n" },
    { ...received, occurredAt: "2026-10-16T09:10:11+00:00" },
    { ...received, change: { type: "received", title: "x".repeat(2001) } },
    { ...received, change: { type: "received", title: 42 } },
    {
      ...received,
      change: { type: "received", title: "x", description: "x".repeat(32769) },
    },
    { ...received, change: { type: "received", title: "x", raw: {} } },
    { ...received, change: { type: "received" } },
    { ...received, change: { type: "correlated", disposition: "guess" } },
    {
      ...received,
      change: { type: "investigation_updated", status: "completed" },
    },
    { ...received, change: { type: "deleted", title: "deleted content" } },
    {
      ...received,
      change: { type: "writeback_updated", operationId: "w", status: "done" },
    },
    { ...received, schemaVersion: "2" },
    { ...received, sourceEventId: undefined },
    { change: received.change },
  ])("rejects malformed or unbounded events consistently", (value) => {
    expect(validateInboundLifecycleEvent(value).length).toBeGreaterThan(0);
    expect(isInboundLifecycleEvent(value)).toBe(false);
    expect(schemaValidate(value)).toBe(false);
  });

  it.each([
    ["2000-02-29T00:00:00.000Z", true],
    ["2024-02-29T23:59:59.999Z", true],
    ["2400-02-29T12:00:00.000Z", true],
    ["0000-02-29T00:00:00.000Z", true],
    ["1900-02-29T00:00:00.000Z", false],
    ["2100-02-29T00:00:00.000Z", false],
    ["2026-04-31T00:00:00.000Z", false],
    ["2026-11-31T00:00:00.000Z", false],
    ["2026-01-01T24:00:00.000Z", false],
    ["2026-01-01T12:60:00.000Z", false],
    ["2026-01-01T12:00:60.000Z", false],
    ["2026-00-01T12:00:00.000Z", false],
    ["2026-01-00T12:00:00.000Z", false],
  ])(
    "asserts calendar validity without JSON Schema format support: %s",
    (occurredAt, valid) => {
      const event = { ...received, occurredAt };
      expect(isInboundLifecycleEvent(event)).toBe(valid);
      expect(schemaValidate(event)).toBe(valid);
    },
  );
  it("supports Unicode content at the character boundary", () => {
    const value = {
      ...received,
      change: { type: "received", title: "🐇".repeat(2000) },
    };
    expect(isInboundLifecycleEvent(value)).toBe(true);
    expect(schemaValidate(value)).toBe(true);
  });

  it("rejects inherited envelope fields rather than accepting prototype identity", () => {
    const value = Object.assign(
      Object.create({ tenantId: received.tenantId }),
      received,
    );
    delete value.tenantId;
    expect(validateInboundLifecycleEvent(value)).toContainEqual(
      expect.objectContaining({ path: "$.tenantId", code: "required" }),
    );
  });

  it("validates explicit declaration and handler parity", () => {
    const handler = {
      schemaVersion: "1" as const,
      handle: vi.fn(async () => {}),
    };
    expect(validateManifest(manifest).issues).toEqual([]);
    expect(
      validateRegistration(manifest, { inboundLifecycle: handler }),
    ).toEqual([]);
    expect(handler.handle).not.toHaveBeenCalled();
    expect(validateRegistration(manifest, {})).toContainEqual(
      expect.objectContaining({ code: "missing-registration" }),
    );
    expect(
      validateRegistration(
        { ...manifest, capabilities: { database: { mode: "plugin_schema" } } },
        { inboundLifecycle: handler },
      ),
    ).toContainEqual(
      expect.objectContaining({ code: "undeclared-capability" }),
    );
  });

  it("rejects invalid capability versions, extra properties and handlers", () => {
    expect(
      validateManifest({
        ...manifest,
        capabilities: { inboundLifecycle: { schemaVersion: "2" } },
      }).issues.length,
    ).toBeGreaterThan(0);
    expect(
      validateManifest({
        ...manifest,
        capabilities: {
          inboundLifecycle: { schemaVersion: "1", allowAllTenants: true },
        },
      }).issues.length,
    ).toBeGreaterThan(0);
    expect(
      validateRegistration(manifest, {
        inboundLifecycle: { schemaVersion: "1" },
      } as never),
    ).toContainEqual(expect.objectContaining({ code: "invalid-registration" }));
    expect(
      validateRegistration(manifest, {
        inboundLifecycle: { schemaVersion: "2", handle: async () => {} },
      } as never),
    ).toContainEqual(expect.objectContaining({ code: "metadata-mismatch" }));
  });
});
