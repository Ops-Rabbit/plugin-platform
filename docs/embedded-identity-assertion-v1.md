# Embedded identity assertion v1

SDK 0.38.0 adds the optional `context.embeddedChat.identityAssertion` field. During an Embedded
Chat tool call, the OpsRabbit host can give an eligible plugin a short-lived assertion, signed by
the host, saying "this tool call runs for end user X of widget W in tenant T". The plugin can
forward it to its own downstream API, which verifies it against the tenant's public key. The
feature is generic (not specific to any one customer), off by default, and controlled per widget
(and therefore per tenant) by an admin.

This document is for two readers: plugin authors, who receive and forward the assertion, and the
owners of the downstream API, who verify it. Runtime availability requires a host that implements
this contract.

## When a plugin receives it

`context.embeddedChat.identityAssertion` (string, compact JWS) is present only when ALL of these
hold:

1. The invocation is a plugin tool call inside a verified Embedded Chat turn
   (`context.embeddedChat` is present).
2. The widget's setting `identityAssertion.enabled` is `true` (default `false`).
3. The plugin's id is listed in the widget's `identityAssertion.pluginIds`.
4. The widget's `identityAssertion.audience` is set (1-200 characters, no whitespace or control
   characters).
5. The tenant has an active signing key (the host creates one the first time a widget in that
   tenant enables the feature).

In every other case the field is absent and the plugin behaves exactly as before. Older hosts
never set it, so a plugin must treat it as optional. There is no manifest capability and no
`minimumOpsRabbitVersion` gate: eligibility is the widget allow-list, which the admin controls.
Existing manifests and plugins are unchanged.

The assertion is minted at tool-execution time (one per tool call), never stored, logged,
returned to the model or browser, or written to turn metadata. Actions, scheduled jobs, routes and
every other invocation surface never receive it.

```ts
interface PluginInvocationContext {
  // ...
  readonly embeddedChat?: Readonly<{
    widgetId: string;
    externalUserId: string;
    identityAssertion?: string;
  }>;
}
```

## Plugin use

Forward the value unchanged, over HTTPS, to the plugin's own downstream API: the API whose
identifier the admin configured as the widget's `identityAssertion.audience`. When it is absent,
call the API exactly as before and let the API decide what an unasserted call may do.

```ts
const assertion = context.embeddedChat?.identityAssertion;
const response = await fetch("https://api.example.com/lookup", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(assertion === undefined
      ? {}
      : { "x-example-user-assertion": assertion }),
  },
  body: JSON.stringify(input),
  signal: context.signal,
});
```

The header name is an agreement between the plugin and its API; the contract does not fix one.
The plugin does not need to verify the assertion itself: `context.embeddedChat` is already the
host-verified identity.

### Security rules

- Never log the assertion, put it in error messages or audit metadata, or write it to tenant
  records, the plugin database, object storage or any cache.
- Never return it in tool output, include it in text the model sees, or show it to the user.
- Forward it only to the API that is its audience, and only over HTTPS. Never send it to a URL
  taken from tool arguments, conversation bindings, model output or other untrusted input.
- Do not reuse it for another tool call. Each call gets its own assertion, valid for 60 seconds.
- Treat it as a bearer credential for the end user: anyone holding it can act as that user
  towards the audience until it expires.

## Token format

Compact JWS, `alg: "ES256"` (P-256, signature in JOSE raw R||S form), header
`{ "alg": "ES256", "typ": "JWT", "kid": "<key id>" }`.

Claims:

| Claim              | Value                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `iss`              | `<public base URL>/widget/chat/identity/tenants/<tenantId>` (exact string, no trailing slash) |
| `aud`              | the widget's configured `identityAssertion.audience` (string)                                 |
| `sub`              | the verified `externalUserId`                                                                 |
| `external_user_id` | same as `sub`                                                                                 |
| `widget_client_id` | the verified `widgetId` (same value as `context.embeddedChat.widgetId`)                       |
| `tenant_id`        | tenant id                                                                                     |
| `plugin_id`        | the invoked plugin's id                                                                       |
| `tool_id`          | the invoked tool's id                                                                         |
| `iat`, `nbf`       | issue time (seconds)                                                                          |
| `exp`              | `iat + 60`, or earlier when the end user's chat session expires sooner                        |
| `jti`              | random UUID                                                                                   |

## Public keys (JWKS)

`GET <public base URL>/widget/chat/identity/tenants/<tenantId>/jwks.json` returns no-auth,
cacheable (`Cache-Control: public, max-age=300`)
`{ "keys": [ { "kty": "EC", "crv": "P-256", "x", "y", "kid", "alg": "ES256", "use": "sig" } ] }`
with the active key, a prepared key that does not sign yet, and any previous key still inside its
24-hour grace period. The private key
never leaves the host: it is stored encrypted, per tenant.

The JWKS URL is the issuer followed by `/jwks.json`. Configure the issuer (and therefore the JWKS
URL) in the downstream API for each tenant you accept; never build the URL from the `iss` of a
token you have not yet verified.

