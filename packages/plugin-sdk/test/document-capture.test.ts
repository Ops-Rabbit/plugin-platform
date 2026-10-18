import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it, vi } from "vitest";
import type {
  PluginCapturedDocumentV1,
  PluginDocumentCaptureResultV1,
  PluginDocumentCaptureServiceV1,
  PluginManifest,
} from "../src/index.js";
import {
  PLUGIN_DOCUMENT_CAPTURE_LIMITS,
  PluginValidationError,
  parsePluginDocumentCaptureResultV1,
  parsePluginDocumentCaptureUrlRequestV1,
  validatePluginDocumentCaptureResultV1,
  validatePluginDocumentCaptureUrlRequestV1,
  verifyPluginCapturedDocumentTextV1,
} from "../src/index.js";
import {
  createAuthorizedTestContext,
  createTestContext,
} from "../src/testing/index.js";
import { validateManifest } from "../src/validation/manifest.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const manifest: PluginManifest = {
  id: "capture_example",
  name: "Capture example",
  version: "1.0.0",
  description: "Captures public documents.",
  apiVersion: "1.0",
  main: "./dist/index.js",
  capabilities: {
    actions: [
      { id: "capture", risk: "external", requiredRole: "operator" },
      { id: "read-only", risk: "read", requiredRole: "viewer" },
      {
        id: "admin-capture",
        risk: "external",
        requiredRole: "admin",
        deploymentAdminOnly: true,
      },
    ],
    scheduledJobs: [{ id: "refresh" }, { id: "unbound-job" }],
    documentCapture: {
      schemaVersion: "1",
      sources: ["url"],
      actionIds: ["capture"],
      scheduledJobIds: ["refresh"],
    },
  },
};

function withCapture(documentCapture: unknown): PluginManifest {
  return {
    ...manifest,
    capabilities: {
      ...manifest.capabilities,
      documentCapture,
    },
  } as PluginManifest;
}

function withoutCapture(): PluginManifest {
  const capabilities = { ...manifest.capabilities };
  delete capabilities.documentCapture;
  return { ...manifest, capabilities };
}

function document(
  overrides: Partial<PluginCapturedDocumentV1> = {},
): PluginCapturedDocumentV1 {
  const text = overrides.text ?? "# Notice\n\nBody text.";
  return {
    schemaVersion: "1",
    source: {
      kind: "url",
      requestedUrl: "https://example.com/notice",
      finalUrl: "https://example.com/notice",
      redirectCount: 0,
    },
    fetchedAt: "2026-10-17T10:00:00.000Z",
    contentType: "text/html",
    byteLength: 512,
    byteSha256: "a".repeat(64),
    extractor: { id: "opsrabbit.web-readable-markdown", version: "1" },
    title: "Notice",
    format: "markdown",
    text,
    textBytes: new TextEncoder().encode(text).byteLength,
    textSha256: sha256(text),
    truncated: false,
    warnings: [],
    ...overrides,
  };
}

const ok = (value: PluginCapturedDocumentV1 = document()) => ({
  ok: true as const,
  document: value,
});

function issuesOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof PluginValidationError)
      return error.issues.map((entry) => entry.path);
    throw error;
  }
  return [];
}

