import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type {
  PluginConnectionsService,
  PluginFormSubmission,
  PluginKnowledgeService,
  PluginManifest,
} from "../src/index.js";
import {
  createAuthorizedTestContext,
  createTestContext,
} from "../src/testing/index.js";
import { validateManifest } from "../src/validation/manifest.js";

const manifest: PluginManifest = {
  id: "mail-reader",
  name: "Mail reader",
  version: "1.0.0",
  description: "Reads one selected mailbox.",
  apiVersion: "1.0",
  main: "./dist/index.js",
  settings: [
    {
      key: "imap_connection_id",
      label: "IMAP connection",
      type: "string",
      required: true,
    },
  ],
  capabilities: {
    scheduledJobs: [{ id: "compile-mail" }],
    knowledge: { read: true, write: true, delete: true },
    connections: {
      selectors: [
        {
          settingKey: "imap_connection_id",
          integrationType: "imap_mailbox",
          access: "read",
          scheduledJobIds: ["compile-mail"],
        },
      ],
    },
  },
};

describe("generic connection and Knowledge contracts", () => {
  it("accepts a selector bound to a required setting and declared scheduled job", () => {
    expect(validateManifest(manifest)).toMatchObject({ ok: true, issues: [] });
  });
  it("keeps structural JSON Schema validation aligned with runtime validation", () => {
    const schema = JSON.parse(
      readFileSync(resolve("schemas/opsrabbit-plugin.schema.json"), "utf8"),
    );
    const validateSchema = new Ajv2020({
      allErrors: true,
      strict: false,
    }).compile(schema);
    expect(validateSchema(manifest)).toBe(true);
    const invalid = {
      ...manifest,
      capabilities: {
        ...manifest.capabilities,
        connections: {
          selectors: [
            {
              settingKey: "imap_connection_id",
              integrationType: "imap_mailbox",
              access: "write",
            },
          ],
        },
      },
    };
    expect(validateSchema(invalid)).toBe(false);
    expect(validateManifest(invalid).ok).toBe(false);
  });
  it("uses runtime validation for referential constraints JSON Schema cannot express", () => {
    const schema = JSON.parse(
      readFileSync(resolve("schemas/opsrabbit-plugin.schema.json"), "utf8"),
    );
    const validateSchema = new Ajv2020({
      allErrors: true,
      strict: false,
    }).compile(schema);
    const missingSetting = { ...manifest, settings: [] };
    expect(validateSchema(missingSetting)).toBe(true);
    expect(validateManifest(missingSetting).ok).toBe(false);
  });
  it.each([
    ["missing setting", { ...manifest, settings: [] }],
    [
      "optional setting",
      {
        ...manifest,
        settings: [
          { key: "imap_connection_id", label: "IMAP", type: "string" },
        ],
      },
    ],
    [
      "undeclared job",
      {
        ...manifest,
        capabilities: {
          ...manifest.capabilities,
          connections: {
            selectors: [
              {
                settingKey: "imap_connection_id",
                integrationType: "imap_mailbox",
                access: "read",
                scheduledJobIds: ["unknown-job"],
              },
            ],
          },
        },
      },
    ],
    [
      "undeclared action",
      {
        ...manifest,
        capabilities: {
          ...manifest.capabilities,
          connections: {
            selectors: [
              {
                settingKey: "imap_connection_id",
                integrationType: "imap_mailbox",
                access: "read",
                actionIds: ["unknown-action"],
              },
            ],
          },
        },
      },
    ],
    [
      "unbound selector",
      {
        ...manifest,
        capabilities: {
          ...manifest.capabilities,
          connections: {
            selectors: [
              {
                settingKey: "imap_connection_id",
                integrationType: "imap_mailbox",
                access: "read",
              },
            ],
          },
        },
      },
    ],
    [
      "duplicate selector setting",
      {
        ...manifest,
        capabilities: {
          ...manifest.capabilities,
          connections: {
            selectors: [
              ...manifest.capabilities.connections!.selectors,
              ...manifest.capabilities.connections!.selectors,
            ],
          },
        },
      },
    ],
    [
      "write selector",
      {
        ...manifest,
        capabilities: {
          ...manifest.capabilities,
          connections: {
            selectors: [
              {
                settingKey: "imap_connection_id",
                integrationType: "imap_mailbox",
                access: "write",
              },
            ],
          },
        },
      },
    ],
  ])("rejects %s", (_name, candidate) =>
    expect(validateManifest(candidate).ok).toBe(false),
  );
  it("injects narrow connection and Knowledge test services", async () => {
    const connections: PluginConnectionsService = {
      materialize: vi.fn(async () => ({
        integrationType: "imap_mailbox" as const,
        host: "mail.test",
        port: 993,
        security: "tls" as const,
        username: { value: "support", source: "value" as const },
        password: { value: "/run/secrets/imap", source: "file" as const },
        allowedFolders: ["INBOX"],
      })),
    };
    const knowledge = {
      createSource: vi.fn(),
      upsertDocument: vi.fn(),
      deleteDocument: vi.fn(),
      publish: vi.fn(),
      search: vi.fn(async () => ({ matches: [] })),
      fetchByMetadata: vi.fn(async () => ({ documents: [] })),
    } as unknown as PluginKnowledgeService;
    const context = createTestContext({ connections, knowledge });
    await expect(
      context.connections?.materialize({ selector: "imap_connection_id" }),
    ).resolves.toMatchObject({ host: "mail.test", security: "tls" });
    await expect(
      context.knowledge?.search?.({
        query: "550 rejection",
        filters: { sourceKey: "cases" },
        topK: 20,
      }),
    ).resolves.toEqual({ matches: [] });
    await expect(
      context.knowledge?.fetchByMetadata?.({
        sourceKey: "cases",
        caseId: "case-1",
        sourceRevision: "rev-1",
        limit: 32,
      }),
    ).resolves.toEqual({ documents: [] });
  });
  it("shapes services by manifest capability and rejects read-action mutations", async () => {
    const readManifest: PluginManifest = {
      ...manifest,
      capabilities: {
        ...manifest.capabilities,
        actions: [{ id: "lookup", risk: "read", requiredRole: "operator" }],
        knowledge: { read: true, write: true, delete: true },
        connections: {
          selectors: [
            {
              settingKey: "imap_connection_id",
              integrationType: "imap_mailbox",
              access: "read",
              actionIds: ["lookup"],
            },
          ],
        },
      },
    };
    const knowledge = {
      search: vi.fn(async () => ({ matches: [] })),
      fetchByMetadata: vi.fn(async () => ({ documents: [] })),
      createSource: vi.fn(),
      upsertDocument: vi.fn(),
      publish: vi.fn(),
      deleteDocument: vi.fn(),
    } as PluginKnowledgeService;
    const context = createAuthorizedTestContext(
      readManifest,
      { kind: "action", id: "lookup" },
      { knowledge },
    );
    await expect(
      context.knowledge?.search?.({ query: "case" }),
    ).resolves.toEqual({ matches: [] });
    await expect(context.knowledge?.publish?.("cases")).rejects.toThrow(
      "not authorized",
    );
    await expect(
      context.knowledge?.deleteDocument?.({
        sourceKey: "cases",
        key: "case_1",
        reason: "test",
      }),
    ).rejects.toThrow("not authorized");
  });
  it("does not expose a Connection outside its declared invocation binding", () => {
    const context = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "not-bound" },
      { connections: { materialize: vi.fn() } },
    );
    expect(context.connections).toBeUndefined();
  });
  it("rejects an unbound selector within an otherwise authorized invocation", async () => {
    const boundManifest: PluginManifest = {
      ...manifest,
      capabilities: {
        ...manifest.capabilities,
        actions: [{ id: "lookup", risk: "read", requiredRole: "operator" }],
        connections: {
          selectors: [
            {
              settingKey: "imap_connection_id",
              integrationType: "imap_mailbox",
              access: "read",
              actionIds: ["lookup"],
            },
          ],
        },
      },
    };
    const context = createAuthorizedTestContext(
      boundManifest,
      { kind: "action", id: "lookup" },
      { connections: { materialize: vi.fn() } },
    );
    await expect(
      context.connections?.materialize({ selector: "another_connection" }),
    ).rejects.toThrow("not authorized");
  });
  it("rejects selector and binding bounds structurally and at runtime", () => {
    const selector = manifest.capabilities.connections!.selectors[0]!;
    const tooManySelectors = {
      ...manifest,
      capabilities: {
        ...manifest.capabilities,
        connections: {
          selectors: Array.from({ length: 17 }, (_, index) => ({
            ...selector,
            settingKey: `imap_connection_${index}`,
          })),
        },
      },
    };
    const tooManyBindings = {
      ...manifest,
      capabilities: {
        ...manifest.capabilities,
        connections: {
          selectors: [
            {
              ...selector,
              scheduledJobIds: Array.from(
                { length: 65 },
                (_, index) => `job-${index}`,
              ),
            },
          ],
        },
      },
    };
    const schema = JSON.parse(
      readFileSync(resolve("schemas/opsrabbit-plugin.schema.json"), "utf8"),
    );
    const validateSchema = new Ajv2020({
      allErrors: true,
      strict: false,
    }).compile(schema);
    for (const candidate of [tooManySelectors, tooManyBindings]) {
      expect(validateSchema(candidate)).toBe(false);
      expect(validateManifest(candidate).ok).toBe(false);
    }
  });
  it.each([
    ["empty Knowledge declaration", {}],
    ["false Knowledge permission", { read: false }],
  ])("rejects %s", (_name, knowledge) => {
    const candidate = {
      ...manifest,
      capabilities: { ...manifest.capabilities, knowledge },
    };
    expect(validateManifest(candidate).ok).toBe(false);
  });
  it("exports immutable approval fields on Form submissions", () => {
    type GovernedApproval = NonNullable<
      PluginFormSubmission["governed_approval"]
    >;
    expectTypeOf<PluginFormSubmission>().toMatchTypeOf<{
      governed_approval?: {
        transitionType: "approval";
        action: "approve" | "stage_transition";
        fromStageKey: "awaiting_review" | "in_review";
        toStageKey: "approved";
        approvedContentHash: string;
      } | null;
      workflow_current_content_hash?: string;
      workflow_transition_action?: string | null;
      workflow_transition_type?: string | null;
      workflow_transition_from_stage_key?: string | null;
      workflow_transition_to_stage_key?: string | null;
    }>();
    expectTypeOf<{
      transitionId: string;
      transitionType: "approval";
      action: "approve";
      fromStageKey: "awaiting_review";
      toStageKey: "approved";
      reviewerUserId: string;
      approvedContentHash: string;
      approvedStructuredReviewHash: string;
      approvedContentRevision: string;
    }>().toMatchTypeOf<GovernedApproval>();
    expectTypeOf<{
      transitionId: string;
      transitionType: "approval";
      action: "stage_transition";
      fromStageKey: "in_review";
      toStageKey: "approved";
      reviewerUserId: string;
      approvedContentHash: string;
      approvedStructuredReviewHash: string;
      approvedContentRevision: string;
    }>().toMatchTypeOf<GovernedApproval>();
    expectTypeOf<{
      action: "approve";
      fromStageKey: "in_review";
    }>().not.toMatchTypeOf<GovernedApproval>();
    expectTypeOf<{
      action: "stage_transition";
      fromStageKey: "hold";
    }>().not.toMatchTypeOf<GovernedApproval>();
  });
});
