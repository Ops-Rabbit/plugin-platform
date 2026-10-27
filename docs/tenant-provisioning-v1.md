# Tenant provisioning v1

SDK 0.35.0 adds `tenantProvisioning/v1`. With it, a plugin can onboard customers from its own
native workspace while OpsRabbit stays the owner of tenants, users, sign-in, credentials and
branding.

A deployment admin, working in the plugin's workspace, creates a customer in one call. The call
creates:

- a tenant;
- its first admin user and that user's admin access;
- tenant enablement of the calling plugin.

The new tenant opens straight into the plugin, full screen. Customer users see no OpsRabbit UI
except sign-in, including the forced password change at first sign-in.

Runtime availability requires a host that implements this contract. A host without it supplies
no `context.tenantProvisioning`, and the plugin must treat that as "not available", not as an
error.

## Declaration

```json
{
  "minimumOpsRabbitVersion": "0.12.0",
  "navigation": {
    "kind": "plugin_workspace",
    "moduleKey": "customer_app",
    "path": "/apps/customer_app",
    "icon": "alert_triangle",
    "fallbackTitle": "Customers"
  },
  "frontend": {
    "kind": "native_workspace",
    "entry": "./dist/frontend.js",
    "styles": [],
    "assets": [],
    "sdkVersion": "1",
    "mountIsolation": "shadow_dom",
    "capabilities": ["tenant.provisioning.manage"]
  },
  "capabilities": {
    "tenantProvisioning": { "schemaVersion": "1", "logo": true }
  }
}
```

- `tenantProvisioning` and the frontend capability `tenant.provisioning.manage` must be declared
  together.
- `logo` (default `false`) enables `uploadLogo` and `getLogo`.
- The plugin's single workspace becomes the home page of every tenant it provisions, so
  `navigation.kind` must be `plugin_workspace` (not a Forms workspace) and
  `navigation.adminOnly` must not be `true`. Customer users must be able to open it.
- `minimumOpsRabbitVersion` must be `0.12.0` or later, the first host release that implements
  the broker.

Runtime validation and the published manifest JSON Schema both enforce these rules.

## Tenant home

A plugin has exactly one workspace. Deployment admins and customer users load the same bundle:

- The bundle calls `getAuthority()` and shows provisioning screens only when it returns
  `deploymentAdmin: true`.
- Everyone else sees the plugin's normal customer experience.

The host sets each new tenant's home page to `/apps/<navigation.moduleKey>`, opens it full
screen, and does not allow leaving full screen. The request cannot choose another path, so a
plugin can never point a tenant at OpsRabbit pages or another plugin's workspace.

## Runtime

```ts
const broker = context.tenantProvisioning;
if (!broker) return renderUnavailable();
const { deploymentAdmin } = await broker.getAuthority();
```

| Method                                      | Purpose                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `getAuthority()`                            | Live deployment-admin check. A UX hint only.                           |
| `createCustomer(request)`                   | One-transaction customer creation.                                     |
| `resetAdminCredential(request)`             | New temporary password; the old password and its sessions are revoked. |
| `listTenants({ cursor?, limit? }?)`         | Tenants this plugin provisioned, at most 100 per page.                 |
| `getTenant(id)` / `updateTenant(id, patch)` | Read; change `displayName` or `status`.                                |
| `uploadLogo(id, file)` / `getLogo(id)`      | Host branding logo (`logo: true` only).                                |

Every method except `getAuthority` is re-authorized by the host against a live deployment-admin
check. A plugin sees only tenants it provisioned. Other tenant ids behave exactly like unknown
ids (`not_found`).

### createCustomer

```ts
const result = await broker.createCustomer({
  requestId, // 16-128 chars of [A-Za-z0-9_-]; one per submitted form
  tenant: { slug: "acme", displayName: "Acme" },
  admin: { email: "owner@acme.test", displayName: "Owner" },
});
```

`slug` must already be canonical: 2 to 80 lowercase letters, digits or single inner dashes.
Display names are 1 to 160 characters with no leading or trailing whitespace, and must not
contain control characters, invisible formatting characters (such as zero-width spaces) or
bidirectional overrides, so a name cannot hide line breaks or display as a different name. The
host commits all of the following in one transaction, so a failure leaves no partial customer:

- the tenant;
- the first admin, newly created or existing;
- an admin membership;
- tenant enablement of the calling plugin;
- the home page;
- the ownership record;
- audit records.

When `createCustomer` returns, the calling plugin is enabled for that tenant. The plugin cannot
enable itself or any other plugin in any other way. The host requires the plugin to be enabled
deployment-wide first; otherwise the call fails with `not_available`.

`credential` in the result is one of:

| `credential`                                   | When                                                         |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `{ kind: "temporary_password", value }`        | First `created` response for a newly created account.        |
| `{ kind: "none", reason: "existing_account" }` | The email already had an account. Its password is untouched. |
| `{ kind: "none", reason: "already_issued" }`   | A `replayed` response for a newly created account.           |

The rules for retries:

- **Same `requestId`, same payload:** returns `outcome: "replayed"` and never issues a second
  password.
- **Same `requestId`, different payload:** fails with `request_conflict`.
- **First response lost:** the password cannot be recovered by retrying. Use
  `resetAdminCredential`.
- **What to retry:** only `host_error`, with a growing delay. Other codes, and failures without
  a code, will not succeed on retry.

## Credentials

The admin never types a password. The host generates a strong temporary password, stores only
its hash, and returns the value once. The user:

- must change it at first sign-in;
- cannot keep the same password.

The temporary password stays valid until the user changes it or an admin resets it.

A reset:

- applies only to accounts this plugin created as a tenant's first admin, and only while that
  account has no access to tenants this plugin did not provision. Otherwise the call fails with
  `credential_not_resettable`, so a shared account's password is never reset;
- revokes the old password and its sessions;
- is idempotent on its own `requestId`.

An existing account never receives deployment-admin rights through this capability.

`ProvisionedTenantV1.admin.credentialState` takes one of these values:

- `pending_first_sign_in`: the temporary password has not been changed yet;
- `active`: the user has set their own password;
- `not_managed`: the account existed before provisioning.

The UI uses it to decide whether to offer a reset.

The plugin must show the value once and drop it. It must never:

- store it (including browser storage, URLs, plugin settings or plugin tables);
- log it;
- send it to a plugin action or third party;
- put it in analytics or error reports;
- audit it.

The [reference](../packages/plugin-sdk/reference/tenant-provisioning.mjs) holds it in a
show-once container that forgets it on first read.

## Logo

`uploadLogo(tenantId, file)` sends the browser `Blob` straight to the host's per-tenant
branding:

- formats are PNG, JPEG or WebP, at most `TENANT_PROVISIONING_LOGO_MAX_BYTES` (2 MiB);
- the host checks the bytes, not the declared type, so a plugin should not filter on
  `file.type` (a browser may report it empty); checking the size early is fine;
- the plugin keeps no copy and reads the logo back with `getLogo` or the returned `url`, which
  it may use as an `<img>` source. The SDK validates the URL as a path or an absolute http(s) URL;
  the host is responsible for serving it from its own API origin.

Upload is separate from creation. A failed upload leaves the customer in place and can be
retried, and each retry replaces the previous logo.

## Errors

Failures reject with `PluginTenantProvisioningErrorV1`, carrying `status` and an open `code`:

| Code                        | Meaning                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| `not_available`             | Capability, plugin, or deployment-wide enablement is unavailable. |
| `forbidden`                 | The caller is not a live deployment admin.                        |
| `not_found`                 | Unknown tenant, or one this plugin did not provision.             |
| `invalid_request`           | The request fails the published schema.                           |
| `slug_taken`                | Another tenant uses the slug.                                     |
| `request_conflict`          | `requestId` was reused with a different payload.                  |
| `account_unavailable`       | The existing account for the email is banned or locked.           |
| `credential_not_resettable` | The account is not a resettable account of this plugin's tenant.  |
| `license_limit`             | The deployment's tenant licence limit is reached.                 |
| `logo_invalid`              | The file is not a PNG, JPEG or WebP image.                        |
| `logo_too_large`            | The file exceeds the size limit.                                  |
| `host_error`                | Unexpected host failure; retry with the same `requestId`.         |

Treat unknown codes as failures.

## Validation

- Request and result shapes are published as JSON Schemas
  (`@opsrabbit/plugin-sdk/tenant-provisioning-request-schema` and
  `@opsrabbit/plugin-sdk/tenant-provisioning-result-schema`). Select an operation with
  `#/$defs/<name>`.
- The `validate*V1` functions return issues.
- The `parse*V1` functions return frozen copies of own data properties or throw
  `PluginValidationError`.
- No request type has a password field, and every object rejects unknown keys.
- A `replayed` result that carries a temporary password is invalid.

## Host responsibilities

A host:

- MUST supply the broker only to an enabled, managed, not policy-blocked plugin that declares
  the capability, in its native workspace, and MUST re-check live deployment-admin authority
  inside every mutating transaction. Runtime actors, service principals and embedded chat are
  denied.
- MUST derive the calling plugin from the mounted workspace and its active package, never from
  the request. It MUST derive the tenant home from that package's workspace navigation.
- MUST commit the tenant, first admin, membership, plugin enablement, home settings, ownership
  record, retry record and audit records atomically, and MUST fail closed when the plugin is not
  enabled deployment-wide.
- MUST generate the temporary password with a CSPRNG, store only a hash, and return the value
  only in the issuing response with `Cache-Control: no-store`. It MUST never write the value to
  retry records, audit, logs or errors.
- MUST force a password change at first sign-in, reject reuse of the current password, and
  revoke the previous password and sessions on reset.
- MUST never reset or change the credential, role or deployment rights of an existing account.
  It MUST reset only accounts this plugin created that have no access outside its tenants.
- MUST scope every list, read, update, reset and logo operation to tenants this plugin
  provisioned, and MUST answer others exactly like unknown ids. The default tenant is never
  reachable.
- MUST key retry records by plugin, actor and `requestId`, compare a payload fingerprint, and
  bound their retention.
- MUST validate logo bytes, store them only in host branding, and keep logo upload independent
  of customer creation.
- MUST audit that a credential was issued or reset, never its value.

## Testing

- `@opsrabbit/plugin-sdk/testing` exports `createTestTenantProvisioningService`. It is an
  in-memory fake that applies the host's retry, ownership, reset and show-once credential
  rules.
- `snapshot()` serializes the fake host state, so tests can assert that no credential value is
  retained.
- Authorization and atomicity remain host integration concerns.

## Future work

The following are not part of v1:

- a backend broker for plugin actions;
- several admins per call;
- SSO-only first admins;
- tenant deletion;
- tenant-branded sign-in;
- a field naming the customer workspace if plugins ever gain several workspaces.
