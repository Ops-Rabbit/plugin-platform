# Tenant Provisioning v1 (2026-10-23)

Status: implemented locally on 2026-10-24 (SDK/CLI 0.37.0), not committed or published. Host implementation is planned in OpsRabbit
`docs/plans/plugin-tenant-provisioning-2026-10-23.md` (branch
`feat/tenant-provisioning`).

## Scope

A generic, versioned capability that lets a plugin's own native workspace onboard
customers while OpsRabbit stays the owner of tenants, users, sign-in, credentials
and branding.

In scope:

- A manifest declaration `capabilities.tenantProvisioning` (schema version `1`)
  and a frontend capability `tenant.provisioning.manage`.
- A browser broker `context.tenantProvisioning` on `OpsRabbitWorkspaceContext`
  with: authority check, one-step customer creation, explicit credential reset,
  list/get/update of tenants this plugin provisioned, logo upload and logo read.
- Request/result types, open error codes, JSON Schemas, runtime parsers,
  documentation, an executable reference, a test harness fake and tests.

Out of scope for v1 (future work): a backend (plugin server-side) broker, bulk
provisioning, extra admin users per tenant, tenant deletion, SSO-only first
admins, colors/fonts/favicon branding.

## Finishing criteria

- A manifest can declare the capability only together with a frontend workspace
  that requests `tenant.provisioning.manage`, and only with a
  `minimumOpsRabbitVersion` at or above the host version that ships it. Every
  other combination is rejected by both `validateManifest` and the JSON Schema.
- `context.tenantProvisioning` is typed, documented and absent when the host does
  not support it or the manifest does not declare it. Plugins treat absence as
  "not available".
- Results never carry a credential except on the one response that issued it.
  Types make the credential a discriminated union so a replay cannot carry one.
- Reference + clean-consumer script run against the packed SDK.
- `pnpm quality` passes; version 0.37.0 (both packages) with changelog,
  README, starter reference and training course updated.

## Design

### Manifest

```json
{
  "minimumOpsRabbitVersion": "<host version that ships v1>",
  "capabilities": {
    "tenantProvisioning": { "schemaVersion": "1", "logo": true }
  },
  "navigation": {
    "kind": "plugin_workspace",
    "moduleKey": "customer-app",
    "path": "/apps/customer-app",
    "icon": "…",
    "fallbackTitle": "…"
  },
  "frontend": {
    "kind": "native_workspace",
    "capabilities": ["tenant.provisioning.manage"]
  }
}
```

The `frontend` example omits its other required fields.

- `logo` (default `false`) gates the logo upload and read methods.
- Declaring `tenant.provisioning.manage` without the capability is rejected, and
  so is declaring the capability without it.
- The capability requires a native `frontend` and its workspace `navigation`.
  `navigation.adminOnly` must not be `true` (see "Tenant home" below).
- The minimum host version gate follows the existing `if`/`then` pattern in
  `opsrabbit-plugin.schema.json` and `hasMinimumVersion` in `manifest.ts`. The
  exact version is fixed when the host change is ready: the next host version
  above the highest existing gate.

### Tenant home

A plugin has exactly one workspace. Both `navigation` and `frontend` are single
objects (`contracts/manifest.ts`, `PluginManifest.navigation` and `.frontend`),
so it has one `moduleKey` and one page at `/apps/<moduleKey>`. That workspace is
the new tenant's home. The contract adds no field to choose it.

- **One workspace, two audiences.** Deployment admins and customer users load the
  same bundle.
  - The bundle calls `getAuthority()` and shows provisioning screens only when it
    returns `deploymentAdmin: true`.
  - Everyone else gets the plugin's normal customer experience.
  - Any further screens are routed inside the bundle. OpsRabbit still sees one
    workspace with one capability set.
- **What the host does.** It sets the new tenant's home page to
  `/apps/<navigation.moduleKey>`, turns fullscreen on and turns "allow exit" off.
  These are the host's existing tenant settings (`home_path`, `home_fullscreen`,
  `home_fullscreen_allow_exit`). After sign-in, and after the forced password
  change, the customer sees only the plugin. No OpsRabbit chrome is shown.
