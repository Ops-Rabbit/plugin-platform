import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  CHAT_TURN_RECORDS_MAX_FEEDBACK_COMMENT_LENGTH,
  CHAT_TURN_RECORDS_MAX_MESSAGE_LENGTH,
  CHAT_TURN_RECORDS_MAX_TURN_IDS,
} from "../src/contracts/chat-turn-records.js";
import {
  CHAT_TURN_RECORDS_REQUEST_SCHEMA,
  CHAT_TURN_RECORDS_RESULT_SCHEMA,
  validateChatTurnRecordsRequest,
  validateChatTurnRecordsResult,
} from "../src/validation/chat-turn-records.js";
import { validateManifest } from "../src/validation/manifest.js";

async function schemaFile(name: string) {
  return JSON.parse(
    await readFile(resolve(import.meta.dirname, `../schemas/${name}`), "utf8"),
  );
}

function compile(schema: unknown) {
  return new Ajv2020({ allErrors: true, strict: true }).compile(
    schema as object,
  );
}

function interactionManifest(
  capabilities: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "policy",
    name: "Policy",
    version: "1.0.0",
    description: "Policy",
    apiVersion: "1.0",
    main: "./dist/index.js",
    minimumOpsRabbitVersion: "0.11.0",
    database: { migrationsPath: "./migrations/sql" },
    localization: {
      schemaVersion: "1",
      defaultLocale: "en",
      supportedLocales: ["en"],
      path: "./locales/messages",
    },
    adminWorkspace: {
      schemaVersion: "1",
      titleKey: "policy.title",
      icon: "receipt",
      tables: [
        {
          id: "queries",
          titleKey: "policy.queries",
          routePath: "/queries",
          rowIdKey: "event_id",
          columns: [{ key: "query", labelKey: "policy.query", format: "text" }],
        },
      ],
    },
    capabilities: {
      database: { mode: "plugin_schema" },
      routes: [{ path: "/queries", requiredRole: "admin" }],
      chatTurnAdmission: { schemaVersion: "1", scope: "deployment" },
      deploymentAdminWorkspace: { schemaVersion: "1" },
      identityDirectory: { read: true },
      audit: { write: true },
      localization: { schemaVersion: "1" },
      chatTurnRecords: { schemaVersion: "1", read: true },
      ...capabilities,
    },
    ...overrides,
  };
}

function withoutCapabilities(
  names: string[],
  overrides: Record<string, unknown> = {},
) {
  const manifest = interactionManifest({}, overrides);
  for (const name of names)
    delete (manifest.capabilities as Record<string, unknown>)[name];
  return manifest;
}

// Each case is valid without chatTurnRecords and fails only its dependency rules. The audit
// case also lacks chatTurnAdmission, because chatTurnAdmission itself requires audit.
const dependencyCases = [
  {
    missing: "chatTurnAdmission",
    manifest: withoutCapabilities(["chatTurnAdmission"]),
  },
  {
    missing: "deploymentAdminWorkspace",
    manifest: (() => {
      const manifest = withoutCapabilities(["deploymentAdminWorkspace"]);
      delete manifest.adminWorkspace;
      return manifest;
    })(),
  },
  {
    missing: "audit",
    manifest: withoutCapabilities(["audit", "chatTurnAdmission"]),
  },
];

const malformedDeclarations = [
  interactionManifest({}, { minimumOpsRabbitVersion: "0.10.0" }),
  (() => {
    const manifest = interactionManifest();
    delete manifest.minimumOpsRabbitVersion;
    return manifest;
  })(),
  interactionManifest({ chatTurnRecords: {} }),
  interactionManifest({ chatTurnRecords: { schemaVersion: "2", read: true } }),
  interactionManifest({ chatTurnRecords: { schemaVersion: "1", read: false } }),
  interactionManifest({
    chatTurnRecords: { schemaVersion: "1", read: true, write: true },
  }),
];

