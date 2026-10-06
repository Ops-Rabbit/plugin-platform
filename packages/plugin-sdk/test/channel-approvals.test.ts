import { Ajv2020 } from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHANNEL_APPROVAL_DECISION_SCHEMA,
  isChannelApprovalDecision,
  validateChannelApprovalDecision,
} from "../src/index.js";

const valid = {
  schemaVersion: "1",
  deliveryId: "delivery-1",
  externalConversationKey: "C1:123.456",
  messageId: "123.457",
  botUserId: "UBOT",
  decision: "allow-once",
  actor: {
    provider: "slack",
    workspaceId: "T1",
    userId: "U1",
    displayName: "Alex",
  },
};
const schema = new Ajv2020({ strict: true, allErrors: true }).compile(
  CHANNEL_APPROVAL_DECISION_SCHEMA,
);

describe("channel approval external decision boundary", () => {
  it("ships a JSON Schema identical to the exported runtime boundary", () => {
    const shipped = JSON.parse(
      readFileSync(
        new URL(
          "../schemas/opsrabbit-channel-approval-decision.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(shipped).toEqual(CHANNEL_APPROVAL_DECISION_SCHEMA);
  });
  it.each([
    valid,
    { ...valid, decision: "deny" },
    { ...valid, actor: { ...valid.actor, displayName: "李明" } },
  ])(
    "accepts one-time decisions with independently identified actors",
    (input) => {
      expect(validateChannelApprovalDecision(input)).toEqual([]);
      expect(isChannelApprovalDecision(input)).toBe(true);
      expect(schema(input)).toBe(true);
    },
  );

  it.each([
    null,
    [],
    "allow-once",
    {},
    { ...valid, schemaVersion: "2" },
    { ...valid, decision: "allow-always" },
    { ...valid, systemActor: true },
    { ...valid, tenantId: "another-tenant" },
    { ...valid, actor: null },
    { ...valid, actor: [] },
    { ...valid, actor: { ...valid.actor, userId: "" } },
    { ...valid, actor: { ...valid.actor, workspaceId: " T1" } },
    { ...valid, actor: { ...valid.actor, displayName: "" } },
    { ...valid, actor: { ...valid.actor, displayName: "x".repeat(161) } },
    { ...valid, actor: { ...valid.actor, role: "admin" } },
    { ...valid, actor: { ...valid.actor, provider: "Slack" } },
    { ...valid, deliveryId: "a".repeat(161) },
    { ...valid, messageId: " x" },
    { ...valid, botUserId: 123 },
    { ...valid, externalConversationKey: "" },
    { ...valid, externalConversationKey: "x".repeat(257) },
    { ...valid, deliveryId: "delivery-1\n" },
    { ...valid, messageId: "123.457\r" },
    { ...valid, botUserId: "UBOT\n" },
    { ...valid, actor: { ...valid.actor, provider: "slack\n" } },
    { ...valid, actor: { ...valid.actor, workspaceId: "T1\u2028" } },
    { ...valid, actor: { ...valid.actor, userId: "U1\u2029" } },
  ])(
    "rejects malformed and privilege-bearing input with schema parity",
    (input) => {
      expect(validateChannelApprovalDecision(input).length).toBeGreaterThan(0);
      expect(isChannelApprovalDecision(input)).toBe(false);
      expect(schema(input)).toBe(false);
    },
  );
});