- **Why the request cannot choose it.** A request field would let a call point a
  tenant's home at any path, including OpsRabbit pages or another plugin's
  workspace. Deriving it from the calling plugin's own navigation removes that
  option.
- **Validation (SDK and JSON Schema), fail closed.** The manifest is rejected
  when:
  - the capability has no native `frontend`;
  - it has no workspace `navigation`;
  - `navigation.adminOnly` is `true`, because non-admin users added to the
    customer tenant later could not open their own home page.
- **Host check at call time.** The host takes the module key from the calling
  plugin's active package. If that package has no workspace navigation, creation
  fails with `not_available`. The host never sets a home path that does not
  resolve.
- **Future work.** If the contract later allows several workspaces per plugin, a
  v2 can add a field naming the customer workspace. v1 does not anticipate it.

### Tenant enablement of the plugin

The plugin never enables itself. The contract gives it no "enable plugin" call
and no enablement field in the request. Enablement is a side effect that the
host performs, inside `createCustomer`, because:

1. the manifest declares `capabilities.tenantProvisioning` (approved with the
   package), and
2. the caller is a live deployment admin working in that plugin's workspace.

Plugins can rely on this guarantee: when `createCustomer` returns `created` or
`replayed`, the calling plugin is enabled for the returned tenant. The tenant's
home page opens that plugin's workspace. Every other plugin stays at its
default, which is disabled for a new tenant.

Host side (detail in the OpsRabbit plan, "New service"):

- **Which plugin.** The host resolves the caller from the workspace route,
  using `moduleKey` and the generation digest of the active package. It does not
  take a plugin id from the request, so a plugin cannot enable a different
  plugin.
- **Preconditions, fail closed.**
  - The plugin must be deployed, loaded from a managed package, not
    policy-blocked, and enabled globally (`plugin_runtime_profiles.enabled`).
  - If the global switch is off, the call fails with `not_available` and no
    tenant is created. Tenant enablement can only narrow the global ceiling,
    never bypass it.
- **How.** The host writes the per-tenant enable row
  (`tenant_plugin_runtime_profiles`, `enabled = true`). Initial tenant settings
  are seeded the same way the host's own "enable for tenant" admin action seeds
  them. It also writes a `tenant.plugin.enabled` audit row.
- **Atomicity.** This happens in the same database transaction as:
  - the tenant;
  - the first admin and their membership;
  - the home page settings;
  - the ownership marker;
  - the retry record.

  If enablement fails, nothing is created. The host does this by reusing the
  logic of its existing enable action from inside the provisioning transaction,
  not by calling that action separately.

- **Authority.** The host's normal "enable for tenant" action needs the caller to
  be a tenant admin of the target tenant. A brand-new tenant has no members yet.
  Here the authority is the live deployment-admin check plus the declared
  capability, and both are re-checked inside the transaction.
- **Afterwards.** The tenant is an ordinary tenant with the plugin enabled.
  Disabling the plugin later uses the host's normal admin action (no plugin call
  in v1). A disabled tenant still opens the home path, but the workspace refuses
  to load, as with any disabled plugin. The ownership marker remains, so the
  provisioning plugin can still see and manage the tenant.

### Browser broker (`contracts/tenant-provisioning.ts`)

```ts
interface PluginTenantProvisioningService {
  getAuthority(): Promise<{ deploymentAdmin: boolean }>;
  createCustomer(request: CreateCustomerRequest): Promise<CreateCustomerResult>;
  resetAdminCredential(
    request: ResetAdminCredentialRequest,
  ): Promise<ResetAdminCredentialResult>;
  listTenants(request?: {
    cursor?: string;
    limit?: number;
  }): Promise<ProvisionedTenantPage>;
  getTenant(tenantId: string): Promise<ProvisionedTenant>;
  updateTenant(
    tenantId: string,
    patch: {
      displayName?: string;
      status?: "active" | "disabled" | "archived";
    },
  ): Promise<ProvisionedTenant>;
  uploadLogo(tenantId: string, file: Blob): Promise<ProvisionedTenantLogo>; // logo: true only
  getLogo(tenantId: string): Promise<ProvisionedTenantLogo | null>; // logo: true only
}
```

