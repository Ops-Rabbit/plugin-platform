import { Ajv2020 } from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createChannelMessagingReferencesHarness } from "../src/testing/index.js";
import {
  type ChannelMessagingReferenceV1,
  CHANNEL_MESSAGING_REFERENCE_REQUEST_SCHEMA,
  CHANNEL_MESSAGING_REFERENCE_RESULT_SCHEMA,
  validateChannelMessagingReferenceRequest,
  validateChannelMessagingReferenceResult,
} from "../src/index.js";

const destination = {
  kind: "destination",
  channelId: "teams:channel1",
} as const;
const sent = {
  kind: "sent_message",
  channelId: "wa:chat1",
  messageId: "ABC123",
} as const;
const routing = {
  provider: "teams" as const,
  serviceUrl: "https://smba.trafficmanager.net/amer/",
  conversationId: "19:channel@thread.tacv2",
  providerTenantId: "tenant-provider",
  teamId: "team1",
  botId: "bot1",
};
const destinationResult = { ...destination, routing };
const sentResult = { ...sent, text: "Deployment complete ✅" };
const ajv = new Ajv2020({ strict: true, allErrors: true });
const requestSchema = ajv.compile(CHANNEL_MESSAGING_REFERENCE_REQUEST_SCHEMA);
const resultSchema = ajv.compile(CHANNEL_MESSAGING_REFERENCE_RESULT_SCHEMA);