const request = { turnIds: ["turn-1", "turn-2"] };
const turn = {
  turnId: "turn-1",
  threadId: "thread-1",
  userMessage: "How do I reset my password?",
  userMessageTruncated: false,
  feedback: "thumbs_up",
  feedbackUpdatedAt: "2026-10-16T09:00:00.000Z",
};
const resultCorpus: Array<{ name: string; value: unknown; valid: boolean }> = [
  { name: "complete", value: { turns: [turn] }, valid: true },
  { name: "empty", value: { turns: [] }, valid: true },
  {
    name: "deleted message",
    value: {
      turns: [
        { ...turn, userMessage: null, feedback: null, feedbackUpdatedAt: null },
      ],
    },
    valid: true,
  },
  {
    name: "extra top-level key",
    value: { turns: [], debug: { sql: "select" } },
    valid: false,
  },
  {
    name: "extra record key",
    value: { turns: [{ ...turn, assistantMessage: "leak" }] },
    valid: false,
  },
  {
    name: "feedback without time",
    value: { turns: [{ ...turn, feedbackUpdatedAt: null }] },
    valid: false,
  },
  {
    name: "time without feedback",
    value: { turns: [{ ...turn, feedback: null }] },
    valid: false,
  },
  {
    name: "truncated missing message",
    value: {
      turns: [{ ...turn, userMessage: null, userMessageTruncated: true }],
    },
    valid: false,
  },
  {
    name: "date-only timestamp",
    value: { turns: [{ ...turn, feedbackUpdatedAt: "2026-10-16" }] },
    valid: false,
  },
  {
    name: "numeric timestamp",
    value: { turns: [{ ...turn, feedbackUpdatedAt: "1" }] },
    valid: false,
  },
  {
    name: "microsecond timestamp",
    value: {
      turns: [{ ...turn, feedbackUpdatedAt: "2026-10-16T09:00:00.123456Z" }],
    },
    valid: true,
  },
  {
    name: "non-dot fraction separator",
    value: {
      turns: [{ ...turn, feedbackUpdatedAt: "2026-10-16T09:00:00X123Z" }],
    },
    valid: false,
  },
  {
    name: "offset timestamp",
    value: {
      turns: [{ ...turn, feedbackUpdatedAt: "2026-10-16T09:00:00+05:30" }],
    },
    valid: false,
  },
  {
    name: "overlong message",
    value: {
      turns: [
        {
          ...turn,
          userMessage: "x".repeat(CHAT_TURN_RECORDS_MAX_MESSAGE_LENGTH + 1),
        },
      ],
    },
    valid: false,
  },
  {
    name: "feedback with comment",
    value: { turns: [{ ...turn, feedbackComment: "Exactly what I needed." }] },
    valid: true,
  },
  {
    name: "feedback with null comment",
    value: { turns: [{ ...turn, feedbackComment: null }] },
    valid: true,
  },
  {
    name: "comment at the bound",
    value: {
      turns: [
        {
          ...turn,
          feedbackComment: "\u{1F600}".repeat(
            CHAT_TURN_RECORDS_MAX_FEEDBACK_COMMENT_LENGTH,
          ),
        },
      ],
    },
    valid: true,
  },
  {
    name: "overlong comment",
    value: {
      turns: [
        {
          ...turn,
          feedbackComment: "x".repeat(
            CHAT_TURN_RECORDS_MAX_FEEDBACK_COMMENT_LENGTH + 1,
          ),
        },
      ],
    },
    valid: false,
  },
  {
    name: "empty comment",
    value: { turns: [{ ...turn, feedbackComment: "" }] },
    valid: false,
  },
  {
    name: "comment without feedback",
    value: {
      turns: [
        {
          ...turn,
          feedback: null,
          feedbackUpdatedAt: null,
          feedbackComment: "Orphaned comment",
        },
      ],
    },
    valid: false,
  },
  {
    name: "non-string comment",
    value: { turns: [{ ...turn, feedbackComment: 42 }] },
    valid: false,
  },
];

