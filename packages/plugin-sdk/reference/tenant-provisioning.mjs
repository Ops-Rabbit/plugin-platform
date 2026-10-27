import {
  TENANT_PROVISIONING_LOGO_MAX_BYTES,
  parseCreateCustomerRequestV1,
  parseCreateCustomerResultV1,
  parseProvisionedTenantLogoV1,
} from "@opsrabbit/plugin-sdk";

/**
 * Returns the frozen copy a `parse*V1` function checked, or undefined. Use that copy, never the
 * original value: a getter or proxy could answer differently after the check.
 */
function parsed(parse, value) {
  try {
    return parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Executable reference for a native workspace that onboards customers. The same bundle serves
 * deployment admins and customer users: provisioning screens appear only after the host says
 * the viewer is a deployment admin, and every call is still authorized by the host.
 */
export async function loadProvisioningAccess(context) {
  const broker = context.tenantProvisioning;
  if (typeof broker?.getAuthority !== "function")
    return { available: false, deploymentAdmin: false };
  try {
    const { deploymentAdmin } = await broker.getAuthority();
    return { available: true, deploymentAdmin: deploymentAdmin === true };
  } catch (error) {
    // `not_available`: the host does not offer the broker to this workspace right now.
    return {
      available: error?.code !== "not_available",
      deploymentAdmin: false,
    };
  }
}

/** One retry key per submitted form; reuse it for retries of the same submission only. */
export function newRequestId() {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Holds a temporary password for exactly one display. `take()` returns it once and forgets it;
 * call `clear()` on navigation or unmount. Never put the value in storage, URLs, logs,
 * analytics, plugin actions, or error reports.
 */
export function createShowOnceCredential() {
  let value = null;
  return {
    set(next) {
      value = typeof next === "string" ? next : null;
    },
    take() {
      const current = value;
      value = null;
      return current;
    },
    clear() {
      value = null;
    },
    get pending() {
      return value !== null;
    },
  };
}

/**
 * Creates a customer, retrying transient failures with the same request id. A retry never
 * issues a second password: if the first response was lost, the result is `replayed` and the
 * admin must use an explicit reset to get a new temporary password. Only a `host_error` is
 * retried, with a growing delay; any other failure, including one without a code, stops.
 *
 * Every result carries the `requestId` that was used. Keep it with the form and pass it back as
 * `input.requestId` when the admin resubmits the same form, so a customer created by an attempt
 * whose response was lost comes back as `replayed` instead of `slug_taken`.
 */
export async function createCustomer(
  context,
  input,
  credential,
  attempts = 3,
  retryDelayMs = 500,
) {
  const requestId = input.requestId ?? newRequestId();
  // A password left from an earlier submission must never be shown with this customer.
  credential.clear();
  const request = parsed(parseCreateCustomerRequestV1, { ...input, requestId });
  if (!request) return { ok: false, code: "invalid_request", requestId };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0)
      await new Promise((resolve) =>
        globalThis.setTimeout(resolve, retryDelayMs * 2 ** (attempt - 1)),
      );
    try {
      const result = parsed(
        parseCreateCustomerResultV1,
        await context.tenantProvisioning.createCustomer(request),
      );
      // An unexpected result shape is not trusted, but the customer may already exist and any
      // password it carried is unusable: tell the admin to check the tenant list and reset.
      if (!result)
        return {
          ok: false,
          code: "host_error",
          requestId,
          checkTenantsAndReset: true,
        };
      if (result.credential.kind === "temporary_password")
        credential.set(result.credential.value);
      return {
        ok: true,
        requestId,
        outcome: result.outcome,
        tenant: result.tenant,
        admin: result.admin,
        needsReset:
          result.outcome === "replayed" &&
          result.credential.reason === "already_issued",
      };
    } catch (error) {
      if (error?.code !== "host_error")
        return {
          ok: false,
          code: typeof error?.code === "string" ? error.code : "host_error",
          requestId,
        };
    }
  }
  return { ok: false, code: "host_error", requestId };
}

/**
 * Logo upload is separate from creation; a failure leaves the customer and can be retried. The
 * host decides the image type from the bytes, so the browser's declared `file.type` is not
 * checked here; only the size is checked early to avoid a wasted upload.
 */
export async function uploadLogo(context, tenantId, file) {
  if (!(file instanceof globalThis.Blob))
    return { ok: false, code: "logo_invalid" };
  if (file.size > TENANT_PROVISIONING_LOGO_MAX_BYTES)
    return { ok: false, code: "logo_too_large" };
  try {
    const logo = parsed(
      parseProvisionedTenantLogoV1,
      await context.tenantProvisioning.uploadLogo(tenantId, file),
    );
    // An unexpected result shape is not trusted, in particular not as an `<img>` source.
    if (!logo) return { ok: false, code: "host_error" };
    return { ok: true, logo };
  } catch (error) {
    return {
      ok: false,
      code: typeof error?.code === "string" ? error.code : "host_error",
    };
  }
}
