import {
  TENANT_PROVISIONING_LOGO_MAX_BYTES,
  TENANT_PROVISIONING_LOGO_MIME_TYPES,
  validateCreateCustomerRequestV1,
  validateCreateCustomerResultV1,
} from "@opsrabbit/plugin-sdk";

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
  } catch {
    return { available: true, deploymentAdmin: false };
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
 * admin must use an explicit reset to get a new temporary password.
 */
export async function createCustomer(context, input, credential, attempts = 3) {
  const request = { ...input, requestId: input.requestId ?? newRequestId() };
  if (validateCreateCustomerRequestV1(request).length > 0)
    return { ok: false, code: "invalid_request" };
  let lastCode = "host_error";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await context.tenantProvisioning.createCustomer(request);
      // An unexpected result shape is not trusted, but the customer may already exist and any
      // password it carried is unusable: tell the admin to check the tenant list and reset.
      if (validateCreateCustomerResultV1(result).length > 0)
        return { ok: false, code: "host_error", checkTenantsAndReset: true };
      if (result.credential.kind === "temporary_password")
        credential.set(result.credential.value);
      return {
        ok: true,
        outcome: result.outcome,
        tenant: result.tenant,
        admin: result.admin,
        needsReset:
          result.outcome === "replayed" &&
          result.credential.reason === "already_issued",
      };
    } catch (error) {
      lastCode = typeof error?.code === "string" ? error.code : "host_error";
      if (lastCode !== "host_error") break;
    }
  }
  return { ok: false, code: lastCode };
}

/** Logo upload is separate from creation; a failure leaves the customer and can be retried. */
export async function uploadLogo(context, tenantId, file) {
  if (!TENANT_PROVISIONING_LOGO_MIME_TYPES.includes(file.type))
    return { ok: false, code: "logo_invalid" };
  if (file.size > TENANT_PROVISIONING_LOGO_MAX_BYTES)
    return { ok: false, code: "logo_too_large" };
  try {
    return {
      ok: true,
      logo: await context.tenantProvisioning.uploadLogo(tenantId, file),
    };
  } catch (error) {
    return {
      ok: false,
      code: typeof error?.code === "string" ? error.code : "host_error",
    };
  }
}
