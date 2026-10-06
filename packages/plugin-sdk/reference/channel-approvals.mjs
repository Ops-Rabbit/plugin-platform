import assert from "node:assert/strict";
import {
  isChannelApprovalDecision,
  isChannelApprovalCleanup,
} from "@opsrabbit/plugin-sdk";
import decisionSchema from "@opsrabbit/plugin-sdk/channel-approval-decision-schema" with { type: "json" };
import cleanupSchema from "@opsrabbit/plugin-sdk/channel-approval-cleanup-schema" with { type: "json" };

assert.deepEqual(decisionSchema.properties.decision.enum, [
  "allow-once",
  "deny",
]);
assert.equal(Object.hasOwn(cleanupSchema.properties, "command"), false);

// This reference verifies consumer behavior with host/provider stubs. It does
// not prove a host's authorization, leases, atomic audit or concurrency logic.
// Provider.remove must verify the installation/author, returning already_absent
// only for definitive absence; lack of access is a failure, never absence.
export async function cleanup(service, provider) {
  const work = await service.claimCleanups();
  const failures = [];
  for (const item of work) {
    if (!isChannelApprovalCleanup(item))
      throw new TypeError("Invalid channel approval cleanup.");
    try {
      const recovered = item.uncertain ? await provider.recover(item) : null;
      if (
        item.uncertain &&
        !isChannelApprovalCleanup({
          ...item,
          messageId: recovered?.messageId,
          receiptMessageId: recovered?.receiptMessageId,
        })
      )
        throw new TypeError("Invalid recovered cleanup locators.");
      let deleted = false;
      for (const messageId of new Set([
        item.messageId,
        item.receiptMessageId,
        recovered?.messageId ?? null,
        recovered?.receiptMessageId ?? null,
      ])) {
        if (messageId === null) continue;
        const outcome = await provider.remove({
          workspaceId: item.workspaceId,
          botUserId: item.botUserId,
          externalConversationKey: item.externalConversationKey,
          messageId,
        });
        if (outcome !== "deleted" && outcome !== "already_absent")
          throw new TypeError("Invalid provider cleanup outcome.");
        deleted ||= outcome === "deleted";
      }
      await service.completeCleanup({
        cleanupId: item.cleanupId,
        claimToken: item.claimToken,
        outcome: deleted ? "deleted" : "already_absent",
      });
    } catch (error) {
      await service.failCleanup({
        cleanupId: item.cleanupId,
        claimToken: item.claimToken,
        code: "provider_error",
      });
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      "Channel cleanup requires reconciliation.",
    );
}

// A provider adapter supplies these fields only after checking its authenticated
// interaction, active human actor and current conversation access.
export async function decide(service, verifiedInteraction) {
  if (!isChannelApprovalDecision(verifiedInteraction)) {
    throw new TypeError("Invalid channel approval interaction.");
  }
  const result = await service.resolve(verifiedInteraction);
  return {
    changed: result.applied,
    text: result.actor
      ? `${result.state} by ${result.actor.displayName} (${result.actor.userId})`
      : result.state,
  };
}

const input = {
  schemaVersion: "1",
  deliveryId: "delivery-1",
  externalConversationKey: "C1:123.456",
  messageId: "123.457",
  botUserId: "UBOT",
  decision: "allow-once",
  actor: {
    provider: "slack",
    workspaceId: "T1",
    userId: "U2",
    displayName: "Reviewer",
  },
};
const result = await decide(
  {
    async resolve(decision) {
      assert.equal(decision.actor.userId, "U2");
      return {
        applied: true,
        state: "approved",
        actor: decision.actor,
        resolvedAt: "2026-10-06T00:00:00.000Z",
      };
    },
  },
  input,
);
assert.deepEqual(result, { changed: true, text: "approved by Reviewer (U2)" });
const loser = await decide(
  {
    async resolve() {
      return {
        applied: false,
        state: "approved",
        actor: input.actor,
        resolvedAt: "2026-10-06T00:00:00.000Z",
      };
    },
  },
  { ...input, decision: "deny", actor: { ...input.actor, userId: "U3" } },
);
assert.equal(loser.changed, false);
assert.equal(loser.text, "approved by Reviewer (U2)");

const cleanupWork = {
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
const removed = [];
const completed = [];
await cleanup(
  {
    async claimCleanups() {
      return [cleanupWork];
    },
    async completeCleanup(value) {
      completed.push(value);
    },
    async failCleanup() {
      assert.fail("Successful cleanup must not fail.");
    },
  },
  {
    async remove(locator) {
      removed.push(locator.messageId);
      return "deleted";
    },
  },
);
assert.deepEqual(removed, ["123.457", "123.458"]);
assert.deepEqual(completed, [
  { cleanupId: "cleanup-1", claimToken: "lease-1", outcome: "deleted" },
]);
