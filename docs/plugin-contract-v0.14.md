# Plugin contract 0.14: deployment interaction policies

Version 0.14 adds generic, host-governed extension points for policies that must
participate in web-chat admission and present deployment-level administration.

`chatTurnAdmission/v1` executes inside the host's authoritative transaction. The
host authenticates and authorizes the user, reserves queue capacity, creates the
request idempotency claim, and supplies a database facade confined to the
plugin's schema. The plugin returns an approval or a stable localized rejection;
it does not create the host turn or control transaction boundaries. Replays are
resolved by the host before the plugin is invoked.

`chatComposerStatus/v1` supplies advisory, localized status for the signed-in
composer. Admission remains authoritative because state may change concurrently.

`deploymentAdminWorkspace/v1` is declarative and admin-only. Tables reference
declared admin read routes and row mutations reference declared
`deploymentAdminOnly` admin actions. The host renders navigation, tables,
dialogs, pagination, errors, and localized chrome.

Table routes receive `query`, `cursor`, and `limit` query parameters and return
`DeploymentAdminTableResultV1`: schema version `1`, rows with stable `id` plus a
`values` object, and an optional `nextCursor`. `rowIdKey` identifies the value
corresponding to the stable row id. Row actions receive
`DeploymentAdminRowActionInputV1`, containing a host-generated idempotency key and a
host-authenticated request fingerprint (an HMAC over the actor, plugin, action, and
canonical payload),
the row id, displayed row values, and validated dialog fields. Option values are
strings; plugins parse them explicitly rather than relying on UI coercion. Hosts
bound limits, reject malformed envelopes, and never treat row values as
authorization facts.

The identity-directory broker exposes bounded presentation facts only and is
never an authorization source. The audit broker joins the surrounding host
transaction where one exists. `subjectLifecycle/v1` lets a data-owning plugin
erase or detach identity linkage during host-controlled deletion.

Localization is packaged under the declared directory as one `<locale>.json`
object per supported locale. Every declared UI key must exist in every bundle;
undeclared files and symlinks are rejected, and per-file plus aggregate sizes are
bounded. Runtime-returned keys use the default locale when the requested locale
is unavailable; an unknown key produces host-owned generic copy. Hosts
reject unsupported schema versions and activation fails closed when a required
capability is unavailable.

Generate the executable reference with:

```bash
npm create @opsrabbit/plugin@latest my-policy -- --starter interaction-policy
```

The starter is deliberately small. Production accounting policies must add
domain-specific concurrency, idempotency, retention, legal-hold, reconciliation,
and restore behavior rather than treating the example table as a financial
ledger.

Subject deletion is host-controlled and fail-closed. The host invokes
`beforeUserDelete` inside the same database transaction after legal-hold and
authorization checks but before deleting the host principal. The callback gets
a transaction-bound schema-confined database facade and audit broker. A timeout,
throw, or audit failure rolls back and blocks deletion. Hosts may retry the whole
transaction, so handlers must be idempotent. User deactivation does not invoke
the hook. Tenant attribution removal follows the same ordering when explicitly
declared. Backup restore runs host lifecycle reconciliation before restored
identity links become visible.