describe("document capture manifest", () => {
  const schema = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../schemas/opsrabbit-plugin.schema.json"),
      "utf8",
    ),
  );
  const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(
    schema,
  );

  it("accepts action-only, job-only and combined bindings", () => {
    for (const documentCapture of [
      { schemaVersion: "1", sources: ["url"], actionIds: ["capture"] },
      { schemaVersion: "1", sources: ["url"], scheduledJobIds: ["refresh"] },
      manifest.capabilities.documentCapture,
    ]) {
      const candidate = withCapture(documentCapture);
      expect(validateSchema(candidate)).toBe(true);
      expect(validateManifest(candidate).issues).toEqual([]);
    }
  });

  it("keeps malformed declarations aligned with the JSON Schema", () => {
    for (const documentCapture of [
      { schemaVersion: "1", sources: ["url"] },
      { schemaVersion: "2", sources: ["url"], actionIds: ["capture"] },
      { schemaVersion: "1", sources: [], actionIds: ["capture"] },
      { schemaVersion: "1", sources: ["file"], actionIds: ["capture"] },
      { schemaVersion: "1", sources: ["url", "url"], actionIds: ["capture"] },
      { schemaVersion: "1", actionIds: ["capture"] },
      { schemaVersion: "1", sources: ["url"], actionIds: [] },
      { schemaVersion: "1", sources: ["url"], scheduledJobIds: [] },
      {
        schemaVersion: "1",
        sources: ["url"],
        actionIds: ["capture", "capture"],
      },
      { schemaVersion: "1", sources: ["url"], actionIds: ["Bad ID"] },
      {
        schemaVersion: "1",
        sources: ["url"],
        actionIds: Array.from({ length: 65 }, (_, index) => `a-${index}`),
      },
      {
        schemaVersion: "1",
        sources: ["url"],
        actionIds: ["capture"],
        maxTextBytes: 10,
      },
      "enabled",
    ]) {
      const candidate = withCapture(documentCapture);
      expect(validateSchema(candidate)).toBe(false);
      expect(validateManifest(candidate).ok).toBe(false);
    }
  });

  it("rejects bindings to undeclared, non-external or deployment-admin invocations", () => {
    for (const binding of [
      { actionIds: ["missing"] },
      { actionIds: ["read-only"] },
      { actionIds: ["admin-capture"] },
      { scheduledJobIds: ["missing-job"] },
    ]) {
      const candidate = withCapture({
        schemaVersion: "1",
        sources: ["url"],
        ...binding,
      });
      // The cross-reference is runtime-only; the schema cannot express it.
      expect(validateSchema(candidate)).toBe(true);
      const result = validateManifest(candidate);
      expect(result.ok).toBe(false);
      expect(result.issues[0]?.path).toMatch(
        /^\$\.capabilities\.documentCapture\./,
      );
    }
  });

  it("does not throw on malformed action and job lists", () => {
    const candidate = {
      ...manifest,
      capabilities: {
        actions: { capture: true },
        scheduledJobs: [null],
        documentCapture: manifest.capabilities.documentCapture,
      },
    };
    expect(() => validateManifest(candidate)).not.toThrow();
    expect(validateManifest(candidate).ok).toBe(false);
  });

  it("leaves manifests without the capability unchanged", () => {
    const candidate = withoutCapture();
    expect(validateSchema(candidate)).toBe(true);
    expect(validateManifest(candidate).ok).toBe(true);
  });
});

