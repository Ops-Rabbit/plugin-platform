import { Ajv2020 } from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CHANNEL_MESSAGING_INPUT_SCHEMA,
  isChannelMessagingInput,
  validateChannelMessagingInput,
} from "../src/index.js";

const valid = {
  instanceId: "slack-main",
  channelId: "C123",
  text: "Deployment complete",
};
const schema = new Ajv2020({ strict: true, allErrors: true }).compile(
  CHANNEL_MESSAGING_INPUT_SCHEMA,
);

describe("channel messaging contract", () => {
  it("ships the same schema used at the runtime boundary", () => {
    const shipped = JSON.parse(
      readFileSync(
        new URL(
          "../schemas/opsrabbit-channel-messaging-input.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(shipped).toEqual(CHANNEL_MESSAGING_INPUT_SCHEMA);
  });
  it.each([
    valid,
    { ...valid, threadId: "1700000000.000123" },
    { ...valid, text: "完成 ✅" },
    { ...valid, text: "a".repeat(4000) },
  ])("accepts bounded messages", (input) => {
    expect(validateChannelMessagingInput(input)).toEqual([]);
    expect(isChannelMessagingInput(input)).toBe(true);
    expect(schema(input)).toBe(true);
  });
  it.each([
    null,
    { ...valid, threadId: "" },
    { ...valid, threadId: null },
    { ...valid, threadId: "root\n" },
    { ...valid, threadId: "x".repeat(161) },
    [],
    {},
    { ...valid, instanceId: "slack-main\n" },
    { ...valid, channelId: "C123\r" },
    { ...valid, text: " " },
    { ...valid, text: "a".repeat(4001) },
    { ...valid, text: 123 },
    { ...valid, token: "forbidden" },
    { ...valid, agent: "admin" },
    { ...valid, tenantId: "other" },
    { ...valid, thread_ts: "123.456" },
    { ...valid, instanceId: "x".repeat(161) },
  ])(
    "rejects malformed or authority-bearing arguments with schema parity",
    (input) => {
      expect(validateChannelMessagingInput(input).length).toBeGreaterThan(0);
      expect(isChannelMessagingInput(input)).toBe(false);
      expect(schema(input)).toBe(false);
    },
  );
  it("forwards an explicit root only to a broker supporting replies", async () => {
    const { sendChannelMessage } = await import(
      new URL("../reference/channel-messaging.mjs", import.meta.url).href
    );
    const sendMessage = vi.fn(async () => ({
      channelId: "C123",
      messageId: "1700000001.000001",
      threadId: "1700000000.000123",
    }));
    const input = { ...valid, threadId: "1700000000.000123" };
    await expect(
      sendChannelMessage(
        { messaging: { schemaVersion: "1", sendMessage } },
        input,
      ),
    ).rejects.toThrow("Thread replies are unavailable");
    expect(sendMessage).not.toHaveBeenCalled();
    await expect(
      sendChannelMessage(
        {
          messaging: {
            schemaVersion: "1",
            supportsThreadReplies: true,
            sendMessage,
          },
        },
        input,
      ),
    ).resolves.toMatchObject({ threadId: input.threadId });
    expect(sendMessage).toHaveBeenCalledWith(input);
  });
  it("runs the reference against an invocation-bound broker", async () => {
    const { sendChannelMessage } = await import(
      new URL("../reference/channel-messaging.mjs", import.meta.url).href
    );
    const sendMessage = vi.fn(async () => ({
      channelId: "C123",
      messageId: "123.456",
    }));
    await expect(
      sendChannelMessage(
        { messaging: { schemaVersion: "1", sendMessage } },
        valid,
      ),
    ).resolves.toEqual({ channelId: "C123", messageId: "123.456" });
    await expect(sendChannelMessage({}, valid)).rejects.toThrow("unavailable");
    expect(sendMessage).toHaveBeenCalledWith(valid);
    sendMessage.mockClear();
    await expect(
      sendChannelMessage(
        { messaging: { schemaVersion: "1", sendMessage } },
        { ...valid, token: "forbidden" },
      ),
    ).rejects.toThrow("Invalid channel message input");
    await expect(
      sendChannelMessage(
        { messaging: { schemaVersion: "1", sendMessage } },
        { ...valid, text: " " },
      ),
    ).rejects.toThrow("Invalid channel message input");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