- `getAuthority` is a live host round trip, not a cached flag, so the UI shows
  provisioning screens only when it returns `deploymentAdmin: true`. It is a UX
  hint: every other method is re-authorized by the host.
- `CreateCustomerRequest`: `requestId` (client-generated, 16–128 chars,
  `[A-Za-z0-9_-]`), `tenant { slug, displayName }`, `admin { email, displayName }`.
  No password field exists anywhere in the request types.
- `CreateCustomerResult`:
  - `outcome: "created" | "replayed"`
  - `tenant: ProvisionedTenant` (id, slug, displayName, status, createdAt,
    homePath, logo summary)
  - `admin: { userId, email, account: "created" | "existing" }`
  - `credential`:
    - `{ kind: "temporary_password"; value: string }` only on
      the first `created` response for a newly created account;
    - `{ kind: "none"; reason: "existing_account" }` when the email already had
      an account (its password is never touched);
    - `{ kind: "none"; reason: "already_issued" }` on every replay.
- Same `requestId` + same payload → `replayed`, no new password. Same
  `requestId` + different payload → `request_conflict`. A lost first response is
  recovered with `resetAdminCredential`, never by retrying.
- `ResetAdminCredentialRequest`: `requestId`, `tenantId`, `userId`. Result has the
  same `credential` union (`temporary_password` once, `already_issued` on replay).
  Only accounts the host created through this plugin's provisioning can be
  reset; others return `credential_not_resettable`.
- `ProvisionedTenant.admin.credentialState`: `pending_first_sign_in | active`
  so the UI can offer reset. Never includes a value. The temporary password does
  not expire; it stays valid until the user changes it at first sign-in or an
  admin resets it.
- Logo: PNG, JPEG or WebP, at most 2 MiB, verified by the host from bytes.
  `ProvisionedTenantLogo` = `{ url, mimeType, sizeBytes, sha256, version }`; the
  URL is a host URL the plugin may render in an `<img>`. The plugin keeps no copy.

### Errors

`PluginTenantProvisioningError` with open `code`:
`not_available`, `forbidden` (not a live deployment admin), `not_found` (unknown
tenant or tenant not provisioned by this plugin; indistinguishable),
`invalid_request`, `slug_taken`, `request_conflict`, `account_unavailable`
(existing account is banned/locked or is otherwise not eligible),
`credential_not_resettable`, `license_limit`, `logo_invalid`, `logo_too_large`,
`host_error`. Plugins must treat unknown codes as failures.

### Validation (`validation/tenant-provisioning.ts`)

Own-data-property parsers that return frozen copies for each request and result,
bounded strings, email syntax, slug syntax matching the host tenant slug rule,
and a parser that rejects a `temporary_password` credential on a `replayed`
result. Published as `./tenant-provisioning-request-schema` and
`./tenant-provisioning-result-schema`.

### Testing harness

`createTestWorkspaceContext` gains an in-memory fake broker. It does idempotent
replay, ownership scoping and credential issue/reset. The fake keeps the
credential value only in the returned object. Tests assert it is absent from the
fake's state.

### Reference

`reference/tenant-provisioning.mjs` is a minimal workspace module: an authority
gate, a create form, show-once credential display that clears on navigation, and
a logo upload with retry. `scripts/verify-tenant-provisioning-consumer.mjs`
installs the packed SDK in a temp dir and runs the reference against the fake.
Wire it into `verify-generated-starters.mjs`. This is a reference, not a new
starter, so the starter id lists are unchanged.

## Host compatibility and ownership (goes in `docs/tenant-provisioning-v1.md`)

The plugin declares intent. The host owns all of the following:

- **Authority:** a live deployment-admin check on every call, inside the
  mutating transaction. A customer admin can never become a deployment admin.
