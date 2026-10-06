import assert from "node:assert/strict";
import { isChannelApprovalDecision } from "@opsrabbit/plugin-sdk";
import decisionSchema from "@opsrabbit/plugin-sdk/channel-approval-decision-schema" with { type: "json" };

assert.deepEqual(decisionSchema.properties.decision.enum, [
  "allow-once",
  "deny",
]);

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
