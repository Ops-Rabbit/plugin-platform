import { Buffer } from "node:buffer";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { PluginInvocationContext, PluginManifest } from "../src/index.js";
import {
  createAuthorizedTestContext,
  createTestContext,
} from "../src/testing/index.js";
import type { TestEmbeddedChatOptions } from "../src/testing/index.js";

const ASSERTION = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJl";

describe("embedded identity assertion contract types", () => {
  it("adds an optional string identityAssertion to embeddedChat", () => {
    type EmbeddedChat = NonNullable<PluginInvocationContext["embeddedChat"]>;
    expectTypeOf<EmbeddedChat>().toEqualTypeOf<
      Readonly<{
        widgetId: string;
        externalUserId: string;
        identityAssertion?: string;
      }>
    >();
    expectTypeOf<EmbeddedChat["identityAssertion"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<TestEmbeddedChatOptions>().toEqualTypeOf<EmbeddedChat>();
  });

  it("keeps the field optional, string-only and read-only", () => {
    const withoutAssertion: PluginInvocationContext["embeddedChat"] = {
      widgetId: "widget-1",
      externalUserId: "user-1",
    };
    const invalid: PluginInvocationContext["embeddedChat"] = {
      widgetId: "widget-1",
      externalUserId: "user-1",
      // @ts-expect-error The assertion is a compact JWS string.
      identityAssertion: 42,
    };
    const context = createTestContext({
      embeddedChat: { ...withoutAssertion, identityAssertion: ASSERTION },
    });
    const embedded = context.embeddedChat!;
    expect(() => {
      // @ts-expect-error The verified identity is read-only.
      embedded.identityAssertion = "other";
    }).toThrow(TypeError);
    expect(invalid).toBeDefined();
  });
});

describe("test harness embeddedChat option", () => {
  it("leaves embeddedChat absent unless a test supplies it", () => {
    expect(createTestContext()).not.toHaveProperty("embeddedChat");
  });

  it("supplies the verified identity with and without an assertion", () => {
    const supplied = {
      widgetId: "widget-1",
      externalUserId: "user-1",
      identityAssertion: ASSERTION,
    };
    const context = createTestContext({ embeddedChat: supplied });
    expect(context.embeddedChat).toEqual(supplied);
    expect(context.embeddedChat).not.toBe(supplied);
    expect(Object.isFrozen(context.embeddedChat)).toBe(true);
    expect(() => {
      (
        context.embeddedChat as { identityAssertion?: string }
      ).identityAssertion = "x.y.z";
    }).toThrow(TypeError);

    const plain = createTestContext({
      embeddedChat: { widgetId: "widget-1", externalUserId: "user-1" },
    });
    expect(plain.embeddedChat).toEqual({
      widgetId: "widget-1",
      externalUserId: "user-1",
    });
    expect(plain.embeddedChat).not.toHaveProperty("identityAssertion");
  });

  it.each([
    [{ widgetId: "", externalUserId: "user-1" }, /widgetId/],
    [{ widgetId: "widget-1", externalUserId: " " }, /externalUserId/],
    [{ widgetId: "widget-1" }, /externalUserId/],
    [
      { widgetId: "widget-1", externalUserId: "user-1", identityAssertion: "" },
      /compact JWS/,
    ],
    [
      {
        widgetId: "widget-1",
        externalUserId: "user-1",
        identityAssertion: `Bearer ${ASSERTION}`,
      },
      /compact JWS/,
    ],
    [
      {
        widgetId: "widget-1",
        externalUserId: "user-1",
        identityAssertion: "header.payload",
      },
      /compact JWS/,
    ],
    [
      { widgetId: "widget-1", externalUserId: "user-1", identityAssertion: 7 },
      /compact JWS/,
    ],
    [null, /object/],
  ])("rejects malformed embeddedChat %#", (embeddedChat, message) => {
    expect(() =>
      createTestContext({
        embeddedChat: embeddedChat as unknown as TestEmbeddedChatOptions,
      }),
    ).toThrow(message);
  });

  const manifest = {
    id: "embedded-tools",
    capabilities: {
      actions: [{ id: "lookup", risk: "read", requiredRole: "viewer" }],
      scheduledJobs: [{ id: "refresh", schedule: "0 * * * *" }],
    },
  } as unknown as PluginManifest;
  const embeddedChat = {
    widgetId: "widget-1",
    externalUserId: "user-1",
    identityAssertion: ASSERTION,
  };

  it("keeps only the widget identity for a declared action", () => {
    const context = createAuthorizedTestContext(
      manifest,
      { kind: "action", id: "lookup" },
      { embeddedChat },
    );
    expect(context.embeddedChat).toEqual({
      widgetId: "widget-1",
      externalUserId: "user-1",
    });
    expect(context.embeddedChat).not.toHaveProperty("identityAssertion");
  });

  it("drops embeddedChat for scheduled jobs and undeclared actions", () => {
    expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "scheduledJob", id: "refresh" },
        { embeddedChat },
      ),
    ).not.toHaveProperty("embeddedChat");
    expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "action", id: "undeclared" },
        { embeddedChat },
      ),
    ).not.toHaveProperty("embeddedChat");
  });

  it("rejects malformed embeddedChat even when it would be dropped", () => {
    expect(() =>
      createAuthorizedTestContext(
        manifest,
        { kind: "scheduledJob", id: "refresh" },
        { embeddedChat: { ...embeddedChat, identityAssertion: "not-a-jws" } },
      ),
    ).toThrow(/compact JWS/);
  });
});