- **Atomicity:** tenant, first admin account, admin membership, plugin enablement,
  home page, ownership marker and audit records are committed in one transaction.
- **Credentials:** the host generates and hashes the credential, forces a change
  at first sign-in, rejects reuse and revokes it on reset. It is never stored in retry
  records or audit.
- **Ownership:** the plugin can only see or change tenants it provisioned.
- **Branding:** the logo is stored in host per-tenant branding.
- **Fail closed:** a missing capability, a host older than the minimum version,
  a disabled or blocked plugin, or a failed authority check means the plugin gets
  no broker or the call is denied.

## Tests (`test/tenant-provisioning.test.ts`)

- Manifest: accepts the valid declaration. Rejects:
  - the capability without a native `frontend` or workspace `navigation`;
  - the capability with `navigation.adminOnly: true`;
  - a frontend capability without the backend one, and the reverse;
  - a host older than the minimum;
  - an unknown `schemaVersion`.
- Manifests without the capability are left unchanged.
- Schema parity: the Ajv result for the manifest JSON Schema matches
  `validateManifest`, and the published request/result schemas match the
  runtime constants.
- Parsers:
  - reject a password field anywhere in a request;
  - reject a `replayed` result that carries a credential;
  - enforce bounds;
  - return frozen copies.
- Harness fake:
  - replay returns no credential;
  - a conflicting payload is rejected;
  - the fake hides other plugins' tenants;
  - reset replaces the credential;
  - the credential value never appears in serialized fake state.
- Packaging: new schema files appear in `verify-packed-packages.mjs` and the
  inventory.
- Clean consumer: the reference runs from the packed tarball.

## Docs and release

New `docs/tenant-provisioning-v1.md` (Declaration / Runtime / Credentials /
Logo / Errors / Host responsibilities / Testing / Future work). Update root and
SDK READMEs, `docs/starter-reference.md`, `docs/training-course.md`
(`## Tenant provisioning (SDK 0.37.0)`) and `CHANGELOG.md`. Bump both packages
and `constants.ts` to 0.37.0.

## Authorization and data lifecycle

The SDK stores nothing. The plugin is told not to persist, log or send the
temporary password anywhere and to render it only from the one result. That rule
is stated in the doc, the reference and the training course. All data lifecycle
is host-owned (see the host plan).

## Prior art

Reviewed 2026-10-24. `applied-ai-consulting/claude-code` is private and not
code-search indexed, so it was searched from the tarball at the exact SHA.
`openai/codex` was searched with code search plus its tarball.

- **`applied-ai-consulting/claude-code@dfb44640ca1c2b64b882a15edf73ec0374d41d9a`
  (`develop`)**
  - **Reviewed:**
    - `bridge/debugUtils.ts` (`redactSecrets` replaces named fields before
      debug logging);
    - `services/teamMemorySync/secretScanner.ts` (regex span redaction);
    - `bridge/workSecret.ts` (rejects a secret version other than 1);
    - `bridge/bridgeMessaging.ts` (`BoundedUUIDSet`, an in-memory
      redelivery dedup);
    - `services/mcp/client.ts` (a missing MCP capability yields an empty
      surface);
    - `bridge/bridgeEnabled.ts` and `bridge/envLessBridgeConfig.ts` (a
      minimum version gate).
  - **Adopted:**
    - an absent capability means an absent feature: no broker unless the
      manifest declares it and the host meets the minimum version;
    - fail closed on an unknown schema version;
    - a clear minimum-version error;
    - a fixed secret-field list as a second logging layer.
  - **Rejected:**
    - partial masking, which keeps the first and last characters; the
      temporary password must never be logged at all;
    - regex scanning as the primary control;
    - in-memory UUID dedup, which is lost on restart and has no
      fingerprint, so it cannot be a retry record.
