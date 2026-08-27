# Interaction policy contracts v1

## Outcome

Add closed, versioned public contracts that let a managed plugin participate in
signed-in web-chat admission, expose a host-rendered composer status, register a
deployment-admin workspace, receive bounded user-directory facts, write through
the host audit broker, and handle subject deletion. The host remains responsible
for authentication, authorization, queue reservation, transaction ownership,
timeouts, schema confinement, localization rendering, and lifecycle fencing.

The first consumer is the interaction-points plugin. The contracts are generic;
the SDK and host must not branch on that plugin id.

## Prior art review

The required `applied-ai-consulting/claude-code` repository was checked on
2026-08-26 and was unavailable (GitHub returned 404). The next-best verified
Applied AI source is OpsRabbit's existing public plugin platform itself,
especially the schema-versioned Knowledge email processor, declared capability
versus runtime-registration parity, host-brokered database/audit boundaries, and
generated starter verification. This design borrows those closed-contract and
fail-closed compatibility patterns. It rejects exposing host internals, a raw
Drizzle transaction, arbitrary plugin UI, or a plugin-specific host branch.

## Contract boundaries

- `chatTurnAdmission/v1` is deployment-scoped and invoked only inside a
  host-owned transaction after authorization and definitive queue reservation.
- Its database facade is already transaction-bound and plugin-schema confined.
  The host supplies stable opaque ids and facts; plugins cannot read host tables.
- Admission replay is owned by the host. A replay never invokes policy code.
- `chatComposerStatus/v1` is read-only and advisory. Admission is authoritative.
- `deploymentAdminWorkspace/v1` is declarative. Tables read through declared
  admin routes; mutations invoke declared deployment-admin-only actions.
- Table routes and row actions use exported V1 query/result/action envelopes.
  Row values are presentation data and action idempotency keys are host-issued.
- Identity-directory access is a deployment-admin-only presentation broker and
  does not authorize plugin operations.
- Audit writes made during admission share the admission transaction. Other
  audit writes follow the host action/lifecycle transaction boundary.
- `subjectLifecycle/v1` lets a data-owning plugin atomically erase identity
  linkage without mutating retained accounting facts.
- Localization bundles are packaged by the plugin and referenced by message key;
  the host owns fallback behavior and generic error chrome.

## Validation and compatibility

- Manifest JSON Schema and runtime validation reject unknown keys, unsupported
  schema versions, unsafe paths, undeclared surfaces, and non-admin workspace
  routes/actions.
- Runtime registration must exactly match every declared executable singleton.
- Hosts that do not recognize a requested capability reject activation.
- The SDK release includes a generated interaction-policy starter and clean
  consumer/package verification.

## Security, authorization, and lifecycle

The admission hook is a privileged policy boundary, not a general runtime tool.
The host derives actor and source, revalidates the authenticated principal in its
transaction, applies PostgreSQL statement/lock timeouts, and waits for rollback
before returning on failure. Admin workspace routes and actions require the
deployment `admin` role; grants cannot widen access. Identity fields are
presentation-only and must not be copied into plugin accounting rows.

Plugin-owned durable data remains subject to the plugin's declared retention,
legal-hold, deletion, and restore-reconciliation behavior. Package removal is a
separate host-fenced lifecycle operation; unregistering runtime contributions
does not silently delete data.

Subject deletion callbacks run inside the host deletion transaction after hold
and authorization checks. Failure or timeout rolls back and blocks deletion;
whole-transaction retries require idempotent handlers. Deactivation preserves
plugin identity linkage and does not invoke deletion lifecycle.

## Verification

- TypeScript contract compilation and export coverage.
- JSON Schema/runtime-validation parity, including negative cases.
- Registration parity for missing, undeclared, mismatched, and invalid handlers.
- Generated starter unit tests, validation, packing, and clean-consumer install.
- Full serial `pnpm quality` before the PR is opened.
