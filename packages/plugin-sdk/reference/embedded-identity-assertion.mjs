import { Buffer } from "node:buffer";
import { createPublicKey, verify } from "node:crypto";
import { URL } from "node:url";

/**
 * Executable reference for embedded identity assertion v1
 * (docs/embedded-identity-assertion-v1.md). It has two halves:
 *
 * - `callDownstreamApi` is plugin code. A chat tool forwards
 *   `context.embeddedChat.identityAssertion`, unchanged and only over HTTPS, to
 *   the plugin's own API, which is the assertion's audience. It never logs,
 *   stores or returns the assertion.
 * - `verifyEmbeddedIdentityAssertionV1` is downstream API code. It applies the
 *   contract's verification checklist with Node `crypto` and no JWT library.
 */

/** Maximum clock skew, in seconds, the contract allows for `exp`, `nbf` and `iat`. */
export const IDENTITY_ASSERTION_MAX_CLOCK_SKEW_SECONDS = 30;

/** Longest `exp - iat` a verifier accepts. Hosts mint 60-second assertions. */
export const IDENTITY_ASSERTION_MAX_LIFETIME_SECONDS = 300;

/**
 * Calls the plugin's own downstream API for a chat tool. When the host supplied
 * an identity assertion, it is sent unchanged in `headerName`; when it is
 * absent (feature off, plugin not listed, or an older host) the call is made
 * exactly as before and the API decides what an unasserted call may do.
 */
export async function callDownstreamApi(
  context,
  { url, headerName, body, fetch },
) {
  const target = new URL(url);
  if (target.protocol !== "https:")
    throw new Error("The downstream API must use HTTPS.");
  const headers = { "content-type": "application/json" };
  const assertion = context.embeddedChat?.identityAssertion;
  if (typeof assertion === "string") headers[headerName] = assertion;
  const response = await fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: context.signal,
  });
  if (!response.ok) {
    // Log the status only: never the request headers or the assertion.
    context.logger.warn("Downstream API call failed.", {
      status: response.status,
    });
    throw new Error(`Downstream API returned ${response.status}.`);
  }
  return response.json();
}

export class IdentityAssertionError extends Error {
  constructor(code) {
    super(`Identity assertion rejected: ${code}.`);
    this.name = "IdentityAssertionError";
    this.code = code;
  }
}

const SEGMENT = /^[A-Za-z0-9_-]+$/;

function decodeJson(segment, code) {
  try {
    const value = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    );
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error("not an object");
    return value;
  } catch {
    throw new IdentityAssertionError(code);
  }
}

function isNumericDate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Verifies an embedded identity assertion and returns its frozen claims, or
 * throws `IdentityAssertionError`.
 *
 * `expected.jwks` is the tenant's JWKS (`{ keys: [...] }`), fetched from the
 * configured JWKS URL or pinned. `issuer`, `audience`, `pluginId`, `widgetId`
 * and `externalUserId` come from the API's own configuration and request,
 * never from the token. `toolId`, when given, is the tool the endpoint serves.
 * `nowSeconds` defaults to the current time.
 */
export function verifyEmbeddedIdentityAssertionV1(token, expected) {
  if (typeof token !== "string") throw new IdentityAssertionError("malformed");
  const parts = token.split(".");
  if (parts.length !== 3 || !parts.every((part) => SEGMENT.test(part)))
    throw new IdentityAssertionError("malformed");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  // 1. Signature: ES256 with the JWK whose kid matches the header.
  const header = decodeJson(encodedHeader, "malformed");
  if (header.alg !== "ES256") throw new IdentityAssertionError("algorithm");
  if (typeof header.kid !== "string" || header.kid === "")
    throw new IdentityAssertionError("unknown_key");
  const keys = Array.isArray(expected.jwks?.keys) ? expected.jwks.keys : [];
  const jwk = keys.find(
    (key) =>
      typeof key === "object" &&
      key !== null &&
      key.kid === header.kid &&
      key.kty === "EC" &&
      key.crv === "P-256" &&
      (key.alg === undefined || key.alg === "ES256") &&
      (key.use === undefined || key.use === "sig"),
  );
  if (!jwk) throw new IdentityAssertionError("unknown_key");
  const signature = Buffer.from(encodedSignature, "base64url");
  // JOSE ES256 signatures are raw R||S: 32 bytes each.
  if (signature.length !== 64) throw new IdentityAssertionError("signature");
  let publicKey;
  try {
    publicKey = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y },
      format: "jwk",
    });
  } catch {
    throw new IdentityAssertionError("unknown_key");
  }
  const signed = verify(
    "sha256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`, "ascii"),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    signature,
  );
  if (!signed) throw new IdentityAssertionError("signature");

  const claims = decodeJson(encodedPayload, "malformed");

  // 2. Issuer and audience.
  if (claims.iss !== expected.issuer)
    throw new IdentityAssertionError("issuer");
  if (claims.aud !== expected.audience)
    throw new IdentityAssertionError("audience");

  // 3. Lifetime, with at most 30 seconds of clock skew.
  const now = expected.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = IDENTITY_ASSERTION_MAX_CLOCK_SKEW_SECONDS;
  if (
    !isNumericDate(claims.exp) ||
    !isNumericDate(claims.nbf) ||
    !isNumericDate(claims.iat)
  )
    throw new IdentityAssertionError("malformed");
  if (claims.exp + skew <= now) throw new IdentityAssertionError("expired");
  if (claims.nbf - skew > now || claims.iat - skew > now)
    throw new IdentityAssertionError("not_yet_valid");
  if (
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > IDENTITY_ASSERTION_MAX_LIFETIME_SECONDS
  )
    throw new IdentityAssertionError("lifetime");

  // 4. Plugin and widget.
  if (claims.plugin_id !== expected.pluginId)
    throw new IdentityAssertionError("plugin");
  if (claims.widget_client_id !== expected.widgetId)
    throw new IdentityAssertionError("widget");
  // An API that maps each endpoint to one tool binds the assertion to it.
  if (expected.toolId !== undefined && claims.tool_id !== expected.toolId)
    throw new IdentityAssertionError("tool");

  // 5. The end user the call claims to act for (`sub` carries the same value).
  if (
    typeof claims.external_user_id !== "string" ||
    claims.external_user_id !== expected.externalUserId ||
    claims.sub !== claims.external_user_id
  )
    throw new IdentityAssertionError("subject");

  return Object.freeze({ ...claims });
}