describe("document capture request", () => {
  it("applies the default text bound and normalizes the URL", () => {
    expect(
      parsePluginDocumentCaptureUrlRequestV1({
        url: "https://Example.com/a b#section",
      }),
    ).toEqual({
      url: "https://Example.com/a b#section",
      normalizedUrl: "https://example.com/a%20b",
      maxTextBytes: PLUGIN_DOCUMENT_CAPTURE_LIMITS.defaultMaxTextBytes,
    });
    const parsed = parsePluginDocumentCaptureUrlRequestV1({
      url: "https://example.com",
      maxTextBytes: 1,
    });
    expect(parsed.maxTextBytes).toBe(1);
    expect(Object.isFrozen(parsed)).toBe(true);
    // Hints stay absent unless the request sets them; the host applies its own limits.
    expect(parsed).not.toHaveProperty("maxResponseBytes");
    expect(parsed).not.toHaveProperty("timeoutMs");
  });

  it("accepts tighten-only hints at both ends of their ranges", () => {
    const limits = PLUGIN_DOCUMENT_CAPTURE_LIMITS;
    for (const [maxResponseBytes, timeoutMs] of [
      [limits.minResponseBytes, limits.minTimeoutMs],
      [limits.maxResponseBytes, limits.maxTimeoutMs],
      [100_000, 30_000],
    ])
      expect(
        parsePluginDocumentCaptureUrlRequestV1({
          url: "https://example.com/",
          maxResponseBytes,
          timeoutMs,
        }),
      ).toEqual({
        url: "https://example.com/",
        normalizedUrl: "https://example.com/",
        maxTextBytes: limits.defaultMaxTextBytes,
        maxResponseBytes,
        timeoutMs,
      });
    expect(limits).toMatchObject({
      minResponseBytes: 16_384,
      maxResponseBytes: 10_485_760,
      minTimeoutMs: 1_000,
      maxTimeoutMs: 120_000,
    });
  });

  it("rejects URLs the parser would silently rewrite", () => {
    for (const url of [
      " https://example.com/",
      "https://example.com/ ",
      "https://exa\nmple.com/",
      "https://example.com/a\tb",
      "https://example.com/\r",
      "https://example.com/\u0000",
    ])
      expect(
        validatePluginDocumentCaptureUrlRequestV1({ url }).map(
          (entry) => entry.path,
        ),
        JSON.stringify(url),
      ).toEqual(["$.url"]);
  });

  it("rejects hints outside their ranges or of the wrong type", () => {
    const limits = PLUGIN_DOCUMENT_CAPTURE_LIMITS;
    for (const [key, value] of [
      ["maxResponseBytes", limits.minResponseBytes - 1],
      ["maxResponseBytes", limits.maxResponseBytes + 1],
      ["maxResponseBytes", 0],
      ["maxResponseBytes", 20_000.5],
      ["maxResponseBytes", "20000"],
      ["maxResponseBytes", null],
      ["maxResponseBytes", Number.POSITIVE_INFINITY],
      ["timeoutMs", limits.minTimeoutMs - 1],
      ["timeoutMs", limits.maxTimeoutMs + 1],
      ["timeoutMs", -1],
      ["timeoutMs", 1_500.5],
      ["timeoutMs", "5000"],
      ["timeoutMs", Number.NaN],
    ] as const) {
      const issues = validatePluginDocumentCaptureUrlRequestV1({
        url: "https://example.com/",
        [key]: value,
      });
      expect(
        issues.map((entry) => entry.path),
        `${key}=${String(value)}`,
      ).toEqual([`$.${key}`]);
    }
    const accessor = Object.defineProperty(
      { url: "https://example.com/" },
      "timeoutMs",
      { get: () => 5_000, enumerable: true },
    );
    expect(validatePluginDocumentCaptureUrlRequestV1(accessor)).not.toEqual([]);
  });

  it("rejects unsafe or unbounded requests", () => {
    const longUrl = `https://example.com/${"a".repeat(2_048)}`;
    for (const value of [
      null,
      "https://example.com",
      {},
      { url: 42 },
      { url: "" },
      { url: "/relative" },
      { url: "http://example.com" },
      { url: "ftp://example.com" },
      { url: "https://user:secret@example.com" },
      { url: longUrl },
      { url: "x".repeat(10_000_000) },
      { url: "https://example.com", maxTextBytes: 0 },
      { url: "https://example.com", maxTextBytes: 1.5 },
      { url: "https://example.com", maxTextBytes: "10" },
      {
        url: "https://example.com",
        maxTextBytes: PLUGIN_DOCUMENT_CAPTURE_LIMITS.maxTextBytes + 1,
      },
      { url: "https://example.com", extra: true },
    ])
      expect(validatePluginDocumentCaptureUrlRequestV1(value)).not.toEqual([]);
  });

  it("bounds the issues reported for objects with many unknown keys", () => {
    const value: Record<string, unknown> = { url: "https://example.com" };
    for (let index = 0; index < 10_000; index += 1) value[`k${index}`] = index;
    expect(validatePluginDocumentCaptureUrlRequestV1(value)).toHaveLength(1);
  });

  it("reads each property once and rejects accessors and inherited values", () => {
    const getter = vi.fn(() => "https://example.com");
    const accessor = Object.defineProperty({}, "url", {
      get: getter,
      enumerable: true,
    });
    expect(validatePluginDocumentCaptureUrlRequestV1(accessor)).not.toEqual([]);
    expect(getter).not.toHaveBeenCalled();

    const inherited = Object.create({ maxTextBytes: 5 }) as object;
    Object.assign(inherited, { url: "https://example.com" });
    expect(validatePluginDocumentCaptureUrlRequestV1(inherited)).not.toEqual(
      [],
    );

    class Request {
      url = "https://example.com";
    }
    expect(
      validatePluginDocumentCaptureUrlRequestV1(new Request()),
    ).not.toEqual([]);
    expect(
      validatePluginDocumentCaptureUrlRequestV1({
        url: "https://example.com",
        [Symbol("x")]: 1,
      }),
    ).not.toEqual([]);
  });
});

