import {
  TENANT_PROVISIONING_LOGO_MAX_BYTES,
  TENANT_PROVISIONING_LOGO_MIME_TYPES,
  TENANT_PROVISIONING_MAX_PAGE_SIZE,
} from "../contracts/tenant-provisioning.js";
import type {
  CreateCustomerRequestV1,
  CreateCustomerResultV1,
  ListProvisionedTenantsRequestV1,
  ProvisionedTenantLogoV1,
  ProvisionedTenantPageV1,
  ProvisionedTenantV1,
  ResetAdminCredentialRequestV1,
  ResetAdminCredentialResultV1,
  TenantProvisioningAuthorityV1,
  UpdateProvisionedTenantRequestV1,
} from "../contracts/tenant-provisioning.js";
import {
  PluginValidationError,
  type ValidationIssue,
} from "../contracts/errors.js";
import {
  CONTRACT_APPS_PATH,
  CONTRACT_CURSOR,
  CONTRACT_EMAIL,
  CONTRACT_IDENTIFIER,
  CONTRACT_PRINTABLE_SECRET,
  CONTRACT_RENDER_URL,
  CONTRACT_REQUEST_ID,
  CONTRACT_SHA256,
  CONTRACT_TENANT_SLUG,
  CONTRACT_TRIMMED_TEXT,
  CONTRACT_UTC,
  contractIssues,
  type ContractShape,
} from "./bounded-contract.js";

const identifier = {
  type: "string",
  pattern: CONTRACT_IDENTIFIER.source,
} as const;
const requestId = {
  type: "string",
  pattern: CONTRACT_REQUEST_ID.source,
} as const;
const displayName = {
  type: "string",
  minLength: 1,
  maxLength: 160,
  pattern: CONTRACT_TRIMMED_TEXT.source,
} as const;
const email = {
  type: "string",
  maxLength: 254,
  pattern: CONTRACT_EMAIL.source,
} as const;
const status = { enum: ["active", "disabled", "archived"] } as const;
const cursor = { type: "string", pattern: CONTRACT_CURSOR.source } as const;
const temporaryPassword = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "value"],
  properties: {
    kind: { const: "temporary_password" },
    value: { type: "string", pattern: CONTRACT_PRINTABLE_SECRET.source },
  },
} as const;
function noCredential(reasons: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "reason"],
    properties: { kind: { const: "none" }, reason: { enum: reasons } },
  } as const;
}

const LOGO = {
  type: "object",
  additionalProperties: false,
  required: ["url", "mimeType", "sizeBytes", "sha256", "version"],
  properties: {
    url: {
      type: "string",
      maxLength: 2048,
      pattern: CONTRACT_RENDER_URL.source,
    },
    mimeType: { enum: TENANT_PROVISIONING_LOGO_MIME_TYPES },
    sizeBytes: {
      type: "integer",
      minimum: 1,
      maximum: TENANT_PROVISIONING_LOGO_MAX_BYTES,
    },
    sha256: { type: "string", pattern: CONTRACT_SHA256.source },
    version: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  },
} as const satisfies ContractShape;

const ADMIN = {
  type: "object",
  additionalProperties: false,
  required: ["userId", "email", "displayName", "account", "credentialState"],
  properties: {
    userId: identifier,
    email,
    displayName,
    account: { enum: ["created", "existing"] },
    credentialState: {
      enum: ["pending_first_sign_in", "active", "not_managed"],
    },
  },
} as const satisfies ContractShape;

const TENANT = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "slug",
    "displayName",
    "status",
    "homePath",
    "createdAt",
    "admin",
    "logo",
  ],
  properties: {
    id: identifier,
    slug: {
      type: "string",
      minLength: 2,
      maxLength: 80,
      pattern: CONTRACT_TENANT_SLUG.source,
    },
    displayName,
    status,
    homePath: {
      type: "string",
      maxLength: 200,
      pattern: CONTRACT_APPS_PATH.source,
    },
    createdAt: { type: "string", pattern: CONTRACT_UTC.source },
    admin: { oneOf: [{ type: "null" }, ADMIN] },
    logo: { oneOf: [{ type: "null" }, LOGO] },
  },
} as const satisfies ContractShape;

