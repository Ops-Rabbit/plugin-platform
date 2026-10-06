import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it, vi } from "vitest";
import {
  CHANNEL_APPROVAL_CLEANUP_SCHEMA,
  isChannelApprovalCleanup,
  validateChannelApprovalCleanup,
} from "../src/index.js";
import type { ChannelApprovalCleanupV1 } from "../src/index.js";

const job: ChannelApprovalCleanupV1 = {
  schemaVersion: "1",
  cleanupId: "cleanup-1",
  claimToken: "lease-1",
  deliveryId: "delivery-1",
  externalConversationKey: "C1:123.456",
  workspaceId: "T1",
  botUserId: "UBOT",
  messageId: "123.457",
  receiptMessageId: "123.458",
  uncertain: false,
};
const schema = new Ajv2020({ strict: true, allErrors: true }).compile(
  CHANNEL_APPROVAL_CLEANUP_SCHEMA,
);
const referenceUrl = new URL(
  "../reference/channel-approvals.mjs",
  import.meta.url,
).href;
const { cleanup } = await import(referenceUrl);

describe("channel parent-deletion cleanup boundary", () => {
  it("ships the same public schema and accepts minimal known or uncertain locators", () => {
    const shipped = JSON.parse(
      readFileSync(
        new URL(
          "../schemas/opsrabbit-channel-approval-cleanup.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(shipped).toEqual(CHANNEL_APPROVAL_CLEANUP_SCHEMA);
    for (const input of [
      job,
      { ...job, messageId: null, receiptMessageId: null, uncertain: true },
    ]) {
      expect(validateChannelApprovalCleanup(input)).toEqual([]);
      expect(isChannelApprovalCleanup(input)).toBe(true);
      expect(schema(input)).toBe(true);
    }
  });

  it.each([
    null,
    [],
    {},
    { ...job, schemaVersion: "2" },
    { ...job, cleanupId: "" },
    { ...job, claimToken: "lease\n" },
    { ...job, deliveryId: "wrong id" },
    { ...job, workspaceId: "x".repeat(161) },
    { ...job, botUserId: 1 },
    { ...job, externalConversationKey: "" },
    { ...job, externalConversationKey: "x".repeat(257) },
    { ...job, messageId: undefined },
    { ...job, receiptMessageId: "" },
    { ...job, uncertain: "false" },
    { ...job, command: "deleted customer command" },
    { ...job, actor: { userId: "U1" } },
    { ...job, tenantId: "another-tenant" },
  ])(
    "rejects malformed work, customer content and caller-chosen scope",
    (input) => {
      expect(validateChannelApprovalCleanup(input).length).toBeGreaterThan(0);
      expect(isChannelApprovalCleanup(input)).toBe(false);
      expect(schema(input)).toBe(false);
    },
  );
});

function setup(input = job) {
  const messages = new Set(["123.457", "123.458", "123.459"]);
  const service = {
    claimCleanups: vi.fn(async () => [input]),
    completeCleanup: vi.fn(async () => undefined),
    failCleanup: vi.fn(async () => undefined),
  };
  const provider = {
    recover: vi.fn(
      async (): Promise<unknown> => ({
        messageId: "123.457",
        receiptMessageId: "123.458",
      }),
    ),
    remove: vi.fn(async (locator: { messageId: string }) =>
      messages.delete(locator.messageId) ? "deleted" : "already_absent",
    ),
    post: vi.fn(),
  };
  return { service, provider };
}

describe("executable cleanup consumer reference", () => {
  it("removes both card and receipt before acknowledging, without posting deleted content", async () => {
    const { service, provider } = setup();
    await cleanup(service, provider);
    expect(
      provider.remove.mock.calls.map(([locator]) => locator.messageId),
    ).toEqual(["123.457", "123.458"]);
    expect(service.completeCleanup).toHaveBeenCalledWith({
      cleanupId: "cleanup-1",
      claimToken: "lease-1",
      outcome: "deleted",
    });
    expect(provider.post).not.toHaveBeenCalled();
  });

  it("acknowledges definitive already-absent messages idempotently", async () => {
    const { service, provider } = setup();
    provider.remove.mockResolvedValue("already_absent");
    await cleanup(service, provider);
    expect(service.completeCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "already_absent" }),
    );
  });

  it("does not claim success when removal of the receipt fails", async () => {
    const { service, provider } = setup();
    provider.remove
      .mockResolvedValueOnce("deleted")
      .mockRejectedValueOnce(new Error("provider access denied"));
    await expect(cleanup(service, provider)).rejects.toThrow("reconciliation");
    expect(service.completeCleanup).not.toHaveBeenCalled();
    expect(service.failCleanup).toHaveBeenCalledWith({
      cleanupId: "cleanup-1",
      claimToken: "lease-1",
      code: "provider_error",
    });
  });

  it("recovers unknown posts before removal and never replaces the missing card", async () => {
    const { service, provider } = setup({
      ...job,
      messageId: null,
      receiptMessageId: null,
      uncertain: true,
    });
    await cleanup(service, provider);
    expect(provider.recover).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: "delivery-1" }),
    );
    expect(
      provider.remove.mock.calls.map(([locator]) => locator.messageId),
    ).toEqual(["123.457", "123.458"]);
    expect(provider.post).not.toHaveBeenCalled();
  });

  it("does not turn failed readback into successful cleanup", async () => {
    const { service, provider } = setup({ ...job, uncertain: true });
    provider.recover.mockRejectedValue(new Error("readback unavailable"));
    await expect(cleanup(service, provider)).rejects.toThrow("reconciliation");
    expect(provider.remove).not.toHaveBeenCalled();
    expect(service.completeCleanup).not.toHaveBeenCalled();
  });

  it("preserves known card and receipt IDs when readback finds different or absent messages", async () => {
    const { service, provider } = setup({ ...job, uncertain: true });
    provider.recover.mockResolvedValue({
      messageId: "123.459",
      receiptMessageId: null,
    });
    await cleanup(service, provider);
    expect(
      provider.remove.mock.calls.map(([locator]) => locator.messageId),
    ).toEqual(["123.457", "123.458", "123.459"]);
    expect(service.completeCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "deleted" }),
    );
    expect(provider.post).not.toHaveBeenCalled();
  });

  it("does not accept an incomplete recovered-locator response as proof of absence", async () => {
    const { service, provider } = setup({ ...job, uncertain: true });
    provider.recover.mockResolvedValue({});
    await expect(cleanup(service, provider)).rejects.toThrow("reconciliation");
    expect(provider.remove).not.toHaveBeenCalled();
    expect(service.completeCleanup).not.toHaveBeenCalled();
  });
});
