# Persona host contract (2026-10-12)

## Scope and finishing criteria

Publish a versioned, optional SDK contract for the reviewed Data Insight SQL persona helpers already implemented by the host: active tenant group listing, canonical tenant user listing, and idempotent persona dashboard materialization with group policy mappings. Declare the capability in the manifest, validate it in both runtime and JSON Schema, provide an executable reference, update public docs and aligned SDK/CLI release inventory, and verify a packed outside-workspace consumer. The host PR must consume the published package and remove its local invocation-context extension before the review thread is resolved.

## Contract and authority

`capabilities.personaHost: { schemaVersion: "1" }` declares that the plugin may use the optional `context.host` persona helpers. The host exposes these only to the reviewed `data_insight_sql` plugin and rechecks the signed-in tenant and role on every call. Group listing filters inactive SCIM groups and disabled identity providers; user listing is admin-only; dashboard materialization and policy mutations are admin-only and use host authorization and audit services. SDK declaration or a group id alone never grants access. Host data, dashboard, policy, grant, and audit lifecycle remains with the host. The contract adds no plugin-owned store, data copy, or retention path.

## Verification and release

Test positive and malformed capability declarations through both validators, test the typed helper reference with allowed and missing host service, and run the repository's sequential quality and outside-workspace starter checks. Review the training course, starter reference, README, changelog, and compatibility note. Merge only after required code-owner review and checks. The `main` publish workflow must succeed and npm must show the new immutable version before the host updates its dependency.