const CREATED_ADMIN = {
  type: "object",
  additionalProperties: false,
  required: ["userId", "email", "account"],
  properties: {
    userId: identifier,
    email,
    account: { enum: ["created", "existing"] },
  },
} as const satisfies ContractShape;

const AUTHORITY = {
  type: "object",
  additionalProperties: false,
  required: ["deploymentAdmin"],
  properties: { deploymentAdmin: { type: "boolean" } },
} as const satisfies ContractShape;

const CREATE_CUSTOMER_REQUEST = {
  type: "object",
  additionalProperties: false,
  required: ["requestId", "tenant", "admin"],
  properties: {
    requestId,
    tenant: {
      type: "object",
      additionalProperties: false,
      required: ["slug", "displayName"],
      properties: { slug: TENANT.properties.slug, displayName },
    },
    admin: {
      type: "object",
      additionalProperties: false,
      required: ["email", "displayName"],
      properties: { email, displayName },
    },
  },
} as const satisfies ContractShape;

const RESET_ADMIN_CREDENTIAL_REQUEST = {
  type: "object",
  additionalProperties: false,
  required: ["requestId", "tenantId", "userId"],
  properties: { requestId, tenantId: identifier, userId: identifier },
} as const satisfies ContractShape;

const LIST_TENANTS_REQUEST = {
  type: "object",
  additionalProperties: false,
  properties: {
    cursor,
    limit: {
      type: "integer",
      minimum: 1,
      maximum: TENANT_PROVISIONING_MAX_PAGE_SIZE,
    },
  },
} as const satisfies ContractShape;

const UPDATE_TENANT_REQUEST = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: { displayName, status },
} as const satisfies ContractShape;

const CREATE_CUSTOMER_CREATED = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "tenant", "admin", "credential"],
  properties: {
    outcome: { const: "created" },
    tenant: TENANT,
    admin: CREATED_ADMIN,
    credential: {
      oneOf: [temporaryPassword, noCredential(["existing_account"])],
    },
  },
} as const satisfies ContractShape;

const CREATE_CUSTOMER_REPLAYED = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "tenant", "admin", "credential"],
  properties: {
    outcome: { const: "replayed" },
    tenant: TENANT,
    admin: CREATED_ADMIN,
    credential: noCredential(["existing_account", "already_issued"]),
  },
} as const satisfies ContractShape;

const RESET_RESET = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "tenantId", "userId", "credential"],
  properties: {
    outcome: { const: "reset" },
    tenantId: identifier,
    userId: identifier,
    credential: temporaryPassword,
  },
} as const satisfies ContractShape;

const RESET_REPLAYED = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "tenantId", "userId", "credential"],
  properties: {
    outcome: { const: "replayed" },
    tenantId: identifier,
    userId: identifier,
    credential: noCredential(["already_issued"]),
  },
} as const satisfies ContractShape;

const TENANT_PAGE = {
  type: "object",
  additionalProperties: false,
  required: ["tenants", "nextCursor"],
  properties: {
    tenants: {
      type: "array",
      maxItems: TENANT_PROVISIONING_MAX_PAGE_SIZE,
      items: TENANT,
    },
    nextCursor: { oneOf: [{ type: "null" }, cursor] },
  },
} as const satisfies ContractShape;

const SCHEMA = "https://json-schema.org/draft/2020-12/schema";
const ID = "https://opsrabbit.dev/schemas";

/** Published request schema; select an operation with `#/$defs/<name>`. */
export const TENANT_PROVISIONING_REQUEST_SCHEMA = {
  $schema: SCHEMA,
  $id: `${ID}/opsrabbit-tenant-provisioning-request.schema.json`,
  $defs: {
    createCustomer: CREATE_CUSTOMER_REQUEST,
    resetAdminCredential: RESET_ADMIN_CREDENTIAL_REQUEST,
    listTenants: LIST_TENANTS_REQUEST,
    updateTenant: UPDATE_TENANT_REQUEST,
  },
  oneOf: [
    { $ref: "#/$defs/createCustomer" },
    { $ref: "#/$defs/resetAdminCredential" },
    { $ref: "#/$defs/listTenants" },
    { $ref: "#/$defs/updateTenant" },
  ],
} as const;

