import { describe, expect, it, vi } from "vitest";
import {
  isPluginAgentRunRevision,
  isPluginAgentRunSettled,
  parsePluginAgentRunObservationEventV1,
  parsePluginAgentRunStateV1,
  PLUGIN_AGENT_RUN_STATE_MAX_BYTES,
  PluginValidationError,
} from "../src/index.js";
import { createTestAgentRunObservationService } from "../src/testing/index.js";

const runId = "00000000-0000-4000-8000-000000000001";
const queued = {
  runId,
  bindingId: "summarize",
  status: "queued",
  progressCode: "queued",
  deliveryStatus: null,
  result: null,
  errorCode: null,
  createdAt: "2026-10-15T00:00:00.000Z",
  startedAt: null,
  endedAt: null,
};
const succeeded = {
  ...queued,
  status: "succeeded",
  progressCode: "delivering_result",
  deliveryStatus: "pending",
  result: {
    kind: "execution_v1",
    requestDigest: "a".repeat(64),
    output: { summary: "Synthetic summary." },
  },
  startedAt: "2026-10-15T00:00:01.000Z",
  endedAt: "2026-10-15T00:00:02.000Z",
};
const state = (snapshot: Record<string, unknown>, revision = "1") => ({
  schemaVersion: "1",
  revision,
  snapshot,
});

describe("agent run observation contract", () => {
  it("accepts consistent states across the run lifecycle", () => {
    for (const snapshot of [
      queued,
      {
        ...queued,
        status: "running",
        progressCode: "preparing_result",
        startedAt: "2026-10-15T00:00:01.000Z",
      },
      succeeded,
      {
        ...succeeded,
        deliveryStatus: "delivery_failed",
        errorCode: "DELIVERY_FAILED",
      },
      {
        ...queued,
        status: "failed",
        errorCode: "DEADLINE_EXCEEDED",
        endedAt: "2026-10-15T00:30:00.000Z",
      },
      { ...queued, status: "cancelled", endedAt: "2026-10-15T00:00:03.000Z" },
      {
        ...queued,
        status: "access_revoked",
        progressCode: "delivering_result",
        errorCode: "ACCESS_REVOKED",
        endedAt: "2026-10-15T00:00:03.000Z",
      },
    ])
      expect(
        parsePluginAgentRunStateV1(state(snapshot)),
        JSON.stringify(snapshot),
      ).toEqual(state(snapshot));
  });

  it("never carries the run request and stays within the transport ceiling", () => {
    expect(() =>
      parsePluginAgentRunStateV1(
        state({
          ...succeeded,
          result: { ...succeeded.result, request: { inputs: {} } },
        }),
      ),
    ).toThrow(PluginValidationError);
    const large = {
      ...succeeded,
      result: {
        ...succeeded.result,
        output: "x".repeat(PLUGIN_AGENT_RUN_STATE_MAX_BYTES),
      },
    };
    expect(() => parsePluginAgentRunStateV1(state(large))).toThrow(
      PluginValidationError,
    );
  });

  it("rejects inconsistent status, error, delivery and time combinations", () => {
    for (const snapshot of [
      { ...succeeded, errorCode: "EXECUTION_FAILED" },
      { ...succeeded, endedAt: null },
      { ...succeeded, progressCode: "queued" },
      { ...succeeded, deliveryStatus: null },
      { ...succeeded, result: null },
      { ...succeeded, endedAt: "2026-10-14T23:59:59.000Z" },
      { ...queued, status: "failed", endedAt: "2026-10-15T00:00:03.000Z" },
      { ...queued, startedAt: "2026-10-15T00:00:01.000Z" },
      { ...queued, status: "running", progressCode: "running" },
      { ...queued, deliveryStatus: "pending" },
      { ...queued, bindingId: "Bad id" },
      { ...queued, runId: "run-1" },
      { ...queued, createdAt: "2026-10-15T00:00:00Z" },
      { ...queued, taskId: "summarize" },
      { ...succeeded, result: { ...succeeded.result, requestDigest: "x" } },
      { ...succeeded, result: { ...succeeded.result, kind: "execution_v2" } },
    ])
      expect(
        () => parsePluginAgentRunStateV1(state(snapshot)),
        JSON.stringify(snapshot),
      ).toThrow(PluginValidationError);
    for (const revision of ["0", "01", "-1", "9223372036854775808", 1])
      expect(isPluginAgentRunRevision(revision)).toBe(false);
    expect(isPluginAgentRunRevision("9223372036854775807")).toBe(true);
  });

  it("validates control events and the settled rule", () => {
    for (const event of [
      { type: "state", state: state(queued) },
      { type: "connection", state: "live" },
      { type: "closed", reason: "access_ended" },
    ])
      expect(parsePluginAgentRunObservationEventV1(event)).toEqual(event);
    for (const event of [
      { type: "connection", state: "offline" },
      { type: "closed", reason: "settled", extra: true },
      { type: "progress", percent: 50 },
    ])
      expect(() => parsePluginAgentRunObservationEventV1(event)).toThrow(
        PluginValidationError,
      );
    expect(isPluginAgentRunSettled(succeeded)).toBe(false);
    expect(
      isPluginAgentRunSettled({ ...succeeded, deliveryStatus: "delivered" }),
    ).toBe(true);
    expect(isPluginAgentRunSettled({ ...queued, status: "cancelled" })).toBe(
      true,
    );
  });
});

describe("agent run observation fixture", () => {
  it("ends an observation on closed, error, throwing callback or abort", () => {
    const controller = new AbortController();
    const fixture = createTestAgentRunObservationService(controller.signal);
    const observer = () => ({ onEvent: vi.fn(), onError: vi.fn() });
    const closedObserver = observer();
    fixture.service.observe({ runId }, closedObserver);
    fixture.emit(runId, { type: "state", state: state(queued) as never });
    fixture.emit(runId, { type: "closed", reason: "settled" });
    fixture.emit(runId, { type: "connection", state: "live" });
    expect(closedObserver.onEvent).toHaveBeenCalledTimes(2);
    expect(fixture.activeCount).toBe(0);

    const failing = observer();
    fixture.service.observe({ runId }, failing);
    fixture.fail(runId, new Error("Unavailable"));
    expect(failing.onError).toHaveBeenCalledTimes(1);
    expect(fixture.activeCount).toBe(0);

    const throwing = {
      onEvent: vi.fn(() => {
        throw new Error("render failed");
      }),
      onError: vi.fn(),
    };
    fixture.service.observe({ runId }, throwing);
    fixture.emit(runId, { type: "connection", state: "live" });
    expect(fixture.activeCount).toBe(0);

    const handle = fixture.service.observe({ runId }, observer());
    expect(fixture.activeCount).toBe(1);
    controller.abort();
    handle.close();
    expect(fixture.activeCount).toBe(0);
    expect(() => fixture.emit(runId, { type: "progress" } as never)).toThrow(
      PluginValidationError,
    );
  });
});