Caching: a downstream API may cache the JWKS for up to 300 seconds, as the response header allows.
When a token names a `kid` that is not in the cached set, refetch the JWKS once (rate-limit
refetches, for example to one per minute) before rejecting the token. The host throttles JWKS
lookups it has not cached and may answer `429` with `Retry-After`; keep serving the cached set
and retry after that delay. A new key can take up to 60 seconds to appear on every host process,
which the two-step rotation below absorbs.

Rotation is two-step, so no verifier ever sees a token signed by a key it cannot have:

1. An admin prepares a new key. It is published in the JWKS at once but does not sign.
2. Services that pin keys copy the updated JWKS (old and new key) and deploy. Services that fetch
   the JWKS have it within their cache lifetime.
3. The admin activates the new key. It signs from then on; the previous key stays in the JWKS for
   24 hours, then is removed, and pinned copies can drop it.

A service that fetches the JWKS also picks up a key it has not seen through the unknown-`kid`
refetch.

## Downstream verification (what a consuming API must check)

1. Signature: ES256 with the JWK whose `kid` matches the header (from the JWKS URL or a pinned
   copy).
2. `iss` equals the expected tenant issuer; `aud` equals the expected audience.
3. `exp` is in the future and `nbf`/`iat` are not in the future (allow at most 30 seconds of clock
   skew), and `exp - iat` is positive and at most 300 seconds.
4. `plugin_id` equals the expected plugin, and `widget_client_id` equals the expected widget.
5. `external_user_id` equals the end user the call claims to act for.
6. Recommended: when each endpoint serves one tool, `tool_id` equals that tool, so an assertion
   cannot be replayed against another tool's endpoint.

Reject the token if any check fails, and take every expected value from the API's own
configuration or request, never from the token. Accept only `alg: "ES256"`; reject `none`, HMAC
and every other algorithm. `sub` carries the same value as `external_user_id`, so a token where
they differ is malformed. `jti` is unique per assertion; the checklist does not require tracking
it, and a plugin may retry one downstream request with the same assertion while it is valid.

### Node example

Node's `crypto` verifies ES256 without a JWT library. JOSE signatures are raw R||S, so pass
`dsaEncoding: "ieee-p1363"`; the default DER encoding would reject every valid token.

```js
import { createPublicKey, verify } from "node:crypto";

export function verifyIdentityAssertion(token, expected) {
  const [h, p, s, extra] = token.split(".");
  if (!h || !p || !s || extra !== undefined) throw new Error("malformed");
  const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
  if (header.alg !== "ES256") throw new Error("algorithm");
  const jwk = expected.jwks.keys.find(
    (key) => key.kid === header.kid && key.kty === "EC" && key.crv === "P-256",
  );
  if (!jwk) throw new Error("unknown key");
  const ok = verify(
    "sha256",
    Buffer.from(`${h}.${p}`),
    {
      key: createPublicKey({ key: jwk, format: "jwk" }),
      dsaEncoding: "ieee-p1363",
    },
    Buffer.from(s, "base64url"),
  );
  if (!ok) throw new Error("signature");

  const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  const skew = 30;
  if (claims.iss !== expected.issuer) throw new Error("issuer");
  if (claims.aud !== expected.audience) throw new Error("audience");
  if (!(claims.exp + skew > now)) throw new Error("expired");
  if (!(claims.nbf - skew <= now && claims.iat - skew <= now))
    throw new Error("not yet valid");
  if (!(claims.exp > claims.iat && claims.exp - claims.iat <= 300))
    throw new Error("lifetime");
  if (claims.plugin_id !== expected.pluginId) throw new Error("plugin");
  if (claims.widget_client_id !== expected.widgetId) throw new Error("widget");
  if (
    claims.external_user_id !== expected.externalUserId ||
    claims.sub !== claims.external_user_id
  )
    throw new Error("subject");
  return claims;
}
```

The executable [reference](../packages/plugin-sdk/reference/embedded-identity-assertion.mjs)
contains a stricter version of this verifier (shape checks, JWK `alg`/`use` checks, signature
length, typed error codes) and the plugin-side forwarding helper. Its tests cover every check,
the clock-skew bounds and rotation, and `scripts/verify-embedded-identity-assertion-consumer.mjs`
runs it against the packed SDK outside the workspace.

## Testing a plugin that forwards it

`createTestContext` from `@opsrabbit/plugin-sdk/testing` accepts `embeddedChat` with an optional
`identityAssertion`:

```ts
const context = createTestContext({
  embeddedChat: {
    widgetId: "widget-1",
    externalUserId: "user-1",
    identityAssertion: "header.payload.signature",
  },
});
```

The harness copies and freezes the value and rejects an empty widget or user id and an
assertion that is not a compact JWS (`header.payload.signature`). Test both the present and the
absent case. `createAuthorizedTestContext` models actions and scheduled jobs, which are not tool
calls: a declared action keeps only `widgetId` and `externalUserId`, and a scheduled job receives
no `embeddedChat`.

## Host responsibilities

The host owns the widget setting and its validation, per-tenant key generation, encrypted storage
and rotation, the public JWKS route, eligibility checks and minting at tool execution, and keeping
the assertion out of logs, storage, turn metadata, model input and browser responses. The SDK
declares only the optional context field and documents the contract; it grants nothing by itself.