describe("chatTurnRecords manifest capability", () => {
  it("accepts the versioned read declaration on an interaction policy", () => {
    const manifest = interactionManifest();
    expect(validateManifest(manifest)).toEqual({
      ok: true,
      value: manifest,
      issues: [],
    });
  });

  it("rejects malformed declarations and hosts older than 0.11.0", () => {
    for (const manifest of malformedDeclarations)
      expect(validateManifest(manifest).ok).toBe(false);
    expect(
      validateManifest(
        interactionManifest({}, { minimumOpsRabbitVersion: "0.10.9" }),
      ).issues.map((entry) => entry.message),
    ).toContain(
      "capabilities.chatTurnRecords requires minimumOpsRabbitVersion 0.11.0 or later.",
    );
    expect(
      validateManifest(
        interactionManifest({}, { minimumOpsRabbitVersion: "1.0.0" }),
      ).ok,
    ).toBe(true);
  });

  it("enforces each dependency through the chatTurnRecords rule itself", () => {
    for (const { missing, manifest } of dependencyCases) {
      const messages = validateManifest(manifest).issues.map(
        (entry) => entry.message,
      );
      expect(messages).toContain(
        `chatTurnRecords requires the ${missing} capability.`,
      );
      // Only chatTurnRecords rules fail; the same manifest without it is valid.
      expect(
        messages.every((message) =>
          message.startsWith("chatTurnRecords requires"),
        ),
      ).toBe(true);
      const withoutRecords = structuredClone(manifest);
      delete (withoutRecords.capabilities as Record<string, unknown>)
        .chatTurnRecords;
      expect(validateManifest(withoutRecords).ok).toBe(true);
    }
  });

  it("matches the published manifest JSON Schema, including each dependency rule", async () => {
    const validate = compile(await schemaFile("opsrabbit-plugin.schema.json"));
    expect(validate(interactionManifest())).toBe(true);
    for (const manifest of malformedDeclarations)
      expect(Boolean(validate(manifest))).toBe(false);
    for (const { manifest } of dependencyCases) {
      expect(Boolean(validate(manifest))).toBe(false);
      const passing = structuredClone(manifest);
      delete (passing.capabilities as Record<string, unknown>).chatTurnRecords;
      expect(validate(passing)).toBe(true);
    }
  });
});