describe("document capture result", () => {
  it("returns a frozen copy of a valid document", () => {
    const raw = ok();
    const parsed = parsePluginDocumentCaptureResultV1(raw, {
      url: "https://example.com/notice#top",
    });
    expect(parsed).toEqual(raw);
    expect(parsed).not.toBe(raw);
    expect(Object.isFrozen(parsed)).toBe(true);
    if (!parsed.ok) throw new Error("expected success");
    expect(Object.isFrozen(parsed.document.source)).toBe(true);
    expect(Object.isFrozen(parsed.document.warnings)).toBe(true);
    (raw.document as unknown as { warnings: string[] }).warnings = ["mutated"];
    expect(parsed.document.warnings).toEqual([]);
  });

  it("accepts truncation, redirects and supplementary characters consistently", () => {
    const text = "Emoji 😀 and tab\tend";
    expect(
      validatePluginDocumentCaptureResultV1(
        ok(
          document({
            source: {
              kind: "url",
              requestedUrl: "https://example.com/notice",
              finalUrl: "https://www.example.com/final",
              redirectCount: 2,
            },
            title: "Title 😀",
            text,
            textBytes: new TextEncoder().encode(text).byteLength,
            textSha256: sha256(text),
            truncated: true,
            warnings: ["text_truncated", "cross_origin_redirect"],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("ties the result to its request", () => {
    expect(
      issuesOf(() =>
        parsePluginDocumentCaptureResultV1(ok(), {
          url: "https://example.com/other",
        }),
      ),
    ).toContain("$.document.source.requestedUrl");
    expect(
      issuesOf(() =>
        parsePluginDocumentCaptureResultV1(ok(), {
          url: "https://example.com/notice",
          maxTextBytes: 5,
        }),
      ),
    ).toContain("$.document.text");
    expect(
      issuesOf(() =>
        parsePluginDocumentCaptureResultV1(ok(), { url: "http://example.com" }),
      ),
    ).toContain("$request.url");
    // A requested response bound caps byteLength; the timeout hint has no result field.
    const bounded = {
      url: "https://example.com/notice",
      maxResponseBytes: 16_384,
      timeoutMs: 5_000,
    };
    expect(
      validatePluginDocumentCaptureResultV1(
        ok(document({ byteLength: 16_384 })),
        bounded,
      ),
    ).toEqual([]);
    expect(
      issuesOf(() =>
        parsePluginDocumentCaptureResultV1(
          ok(document({ byteLength: 16_385 })),
          bounded,
        ),
      ),
    ).toContain("$.document.byteLength");
    expect(
      issuesOf(() =>
        parsePluginDocumentCaptureResultV1(ok(), {
          url: "https://example.com/notice",
          timeoutMs: 999,
        }),
      ),
    ).toContain("$request.timeoutMs");
  });

  it("rejects inconsistent or malformed documents", () => {
    const cases: Array<[string, Partial<PluginCapturedDocumentV1> | object]> = [
      ["$.document.textBytes", { textBytes: 3 }],
      ["$.document.text", { text: "" }],
      ["$.document.text", { text: "bad\u0000" }],
      ["$.document.text", { text: "carriage\r\nreturn" }],
      ["$.document.text", { text: "lone \uD800 surrogate" }],
      ["$.document.title", { title: "two\nlines" }],
      ["$.document.title", { title: "x".repeat(1_025) }],
      ["$.document.title", { title: "  " }],
      ["$.document.fetchedAt", { fetchedAt: "2026-02-30T00:00:00.000Z" }],
      ["$.document.fetchedAt", { fetchedAt: "2026-10-17T10:00:00Z" }],
      ["$.document.byteSha256", { byteSha256: "A".repeat(64) }],
      ["$.document.byteLength", { byteLength: -1 }],
      ["$.document.contentType", { contentType: "image/png" }],
      ["$.document.format", { format: "html" }],
      ["$.document.extractor.id", { extractor: { id: "", version: "1" } }],
      [
        "$.document.extractor.version",
        { extractor: { id: "x", version: "1 0" } },
      ],
      ["$.document.warnings", { truncated: true }],
      ["$.document.warnings", { warnings: ["text_truncated"] }],
      ["$.document.warnings", { warnings: ["cross_origin_redirect"] }],
      ["$.document.warnings", { warnings: ["custom", "custom"] }],
      ["$.document.warnings[0]", { warnings: ["Not A Code"] }],
      ["$.document.schemaVersion", { schemaVersion: "2" }],
      ["$.document.extra", { extra: true }],
      [
        "$.document.source.finalUrl",
        {
          source: {
            kind: "url",
            requestedUrl: "https://example.com/notice",
            finalUrl: "https://example.com/other",
            redirectCount: 0,
          },
        },
      ],
      [
        "$.document.source.redirectCount",
        {
          source: {
            kind: "url",
            requestedUrl: "https://example.com/notice",
            finalUrl: "https://example.com/notice",
            redirectCount: 11,
          },
        },
      ],
      [
        "$.document.source.requestedUrl",
        {
          source: {
            kind: "url",
            requestedUrl: "https://example.com/notice#frag",
            finalUrl: "https://example.com/notice",
            redirectCount: 1,
          },
        },
      ],
      [
        "$.document.source.finalUrl",
        {
          source: {
            kind: "url",
            requestedUrl: "https://example.com/notice",
            finalUrl: "http://example.com/notice",
            redirectCount: 1,
          },
        },
      ],
    ];
    for (const [path, override] of cases)
      expect(
        validatePluginDocumentCaptureResultV1(
          ok(document(override as Partial<PluginCapturedDocumentV1>)),
        ).map((entry) => entry.path),
        path,
      ).toContain(path);
  });

  it("rejects sparse, accessor and non-array warnings", () => {
    const sparse: string[] = [];
    sparse.length = 1;
    const getterWarnings = Object.defineProperty([] as string[], "0", {
      get: () => "text_truncated",
      enumerable: true,
    });
    for (const warnings of [sparse, getterWarnings, "text_truncated"])
      expect(
        validatePluginDocumentCaptureResultV1(
          ok(document({ warnings: warnings as string[] })),
        ),
      ).not.toEqual([]);
  });

  it("accepts unknown well-formed warning and error codes", () => {
    expect(
      validatePluginDocumentCaptureResultV1(
        ok(document({ warnings: ["future_warning"] })),
      ),
    ).toEqual([]);
    expect(
      parsePluginDocumentCaptureResultV1({
        ok: false,
        error: { code: "future_code", message: "Later.", retryable: true },
      }),
    ).toEqual({
      ok: false,
      error: { code: "future_code", message: "Later.", retryable: true },
    });
  });

  it("enforces error shape and httpStatus rules", () => {
    const failure = (error: object) => ({ ok: false, error });
    expect(
      validatePluginDocumentCaptureResultV1(
        failure({
          code: "http_error",
          message: "Upstream returned an error.",
          retryable: false,
          httpStatus: 404,
        }),
      ),
    ).toEqual([]);
    for (const error of [
      { code: "http_error", message: "x", retryable: false },
      { code: "http_error", message: "x", retryable: false, httpStatus: 302 },
      { code: "timeout", message: "x", retryable: true, httpStatus: 504 },
      { code: "Timeout", message: "x", retryable: true },
      { code: "timeout", message: "", retryable: true },
      { code: "timeout", message: "x\ny", retryable: true },
      { code: "timeout", message: "x".repeat(513), retryable: true },
      { code: "timeout", message: "x", retryable: "yes" },
      { code: "timeout", message: "x" },
      { code: "timeout", message: "x", retryable: true, detail: "secret" },
    ])
      expect(
        validatePluginDocumentCaptureResultV1(failure(error)),
        JSON.stringify(error).slice(0, 80),
      ).not.toEqual([]);
  });

  it("rejects empty bodies, oversized text early and binds without running getters", () => {
    expect(
      issuesOf(() =>
        parsePluginDocumentCaptureResultV1(ok(document({ byteLength: 0 }))),
      ),
    ).toContain("$.document.byteLength");
    expect(
      validatePluginDocumentCaptureResultV1(
        ok(document({ text: "x".repeat(10) })),
        { url: "https://example.com/notice", maxTextBytes: 5 },
      ).map((entry) => `${entry.path} ${entry.code}`),
    ).toContain("$.document.text too-long");
    const getter = vi.fn(() => "https://example.com/notice");
    const request = Object.defineProperty({}, "url", {
      get: getter,
      enumerable: true,
    }) as { url: string };
    expect(
      issuesOf(() => parsePluginDocumentCaptureResultV1(ok(), request)),
    ).toContain("$request.url");
    expect(getter).not.toHaveBeenCalled();
    // An accepted request (with its derived normalizedUrl) is a valid binding.
    const accepted = parsePluginDocumentCaptureUrlRequestV1({
      url: "https://example.com/notice#top",
    });
    expect(validatePluginDocumentCaptureResultV1(ok(), accepted)).toEqual([]);
    expect(
      parsePluginDocumentCaptureResultV1({
        ok: false,
        error: {
          code: "timeout",
          message: "Slow.",
          retryable: true,
          httpStatus: undefined,
        },
      }),
    ).toEqual({
      ok: false,
      error: { code: "timeout", message: "Slow.", retryable: true },
    });
  });

  it("rejects mixed or malformed envelopes", () => {
    for (const value of [
      null,
      { ok: "true", document: document() },
      { ok: true },
      { ok: true, document: document(), error: {} },
      {
        ok: false,
        error: { code: "timeout", message: "x", retryable: true },
        document: document(),
      },
    ])
      expect(validatePluginDocumentCaptureResultV1(value)).not.toEqual([]);
  });

  it("verifies text digests with Web Crypto", async () => {
    await expect(verifyPluginCapturedDocumentTextV1(document())).resolves.toBe(
      true,
    );
    await expect(
      verifyPluginCapturedDocumentTextV1(
        document({ textSha256: "0".repeat(64) }),
      ),
    ).resolves.toBe(false);
  });
});

describe("document capture test harness", () => {
  const broker = (
    result: unknown = ok(),
  ): PluginDocumentCaptureServiceV1 & { fromUrl: ReturnType<typeof vi.fn> } =>
    ({
      fromUrl: vi.fn(async () => result as PluginDocumentCaptureResultV1),
    }) as PluginDocumentCaptureServiceV1 & {
      fromUrl: ReturnType<typeof vi.fn>;
    };

  it("exposes the broker only to bound external actions and bound jobs", () => {
    const documentCapture = broker();
    const exposed = (
      invocation: Parameters<typeof createAuthorizedTestContext>[1],
      source: PluginManifest = manifest,
    ) =>
      createAuthorizedTestContext(source, invocation, { documentCapture })
        .documentCapture !== undefined;
    expect(exposed({ kind: "action", id: "capture" })).toBe(true);
    expect(exposed({ kind: "scheduledJob", id: "refresh" })).toBe(true);
    expect(exposed({ kind: "action", id: "read-only" })).toBe(false);
    expect(exposed({ kind: "action", id: "admin-capture" })).toBe(false);
    expect(exposed({ kind: "action", id: "undeclared" })).toBe(false);
    expect(exposed({ kind: "scheduledJob", id: "unbound-job" })).toBe(false);
    expect(exposed({ kind: "scheduledJob", id: "capture" })).toBe(false);
    expect(exposed({ kind: "action", id: "capture" }, withoutCapture())).toBe(
      false,
    );
    expect(createTestContext({ documentCapture }).documentCapture).toBe(
      documentCapture,
    );
  });

  it("validates the request before calling the broker and the result after", async () => {
    const documentCapture = broker();
    const context = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "capture" },
      { documentCapture },
    );
    await expect(
      context.documentCapture!.fromUrl({ url: "http://example.com" }),
    ).rejects.toBeInstanceOf(PluginValidationError);
    expect(documentCapture.fromUrl).not.toHaveBeenCalled();

    const result = await context.documentCapture!.fromUrl({
      url: "https://example.com/notice",
    });
    expect(result.ok).toBe(true);
    expect(documentCapture.fromUrl).toHaveBeenCalledWith({
      url: "https://example.com/notice",
      maxTextBytes: PLUGIN_DOCUMENT_CAPTURE_LIMITS.defaultMaxTextBytes,
    });

    await expect(
      context.documentCapture!.fromUrl({
        url: "https://example.com/notice",
        maxTextBytes: 4,
      }),
    ).rejects.toBeInstanceOf(PluginValidationError);
  });

  it("forwards tighten-only hints and enforces the response bound on results", async () => {
    const documentCapture = broker();
    const context = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "capture" },
      { documentCapture },
    );
    await context.documentCapture!.fromUrl({
      url: "https://example.com/notice",
      maxResponseBytes: 100_000,
      timeoutMs: 5_000,
    });
    expect(documentCapture.fromUrl).toHaveBeenLastCalledWith({
      url: "https://example.com/notice",
      maxTextBytes: PLUGIN_DOCUMENT_CAPTURE_LIMITS.defaultMaxTextBytes,
      maxResponseBytes: 100_000,
      timeoutMs: 5_000,
    });
    await expect(
      context.documentCapture!.fromUrl({
        url: "https://example.com/notice",
        timeoutMs: 500,
      }),
    ).rejects.toBeInstanceOf(PluginValidationError);
    // A fake that ignores the bound is caught: the body exceeds the requested limit.
    await expect(
      context.documentCapture!.fromUrl({
        url: "https://example.com/notice",
        maxResponseBytes: 16_384,
      }),
    ).resolves.toMatchObject({ ok: true });
    const oversized = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "capture" },
      { documentCapture: broker(ok(document({ byteLength: 20_000 }))) },
    );
    await expect(
      oversized.documentCapture!.fromUrl({
        url: "https://example.com/notice",
        maxResponseBytes: 16_384,
      }),
    ).rejects.toBeInstanceOf(PluginValidationError);
  });

  it("forwards the normalized URL and rejects with the abort reason while the fake is pending", async () => {
    const forwarded = broker();
    const context = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "capture" },
      { documentCapture: forwarded },
    );
    await context.documentCapture!.fromUrl({
      url: "https://Example.com/notice#section",
    });
    expect(forwarded.fromUrl).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/notice" }),
    );

    const controller = new AbortController();
    const pending = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "capture" },
      {
        documentCapture: { fromUrl: () => new Promise(() => undefined) },
        signal: controller.signal,
      },
    ).documentCapture!.fromUrl({ url: "https://example.com/notice" });
    const reason = new Error("cancelled while pending");
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);

    const second = new AbortController();
    const failing = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "capture" },
      {
        documentCapture: {
          fromUrl: async () => {
            second.abort(reason);
            throw new Error("fake failure");
          },
        },
        signal: second.signal,
      },
    ).documentCapture!.fromUrl({ url: "https://example.com/notice" });
    await expect(failing).rejects.toBe(reason);

    const passthrough = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "capture" },
      {
        documentCapture: {
          fromUrl: async () => {
            throw new Error("fake failure");
          },
        },
        signal: new AbortController().signal,
      },
    ).documentCapture!.fromUrl({ url: "https://example.com/notice" });
    await expect(passthrough).rejects.toThrow("fake failure");
  });

  it("rejects a fake broker whose text digest does not match", async () => {
    const context = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "capture" },
      {
        documentCapture: broker(ok(document({ textSha256: "0".repeat(64) }))),
      },
    );
    await expect(
      context.documentCapture!.fromUrl({ url: "https://example.com/notice" }),
    ).rejects.toThrow(/textSha256/);
  });

  it("rejects with the signal reason before and after the broker runs", async () => {
    const before = new AbortController();
    before.abort(new Error("cancelled before"));
    const idle = broker();
    await expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "action", id: "capture" },
        { documentCapture: idle, signal: before.signal },
      ).documentCapture!.fromUrl({ url: "https://example.com/notice" }),
    ).rejects.toThrow("cancelled before");
    expect(idle.fromUrl).not.toHaveBeenCalled();

    const during = new AbortController();
    const aborting: PluginDocumentCaptureServiceV1 = {
      fromUrl: async () => {
        during.abort(new Error("cancelled during"));
        return ok();
      },
    };
    await expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "scheduledJob", id: "refresh" },
        { documentCapture: aborting, signal: during.signal },
      ).documentCapture!.fromUrl({ url: "https://example.com/notice" }),
    ).rejects.toThrow("cancelled during");
  });
});