/** Published result schema; select an operation with `#/$defs/<name>`. */
export const TENANT_PROVISIONING_RESULT_SCHEMA = {
  $schema: SCHEMA,
  $id: `${ID}/opsrabbit-tenant-provisioning-result.schema.json`,
  $defs: {
    authority: AUTHORITY,
    logo: LOGO,
    // `getLogo` answers null when the tenant has no logo; `uploadLogo` always returns a logo.
    getLogo: { oneOf: [{ type: "null" }, { $ref: "#/$defs/logo" }] },
    tenant: TENANT,
    tenantPage: TENANT_PAGE,
    createCustomer: {
      oneOf: [CREATE_CUSTOMER_CREATED, CREATE_CUSTOMER_REPLAYED],
    },
    resetAdminCredential: { oneOf: [RESET_RESET, RESET_REPLAYED] },
  },
  oneOf: [
    { $ref: "#/$defs/authority" },
    { $ref: "#/$defs/getLogo" },
    { $ref: "#/$defs/tenant" },
    { $ref: "#/$defs/tenantPage" },
    { $ref: "#/$defs/createCustomer" },
    { $ref: "#/$defs/resetAdminCredential" },
  ],
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Largest array or object `plainCopy` walks; above every contract bound (100 tenants per page). */
const MAX_COPY_ENTRIES = 1_000;

/**
 * Copies own enumerable data properties of plain objects and arrays. Accessors, symbols, class
 * instances, and cycles are rejected so validation and the returned value see the same data.
 */
function plainCopy(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  depth = 0,
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth > 6) {
    issues.push({
      path,
      code: "invalid",
      message: "Value is nested too deeply.",
    });
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  const array = Array.isArray(value);
  if (
    (array && prototype !== Array.prototype) ||
    (!array && prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    issues.push({ path, code: "type", message: "Expected plain JSON data." });
    return undefined;
  }
  // Bound the walk before allocating anything: contract arrays hold at most a page of tenants and
  // objects a handful of fields, so a sparse or huge input is rejected without being iterated.
  const length = array
    ? (value as unknown[]).length
    : Object.keys(value).length;
  if (length > MAX_COPY_ENTRIES) {
    issues.push({
      path,
      code: "invalid",
      message: "Value has too many entries.",
    });
    return undefined;
  }
  const keys = array
    ? Array.from({ length }, (_, index) => String(index))
    : Object.keys(value);
  const copy: Record<string, unknown> | unknown[] = array ? [] : {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const childPath = array ? `${path}[${key}]` : `${path}.${key}`;
    if (!descriptor || !("value" in descriptor)) {
      issues.push({
        path: childPath,
        code: "type",
        message: "Expected an own data property.",
      });
      continue;
    }
    // An optional field set to undefined is the same as an absent one, as in JSON.
    if (!array && descriptor.value === undefined) continue;
    // defineProperty keeps keys such as "__proto__" as own data that validation then rejects;
    // plain assignment would change the copy's prototype and hide the key from validation.
    Object.defineProperty(copy, key, {
      value: plainCopy(descriptor.value, childPath, issues, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function checked(
  value: unknown,
  validate: (copy: unknown) => ValidationIssue[],
): { copy: unknown; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const copy = plainCopy(value, "$", issues);
  return { copy, issues: issues.length > 0 ? issues : validate(copy) };
}

function parse<T>(
  value: unknown,
  validate: (copy: unknown) => ValidationIssue[],
): T {
  const { copy, issues } = checked(value, validate);
  if (issues.length > 0) throw new PluginValidationError(issues);
  return deepFreeze(copy) as T;
}

/** Validates the variant selected by a distinct `outcome`, so issues name exact fields. */
function byOutcome(
  value: unknown,
  variants: Readonly<Record<string, ContractShape>>,
): ValidationIssue[] {
  if (!record(value))
    return [{ path: "$", code: "type", message: "Result must be an object." }];
  const outcome = value.outcome;
  if (typeof outcome !== "string" || !Object.hasOwn(variants, outcome))
    return [
      {
        path: "$.outcome",
        code: "invalid",
        message: "Unknown result outcome.",
      },
    ];
  return contractIssues(value, variants[outcome]!);
}

function validator(shape: ContractShape) {
  return (value: unknown) =>
    checked(value, (copy) => contractIssues(copy, shape)).issues;
}

export const validateCreateCustomerRequestV1 = validator(
  CREATE_CUSTOMER_REQUEST,
);
export const validateResetAdminCredentialRequestV1 = validator(
  RESET_ADMIN_CREDENTIAL_REQUEST,
);
// The list request is optional: an omitted (undefined) one means the first default-sized page.
// `null` is not omitted and is rejected, as by the published schema.
const validateListRequest = validator(LIST_TENANTS_REQUEST);
export const validateListProvisionedTenantsRequestV1 = (value: unknown) =>
  validateListRequest(value === undefined ? {} : value);
export const validateUpdateProvisionedTenantRequestV1 = validator(
  UPDATE_TENANT_REQUEST,
);
export const validateTenantProvisioningAuthorityV1 = validator(AUTHORITY);
export const validateProvisionedTenantV1 = validator(TENANT);
export const validateProvisionedTenantPageV1 = validator(TENANT_PAGE);
export const validateProvisionedTenantLogoV1 = validator(LOGO);

const CREATE_RESULTS = {
  created: CREATE_CUSTOMER_CREATED,
  replayed: CREATE_CUSTOMER_REPLAYED,
} as const;
const RESET_RESULTS = { reset: RESET_RESET, replayed: RESET_REPLAYED } as const;

/** A `replayed` result that carries a temporary password is rejected. */
export function validateCreateCustomerResultV1(
  value: unknown,
): ValidationIssue[] {
  return checked(value, (copy) => byOutcome(copy, CREATE_RESULTS)).issues;
}

/** A `replayed` result that carries a temporary password is rejected. */
export function validateResetAdminCredentialResultV1(
  value: unknown,
): ValidationIssue[] {
  return checked(value, (copy) => byOutcome(copy, RESET_RESULTS)).issues;
}

/** Returns a frozen copy, or throws `PluginValidationError`. */
export function parseCreateCustomerRequestV1(
  value: unknown,
): CreateCustomerRequestV1 {
  return parse(value, (copy) => contractIssues(copy, CREATE_CUSTOMER_REQUEST));
}
export function parseResetAdminCredentialRequestV1(
  value: unknown,
): ResetAdminCredentialRequestV1 {
  return parse(value, (copy) =>
    contractIssues(copy, RESET_ADMIN_CREDENTIAL_REQUEST),
  );
}
export function parseListProvisionedTenantsRequestV1(
  value: unknown,
): ListProvisionedTenantsRequestV1 {
  return parse(value === undefined ? {} : value, (copy) =>
    contractIssues(copy, LIST_TENANTS_REQUEST),
  );
}
export function parseUpdateProvisionedTenantRequestV1(
  value: unknown,
): UpdateProvisionedTenantRequestV1 {
  return parse(value, (copy) => contractIssues(copy, UPDATE_TENANT_REQUEST));
}
export function parseTenantProvisioningAuthorityV1(
  value: unknown,
): TenantProvisioningAuthorityV1 {
  return parse(value, (copy) => contractIssues(copy, AUTHORITY));
}
export function parseProvisionedTenantV1(value: unknown): ProvisionedTenantV1 {
  return parse(value, (copy) => contractIssues(copy, TENANT));
}
export function parseProvisionedTenantPageV1(
  value: unknown,
): ProvisionedTenantPageV1 {
  return parse(value, (copy) => contractIssues(copy, TENANT_PAGE));
}
export function parseProvisionedTenantLogoV1(
  value: unknown,
): ProvisionedTenantLogoV1 {
  return parse(value, (copy) => contractIssues(copy, LOGO));
}
export function parseCreateCustomerResultV1(
  value: unknown,
): CreateCustomerResultV1 {
  return parse(value, (copy) => byOutcome(copy, CREATE_RESULTS));
}
export function parseResetAdminCredentialResultV1(
  value: unknown,
): ResetAdminCredentialResultV1 {
  return parse(value, (copy) => byOutcome(copy, RESET_RESULTS));
}