describe("chatTurnRecords request and result validation", () => {
  it("publishes request and result schemas identical to the runtime constants", async () => {
    expect(
      await schemaFile("opsrabbit-chat-turn-records-request.schema.json"),
    ).toEqual(CHAT_TURN_RECORDS_REQUEST_SCHEMA);
    expect(
      await schemaFile("opsrabbit-chat-turn-records-result.schema.json"),
    ).toEqual(CHAT_TURN_RECORDS_RESULT_SCHEMA);
  });

  it("bounds requests to unique stable turn ids, matching the request schema", () => {
    const validate = compile(CHAT_TURN_RECORDS_REQUEST_SCHEMA);
    const tooMany = Array.from(
      { length: CHAT_TURN_RECORDS_MAX_TURN_IDS + 1 },
      (_, index) => `turn-${index}`,
    );
    const corpus = [
      { value: { turnIds: ["turn-1"] }, valid: true },
      { value: null, valid: false },
      { value: { turnIds: [] }, valid: false },
      { value: { turnIds: tooMany }, valid: false },
      { value: { turnIds: ["turn-1", "turn-1"] }, valid: false },
      { value: { turnIds: ["bad id"] }, valid: false },
      { value: { turnIds: ["turn-1\n"] }, valid: false },
      { value: { turnIds: ["turn-1"], extra: true }, valid: false },
    ];
    for (const { value, valid } of corpus) {
      expect(validateChatTurnRecordsRequest(value).length === 0).toBe(valid);
      expect(Boolean(validate(value))).toBe(valid);
    }
    expect(
      validateChatTurnRecordsRequest({
        turnIds: ["turn-1", "turn-1", "bad id", 7],
        extra: true,
      }).map((entry) => entry.code),
    ).toEqual(["unknown_field", "duplicate", "invalid_value", "invalid_value"]);
  });

  it("agrees with the result schema on every structural rule", () => {
    const validate = compile(CHAT_TURN_RECORDS_RESULT_SCHEMA);
    for (const { name, value, valid } of resultCorpus) {
      expect(
        validateChatTurnRecordsResult(value, request).length === 0,
        name,
      ).toBe(valid);
      expect(Boolean(validate(value)), name).toBe(valid);
    }
  });

  it("additionally enforces request membership, order, and real calendar instants", () => {
    const second = { ...turn, turnId: "turn-2" };
    expect(
      validateChatTurnRecordsResult({ turns: [turn, second] }, request),
    ).toEqual([]);
    expect(
      validateChatTurnRecordsResult({ turns: [second, turn] }, request).map(
        (entry) => entry.code,
      ),
    ).toEqual(["order"]);
    expect(
      validateChatTurnRecordsResult({ turns: [turn, turn] }, request).map(
        (entry) => entry.code,
      ),
    ).toEqual(["order"]);
    expect(
      validateChatTurnRecordsResult(
        { turns: [{ ...turn, turnId: "turn-9" }] },
        request,
      )[0]?.path,
    ).toBe("$.turns[0].turnId");
    expect(
      validateChatTurnRecordsResult(
        { turns: [{ ...turn, feedbackUpdatedAt: "2026-02-31T00:00:00Z" }] },
        request,
      )[0]?.path,
    ).toBe("$.turns[0].feedbackUpdatedAt");
    expect(validateChatTurnRecordsResult({}, request)[0]?.code).toBe("type");
    expect(
      validateChatTurnRecordsResult(
        { turns: [turn] },
        { turnIds: ["turn-1", "turn-1"] },
      )[0]?.path,
    ).toBe("$request");
  });
});

describe("chatTurnRecords reference implementation", () => {
  async function reference() {
    return (await import(
      new URL("../reference/chat-turn-records.mjs", import.meta.url).href
    )) as {
      readChatTurnRecords: (
        context: unknown,
        turnIds: string[],
      ) => Promise<{ records: Map<string, unknown>; unavailable: Set<string> }>;
    };
  }

  it("reads in bounded batches, respects the read limit, and isolates a failed batch", async () => {
    const { readChatTurnRecords } = await reference();
    const requests: string[][] = [];
    const turnIds = Array.from({ length: 120 }, (_, index) => `turn-${index}`);
    const result = await readChatTurnRecords(
      {
        chatTurnRecords: {
          async getTurns(input: { turnIds: string[] }) {
            requests.push(input.turnIds);
            if (requests.length === 2)
              throw Object.assign(new Error("busy"), { status: 500 });
            return {
              turns: input.turnIds
                .slice(0, 1)
                .map((turnId) => ({ ...turn, turnId })),
            };
          },
        },
      },
      [...turnIds, "turn-0"],
    );
    expect(requests.map((entry) => entry.length)).toEqual([25, 25, 25, 25]);
    expect([...result.records.keys()]).toEqual([
      "turn-0",
      "turn-50",
      "turn-75",
    ]);
    expect(result.unavailable.has("turn-25")).toBe(true);
    expect(result.unavailable.has("turn-100")).toBe(true);
    expect(result.unavailable.has("turn-0")).toBe(false);
    expect(result.unavailable.size).toBe(45);
  });

  it("marks every row unavailable without a broker or on a contract violation", async () => {
    const { readChatTurnRecords } = await reference();
    expect([
      ...(await readChatTurnRecords({}, ["turn-1"])).unavailable,
    ]).toEqual(["turn-1"]);
    const leaking = {
      chatTurnRecords: {
        async getTurns() {
          return { turns: [{ ...turn, assistantMessage: "leak" }] };
        },
      },
    };
    const result = await readChatTurnRecords(leaking, ["turn-1"]);
    expect(result.records.size).toBe(0);
    expect([...result.unavailable]).toEqual(["turn-1"]);
  });
});