describe("channel messaging references", () => {
  it.each([
    ["request", CHANNEL_MESSAGING_REFERENCE_REQUEST_SCHEMA],
    ["result", CHANNEL_MESSAGING_REFERENCE_RESULT_SCHEMA],
  ])("ships the %s schema unchanged", (name, schema) => {
    expect(
      JSON.parse(
        readFileSync(
          new URL(
            `../schemas/opsrabbit-channel-messaging-reference-${name}.schema.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    ).toEqual(schema);
  });
  it.each([destination, sent])("accepts exact lookups", (input) => {
    expect(validateChannelMessagingReferenceRequest(input)).toEqual([]);
    expect(requestSchema(input)).toBe(true);
  });
  it.each([
    null,
    [],
    {},
    { ...destination, kind: "history" },
    { ...destination, channelId: "x\n" },
    { ...destination, channelId: "x".repeat(161) },
    { ...destination, channelId: "123@g.us" },
    { ...destination, instanceId: "other" },
    { ...sent, tenantId: "other" },
    { ...sent, messageId: "" },
    { ...destination, messageId: "ABC" },
    { ...sent, messageId: "id\n" },
    { ...sent, messageId: 2 },
  ])("rejects malformed or authority-bearing lookups", (input) => {
    expect(
      validateChannelMessagingReferenceRequest(input).length,
    ).toBeGreaterThan(0);
    expect(requestSchema(input)).toBe(false);
  });
  it.each([
    null,
    destinationResult,
    sentResult,
    { ...sentResult, text: "✅".repeat(4000) },
  ])("accepts bounded results", (input) => {
    expect(validateChannelMessagingReferenceResult(input)).toEqual([]);
    expect(resultSchema(input)).toBe(true);
  });
  it.each([
    [],
    {},
    { ...destinationResult, kind: "unknown" },
    { ...sentResult, text: " " },
    { ...sentResult, text: "x".repeat(4001) },
    { ...sentResult, text: 1 },
    { ...sentResult, messageId: "" },
    { ...destinationResult, channelId: "bad\n" },
    { ...sentResult, token: "forbidden" },
    { ...destinationResult, routing: null },
    { ...destinationResult, routing: { ...routing, token: "forbidden" } },
    { ...destinationResult, routing: { ...routing, provider: "unknown" } },
    { ...destinationResult, routing: { ...routing, botId: "\n" } },
    { ...destinationResult, routing: { ...routing, teamId: "x".repeat(1025) } },
    ...[
      "http://example.com/",
      "https://user:pass@example.com/",
      "https://example.com/?secret=x",
      "https://example.com/#fragment",
      "https://example.com/\n",
      `https://example.com/${"x".repeat(2048)}`,
    ].map((serviceUrl) => ({
      ...destinationResult,
      routing: { ...routing, serviceUrl },
    })),
  ])("rejects invalid results with schema parity", (input) => {
    expect(
      validateChannelMessagingReferenceResult(input).length,
    ).toBeGreaterThan(0);
    expect(resultSchema(input)).toBe(false);
  });
  it("binds results to exact destination, kind and message", () => {
    expect(
      validateChannelMessagingReferenceResult(destinationResult, destination),
    ).toEqual([]);
    expect(validateChannelMessagingReferenceResult(sentResult, sent)).toEqual(
      [],
    );
    expect(validateChannelMessagingReferenceResult(null, destination)).toEqual(
      [],
    );
    for (const request of [
      { ...sent, messageId: "OTHER" },
      { ...sent, channelId: "other" },
      destination,
    ]) {
      expect(
        validateChannelMessagingReferenceResult(sentResult, request).length,
      ).toBeGreaterThan(0);
    }
    expect(
      validateChannelMessagingReferenceResult(null, { ...sent, messageId: "" })
        .length,
    ).toBeGreaterThan(0);
  });
  it("rejects executable and inherited properties without invoking them", () => {
    const getter = vi.fn(() => "destination");
    const accessor = Object.defineProperty({ channelId: "C1" }, "kind", {
      enumerable: true,
      get: getter,
    });
    const hidden = Object.defineProperty({ ...destination }, "hidden", {
      value: true,
    });
    for (const input of [
      accessor,
      hidden,
      { ...destination, [Symbol("x")]: 1 },
      Object.create(destination),
      new Date(),
    ]) {
      expect(
        validateChannelMessagingReferenceRequest(input).length,
      ).toBeGreaterThan(0);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(
      validateChannelMessagingReferenceResult({
        ...destinationResult,
        routing: accessor,
      }).length,
    ).toBeGreaterThan(0);
  });
  it("keeps fixture lookups exact, detached and bounded", async () => {
    const fixture = { ...sentResult };
    const broker = createChannelMessagingReferencesHarness([
      fixture,
      destinationResult,
    ]);
    fixture.text = "modified";
    const result = await broker.resolve(sent);
    expect(result).toEqual(sentResult);
    if (result?.kind === "sent_message")
      (result as { text: string }).text = "mutated";
    expect(await broker.resolve({ ...sent, messageId: "missing" })).toBeNull();
    expect(await broker.resolve(destination)).toEqual(destinationResult);
    expect(await broker.resolve(sent)).toEqual(sentResult);
    await expect(broker.resolve(sent)).rejects.toThrow("limit");
    await expect(
      createChannelMessagingReferencesHarness([]).resolve({
        ...sent,
        messageId: "",
      }),
    ).rejects.toThrow("Invalid");
    expect(() =>
      createChannelMessagingReferencesHarness([{ ...sentResult, text: "" }]),
    ).toThrow("Invalid");
  });
  it("runs the reference with an adapter-only host broker", async () => {
    const { resolveChannelMessagingReference } = await import(
      new URL("../reference/channel-messaging-references.mjs", import.meta.url)
        .href
    );
    const resolve = vi.fn(
      async (): Promise<ChannelMessagingReferenceV1 | null> => sentResult,
    );
    const context = { messagingReferences: { schemaVersion: "1", resolve } };
    await expect(
      resolveChannelMessagingReference(context, sent),
    ).resolves.toEqual(sentResult);
    await expect(resolveChannelMessagingReference({}, sent)).rejects.toThrow(
      "unavailable",
    );
    await expect(
      resolveChannelMessagingReference(
        { messagingReferences: { schemaVersion: "2", resolve } },
        sent,
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      resolveChannelMessagingReference(context, { ...sent, token: "no" }),
    ).rejects.toThrow("Invalid");
    expect(resolve).toHaveBeenCalledTimes(1);
    resolve.mockResolvedValueOnce({ ...sentResult, messageId: "different" });
    await expect(
      resolveChannelMessagingReference(context, sent),
    ).rejects.toThrow("mismatched");
    resolve.mockResolvedValueOnce(null);
    await expect(
      resolveChannelMessagingReference(context, sent),
    ).resolves.toBeNull();
  });
});