interface Reference {
  IDENTITY_ASSERTION_MAX_CLOCK_SKEW_SECONDS: number;
  callDownstreamApi: (
    context: unknown,
    options: {
      url: string;
      headerName: string;
      body: unknown;
      fetch: (
        url: URL,
        init: {
          method: string;
          headers: Record<string, string>;
          body: string;
          signal: AbortSignal;
        },
      ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
    },
  ) => Promise<unknown>;
  verifyEmbeddedIdentityAssertionV1: (
    token: unknown,
    expected: {
      jwks: unknown;
      issuer: string;
      audience: string;
      pluginId: string;
      widgetId: string;
      externalUserId: string;
      nowSeconds?: number;
    },
  ) => Readonly<Record<string, unknown>>;
}

async function reference(): Promise<Reference> {
  return (await import(
    new URL("../reference/embedded-identity-assertion.mjs", import.meta.url)
      .href
  )) as Reference;
}

describe("embedded identity assertion reference: plugin forwarding", () => {
  type Fetch = Parameters<Reference["callDownstreamApi"]>[1]["fetch"];
  function recordingFetch(status = 200) {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetch: Fetch = async (url, init) => {
      calls.push({ url: url.href, headers: init.headers });
      return { ok: status < 400, status, json: async () => ({ ok: true }) };
    };
    return { calls, fetch };
  }

  it("forwards the assertion unchanged in the configured header", async () => {
    const { callDownstreamApi } = await reference();
    const { calls, fetch } = recordingFetch();
    const context = createTestContext({
      embeddedChat: {
        widgetId: "widget-1",
        externalUserId: "user-1",
        identityAssertion: ASSERTION,
      },
    });
    await expect(
      callDownstreamApi(context, {
        url: "https://api.example.test/lookup",
        headerName: "x-agent-user-token",
        body: { q: 1 },
        fetch,
      }),
    ).resolves.toEqual({ ok: true });
    expect(calls).toEqual([
      {
        url: "https://api.example.test/lookup",
        headers: {
          "content-type": "application/json",
          "x-agent-user-token": ASSERTION,
        },
      },
    ]);
    expect(JSON.stringify(context.logs)).not.toContain(ASSERTION);
  });

  it("calls exactly as before when the host supplies no assertion", async () => {
    const { callDownstreamApi } = await reference();
    const { calls, fetch } = recordingFetch();
    for (const context of [
      createTestContext(),
      createTestContext({
        embeddedChat: { widgetId: "widget-1", externalUserId: "user-1" },
      }),
    ]) {
      await callDownstreamApi(context, {
        url: "https://api.example.test/lookup",
        headerName: "x-agent-user-token",
        body: {},
        fetch,
      });
    }
    expect(calls.map(({ headers }) => headers)).toEqual([
      { "content-type": "application/json" },
      { "content-type": "application/json" },
    ]);
  });

  it("refuses plain HTTP and never logs the assertion on failure", async () => {
    const { callDownstreamApi } = await reference();
    const context = createTestContext({
      embeddedChat: {
        widgetId: "widget-1",
        externalUserId: "user-1",
        identityAssertion: ASSERTION,
      },
    });
    const { calls, fetch } = recordingFetch(503);
    await expect(
      callDownstreamApi(context, {
        url: "http://api.example.test/lookup",
        headerName: "x-agent-user-token",
        body: {},
        fetch,
      }),
    ).rejects.toThrow(/HTTPS/);
    expect(calls).toEqual([]);
    const failure = await callDownstreamApi(context, {
      url: "https://api.example.test/lookup",
      headerName: "x-agent-user-token",
      body: {},
      fetch,
    }).catch((error: unknown) => error);
    expect(String(failure)).not.toContain(ASSERTION);
    expect(context.logs).toEqual([
      {
        level: "warn",
        message: "Downstream API call failed.",
        fields: { status: 503 },
      },
    ]);
  });
});

describe("embedded identity assertion reference: downstream verification", () => {
  const issuer =
    "https://ops.example.test/widget/chat/identity/tenants/tenant-1";
  const now = 1_800_000_000;
  const expected = {
    issuer,
    audience: "https://api.example.test",
    pluginId: "example-plugin",
    widgetId: "widget-1",
    externalUserId: "user-1",
    nowSeconds: now,
  };
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = (key: KeyObject, kid: string) => ({
    ...key.export({ format: "jwk" }),
    kid,
    alg: "ES256",
    use: "sig",
  });
  const jwks = { keys: [jwk(publicKey, "key-1")] };

  function claims(overrides: Record<string, unknown> = {}) {
    return {
      iss: issuer,
      aud: expected.audience,
      sub: "user-1",
      external_user_id: "user-1",
      widget_client_id: "widget-1",
      tenant_id: "tenant-1",
      plugin_id: "example-plugin",
      tool_id: "lookup",
      iat: now,
      nbf: now,
      exp: now + 60,
      jti: randomUUID(),
      ...overrides,
    };
  }

  function mint(
    payload: unknown,
    {
      header = { alg: "ES256", typ: "JWT", kid: "key-1" },
      key = privateKey,
    }: { header?: Record<string, unknown>; key?: KeyObject } = {},
  ) {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const input = `${encode(header)}.${encode(payload)}`;
    const signature = sign("sha256", Buffer.from(input), {
      key,
      dsaEncoding: "ieee-p1363",
    });
    return `${input}.${signature.toString("base64url")}`;
  }

  it("accepts a valid assertion and returns frozen claims", async () => {
    const { verifyEmbeddedIdentityAssertionV1 } = await reference();
    const payload = claims();
    const verified = verifyEmbeddedIdentityAssertionV1(mint(payload), {
      ...expected,
      jwks,
    });
    expect(verified).toEqual(payload);
    expect(Object.isFrozen(verified)).toBe(true);
  });

  it("accepts a previous key still published during rotation", async () => {
    const { verifyEmbeddedIdentityAssertionV1 } = await reference();
    const rotated = { keys: [jwk(other.publicKey, "key-2"), ...jwks.keys] };
    expect(
      verifyEmbeddedIdentityAssertionV1(mint(claims()), {
        ...expected,
        jwks: rotated,
      }).jti,
    ).toBeTypeOf("string");
    expect(
      verifyEmbeddedIdentityAssertionV1(
        mint(claims(), {
          header: { alg: "ES256", typ: "JWT", kid: "key-2" },
          key: other.privateKey,
        }),
        { ...expected, jwks: rotated },
      ).sub,
    ).toBe("user-1");
  });

  it("allows at most 30 seconds of clock skew", async () => {
    const {
      verifyEmbeddedIdentityAssertionV1,
      IDENTITY_ASSERTION_MAX_CLOCK_SKEW_SECONDS,
    } = await reference();
    expect(IDENTITY_ASSERTION_MAX_CLOCK_SKEW_SECONDS).toBe(30);
    const verifyAt = (payload: Record<string, unknown>) =>
      verifyEmbeddedIdentityAssertionV1(mint(payload), { ...expected, jwks });
    expect(() =>
      verifyAt(claims({ iat: now + 30, nbf: now + 30, exp: now + 90 })),
    ).not.toThrow();
    expect(() =>
      verifyAt(claims({ iat: now - 89, nbf: now - 89, exp: now - 29 })),
    ).not.toThrow();
    expect(() =>
      verifyAt(claims({ iat: now - 90, nbf: now - 90, exp: now - 30 })),
    ).toThrow(expect.objectContaining({ code: "expired" }));
    expect(() =>
      verifyAt(claims({ iat: now + 31, nbf: now + 31, exp: now + 91 })),
    ).toThrow(expect.objectContaining({ code: "not_yet_valid" }));
    expect(() => verifyAt(claims({ nbf: now + 31 }))).toThrow(
      expect.objectContaining({ code: "not_yet_valid" }),
    );
    expect(() => verifyAt(claims({ exp: "later" }))).toThrow(
      expect.objectContaining({ code: "malformed" }),
    );
  });

  it.each([
    ["issuer", { iss: `${issuer}/` }],
    ["issuer", { iss: issuer.replace("tenant-1", "tenant-2") }],
    ["audience", { aud: "https://other.example.test" }],
    ["audience", { aud: [expected.audience] }],
    ["plugin", { plugin_id: "other-plugin" }],
    ["widget", { widget_client_id: "widget-2" }],
    ["subject", { external_user_id: "user-2", sub: "user-2" }],
    ["subject", { sub: "user-2" }],
    ["subject", { external_user_id: undefined }],
  ])("rejects a mismatched claim (%s) %#", async (code, overrides) => {
    const { verifyEmbeddedIdentityAssertionV1 } = await reference();
    expect(() =>
      verifyEmbeddedIdentityAssertionV1(mint(claims(overrides)), {
        ...expected,
        jwks,
      }),
    ).toThrow(expect.objectContaining({ code }));
  });

  it("rejects bad signatures, algorithms, keys and token shapes", async () => {
    const { verifyEmbeddedIdentityAssertionV1 } = await reference();
    const check =
      (token: unknown, keys: unknown = jwks) =>
      () =>
        verifyEmbeddedIdentityAssertionV1(token, { ...expected, jwks: keys });
    const valid = mint(claims());
    const [header, payload, signature] = valid.split(".") as [
      string,
      string,
      string,
    ];
    const tampered = Buffer.from(
      JSON.stringify(claims({ external_user_id: "user-2", sub: "user-2" })),
    ).toString("base64url");
    expect(check(`${header}.${tampered}.${signature}`)).toThrow(
      expect.objectContaining({ code: "signature" }),
    );
    expect(check(mint(claims(), { key: other.privateKey }))).toThrow(
      expect.objectContaining({ code: "signature" }),
    );
    expect(check(`${header}.${payload}.${signature.slice(0, 40)}`)).toThrow(
      expect.objectContaining({ code: "signature" }),
    );
    for (const alg of ["none", "HS256", "ES384", undefined])
      expect(
        check(mint(claims(), { header: { alg, typ: "JWT", kid: "key-1" } })),
      ).toThrow(expect.objectContaining({ code: "algorithm" }));
    expect(
      check(
        mint(claims(), { header: { alg: "ES256", typ: "JWT", kid: "key-9" } }),
      ),
    ).toThrow(expect.objectContaining({ code: "unknown_key" }));
    expect(
      check(mint(claims(), { header: { alg: "ES256", typ: "JWT" } })),
    ).toThrow(expect.objectContaining({ code: "unknown_key" }));
    expect(check(valid, { keys: [{ ...jwks.keys[0], alg: "ES384" }] })).toThrow(
      expect.objectContaining({ code: "unknown_key" }),
    );
    expect(check(valid, { keys: [{ ...jwks.keys[0], use: "enc" }] })).toThrow(
      expect.objectContaining({ code: "unknown_key" }),
    );
    expect(check(valid, { keys: [{ ...jwks.keys[0], x: "AA" }] })).toThrow(
      expect.objectContaining({ code: "unknown_key" }),
    );
    expect(check(valid, {})).toThrow(
      expect.objectContaining({ code: "unknown_key" }),
    );
    for (const token of [
      undefined,
      "",
      `${header}.${payload}`,
      `${valid}.extra`,
      `${header}.${payload}.sig=`,
      `${Buffer.from("not json").toString("base64url")}.${payload}.${signature}`,
    ])
      expect(check(token)).toThrow(
        expect.objectContaining({ code: "malformed" }),
      );
    expect(check(mint([]))).toThrow(
      expect.objectContaining({ code: "malformed" }),
    );
  });
});