- **`openai/codex@970111f6cb62cc02fe36a82ea7d71b37a2889c97` (`main`)**
  - **Reviewed:**
    - `codex-rs/secrets/src/sanitizer.rs` (regex redaction);
    - `codex-rs/app-server/src/request_processors/projects.rs` and
      `codex-rs/state/src/runtime/projects.rs` with
      `codex-rs/state/migrations/0049_projects.sql` (the idempotency key is
      looked up and inserted in the same transaction as the create, and
      `created: false` is returned on a hit);
    - `codex-rs/app-server-protocol/src/protocol/v1.rs` and
      `experimental_api.rs` (opt-in capabilities with a stable "requires X
      capability" error).
  - **Adopted:**
    - a bounded, validated retry key;
    - the key insert in the same transaction as the provisioning write;
    - an explicit `replayed` outcome;
    - a stable error when a gated call lacks its capability.
  - **Rejected:**
    - a key lookup without a payload fingerprint, where a changed payload
      silently replays; ours returns `request_conflict`;
    - replaying the full stored entity; ours replays a credential-free
      result and never re-issues the password;
    - version-dependent response downgrades; an unsupported host gets no
      broker.
- **Gap:** neither repository has a show-once credential flow. Our design
  (generate, hash, return once, never persist) has no direct precedent there.

## Closeout

Implemented on branch `feat/tenant-provisioning` at SDK/CLI 0.37.0; not committed, pushed or published.

Deviations from the design above:

- The test fake is the standalone `createTestTenantProvisioningService` exported from `./testing`, following `createTestAgentRunObservationService`. There is no `createTestWorkspaceContext` in the SDK.
- `ProvisionedTenantAdminV1.credentialState` adds `not_managed` for accounts that existed before provisioning.
- `ProvisionedTenantLogoV1.url` is a host path or an absolute http(s) URL on the host API origin, because the API usually runs on a different origin from the web app.
- The minimum host version is 0.12.0, confirmed on 2026-10-27. The OpsRabbit host ships tenant provisioning after it implements chat turn records (0.11.0); see the OpsRabbit plan.
- New bounded-contract patterns are registered in `validation/bounded-contract.ts` so the JSON Schemas and runtime validators share the same expressions.

Verification:

- `pnpm quality` in a Linux `node:24.22.1` container on a clean LF copy: format, lint, check, 681 SDK tests with coverage, CLI tests, build, packed inventory, every clean-consumer script including `verify-tenant-provisioning-consumer.mjs`, and all generated starters. Exit 0.
- On Windows the CLI tests fail on main as well because the generator rejects `\` separators, and `format:check` fails because of CRLF checkouts. Neither is caused by this change.

- After that run the logo `url` pattern was widened (absolute API-origin URLs). On Windows the SDK typecheck, lint and the 17 tenant-provisioning tests pass; the Linux `pnpm quality` was not repeated because Linux verification was skipped at the user's request.

Independent review (2026-10-25) and fixes:

- High: an own `__proto__` key in JSON input changed the validated copy's prototype, so a replay could carry a password and a request could carry `admin.password` past validation. Copies now define own properties, so validation rejects the key.
- The fake now records account creation per tenant (as the host does), so reusing an email gives consistent create and replay answers. Malformed cursors and inputs return `invalid_request`.
- Optional fields set to `undefined` are treated as absent. Arrays or objects over 1,000 entries are rejected before being walked.
- `UpdateProvisionedTenantRequestV1` requires at least one field at the type level.
- The logo URL docs now say the SDK checks shape and the host guarantees the origin.
- The reference flags `checkTenantsAndReset` when a create result is malformed.
- The changelog notes the widened `PluginFrontendCapability` union.

Backward compatibility (2026-10-25): 47 existing plugin manifests on this machine give identical runtime and JSON Schema results under SDK 0.34.0 and 0.35.0. The full SDK suite (686 tests) passes. The OpsRabbit plugin suites show the same Windows-only failures as clean `main`, plus the expected host-version assertion while the version is temporarily raised.

Training course review: updated with a "Tenant provisioning (SDK 0.37.0)" section.

Version (2026-10-28): the work was first versioned 0.35.0 (the compatibility check above ran at
that version). `main` meanwhile released 0.36.0 for the chat-turn feedback comment, so this work
moved to 0.37.0 to publish as its own npm release.
