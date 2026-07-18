# Plugin Contract 0.6: Governed Service Plugins

`context.forms.createSubmission()` accepts an optional `idempotencyKey`. Hosts
scope the key to the tenant and plugin and return the same compatible Form
record when an ingress event is retried. Reusing a key for another definition
or parent record is rejected.

Version 0.6 lets a plugin declare the product entitlements that must all be
active before the host exposes or activates it:

```json
{
  "requiredEntitlements": ["configured_forms", "vision_agent"]
}
```

Entitlement keys use lowercase letters, numbers, and underscores, start with a
letter, are at most 80 characters, and must be unique. A manifest may declare
between one and 16 keys. The declaration is generic: core host code must not
branch on a plugin id to infer its license requirements.

The host owns the entitlement catalog and license state. It validates every
declared key against that catalog, requires all declared entitlements during
installation and tenant enablement, suppresses navigation and other discovery
when any requirement is unavailable, and enforces the same condition at every
backend activation and invocation boundary. Manifest metadata does not grant an
entitlement, and UI hiding is not authorization.

Generated Forms-workflow plugins demonstrate the contract by requiring
`configured_forms`. Replace or extend that declaration only with keys documented
by the target OpsRabbit host.

## Authenticated internal ingress

Service plugins may declare `capabilities.ingressRoutes`. Each route has an
explicit non-GET method list, `api_token` authentication, required token scopes,
and a request-size ceiling no larger than 1 MiB. Runtime registrations must match
the manifest security metadata exactly.

The host exposes these handlers under
`/api/plugins/{pluginId}/ingress/{declaredPath}`. It stores only token hashes and
binds every token to a tenant, plugin, opaque subject such as a device, and a
bounded scope set. Before dispatch it verifies the token, scope, method, size,
plugin and tenant enablement, required entitlements, and revocation state. It
then supplies an immutable ingress principal and system actor to the plugin.
Reverse-proxy network restrictions on `/api/plugins/` are recommended
defence-in-depth, not a replacement for host authentication.

Ingress is JSON control and event traffic. Plugins must not proxy images or
videos through these handlers.

## Plugin-owned relational storage

A plugin that declares `capabilities.database.mode` as `plugin_schema` may
reference a directory of ordered SQL migrations using `database.migrationsPath`.
Only regular files named like `0001_create_records.sql` are packaged. The host
runs reviewed migrations in a plugin-specific schema and supplies a
schema-confined database broker; it never supplies database credentials.

Every row containing tenant business data must carry `tenant_id`, and every
query must scope by the invocation tenant. The schema boundary supplements but
does not replace tenant predicates. The host rejects unsafe cross-schema,
session, extension, role, and transaction-control statements.

## Governed object storage

`capabilities.objectStore` requests read and/or write access to the plugin's
tenant-scoped object namespace. The broker creates short-lived direct-upload
instructions and returns opaque object ids. Agents upload large evidence
directly to S3-compatible storage, then submit only object ids and metadata to
plugin ingress. The host validates namespace ownership and object metadata on
stat or deletion and never gives plugins or agents long-lived object-store
credentials.

## Background work

Existing `scheduledJobs` run with an explicit tenant and system actor. They may
use the declared database and object-store brokers for retry, projection, and
retention work. The host owns enablement, cancellation, overlap prevention,
timeouts, retry limits, and audit.

## Forms lifecycle actions and evidence

Actions placed on a Forms record receive the host wire field `submission_id`.
Use that value with the bounded Forms broker; there is no camel-case alias.

An executable action may declare `formPlacement` for a record type in the
plugin's own Forms module. The host uses this metadata to render the action on a
matching record, calls the optional runtime availability function, and invokes
the same action through its ordinary role, grant, entitlement, and audit path.
This does not create a fourth action model: it is an executable plugin action
placed on a Form record, distinct from save/submit and workflow transitions.

Plugins with Forms navigation receive a Forms broker scoped to their declared
module. It can read and update authorized submissions and attach an opaque
object-store object to an attachment field. This lets evidence use the standard
Forms attachment UI; the plugin cannot access another module or bypass record
authorization.

## Data Insight discovery

`dataInsight.catalogRoute` explicitly identifies a declared read route returning
the plugin's Forms analytics catalog. The host validates the catalog against
published Forms schemas and applies caller grants to projection and query rows.
Hosts must discover providers from this declaration, not a hard-coded route or
plugin id.
