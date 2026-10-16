# Plugin-owned resource workspaces v1

This contract is unreleased until the coordinated SDK release is published. SDK types do not implement host authorization or delivery.

A specialist module declares `navigation.kind: "plugin_workspace"` and a native shadow-DOM frontend using declared `plugin.actions.invoke` actions. It needs no Forms starter, ordinary Forms persistence or configured-Forms entitlement. Forms workflows/capabilities are rejected. Navigation never grants access. Unsupported hosts reject installation instead of silently mounting a Forms page.

## Resource storage and authority

Declare `capabilities.resourceRecords: { schemaVersion: "1", kinds: { incident: { labelKey, descriptionKey, retention: { defaultMode: "retain_indefinitely", supportedModes: ["do_not_persist", "retain_for_days", "retain_indefinitely"] } } } }`, database migrations and audit. Register matching `resourceLifecycle.deleteRecords` and `cleanupTenant` handlers.

The plugin owns canonical SQL records and business filters. The host owns a content-free resource index: tenant, plugin, kind, stable record ID, authenticated owner, eligibility clock, Inbound output origins, investigation links and lifecycle state. No incident titles, descriptions, evidence or attribute copies belong in this index.

`context.resourceRecords.scope()` returns current accessible/effectively-enabled tenants and their effective roles. Tenant selections are requests, never authority. `sourceInbounds()` is current-tenant-admin-only and returns source identity and this plugin's binding, never settings/credentials or another plugin's configuration.

`transaction({kind,purpose:"records",operation,ids},callback)` fences persistence policy and explicit target/operation authority BEFORE invoking plugin code. Batches contain 1–100 unique IDs. Existing targets require write permission even during create/replay; new targets require create authority. Only host-attested source invocations can obtain the bounded automatic-write authority derived from their current tenant, binding and origin; no caller-supplied system flag exists. Plugin SQL must limit mutations to the admitted target IDs. `do_not_persist` rejects before plugin SQL, outbox or enrichment content writes. Register the record and perform canonical writes in the same transaction. The host stamps owner/output origin from authenticated/attested context; plugins cannot choose owners or supply grants. Repeated registration preserves owner and eligibility clock. Index, grants/origins, audit and plugin SQL commit or roll back together.

Configuration transactions are tenant-admin-only, admit no incident content, and cannot register/link records. `bindSourceInbound({inboundId,kind,enabled})` pins the source incarnation and returns a monotonic revision and enablement timestamp. Save versioned plugin mappings/profiles in the same transaction. Register new events after enablement only; never reinterpret an admitted event with another mapping revision. Disable/delete fences admission and pending mutation. Cached process configuration cannot override live authority.

`linkInvestigation` verifies same-tenant identity and applies only the attested Inbound's output grants with revocation origins. Correlation may reuse a same-tenant investigation despite different sharing, exposing earlier investigation content to incoming recipients as explicitly agreed. Unrelated incidents, credentials and tools remain independently authorized. Output-sharing configuration belongs to the host for every Inbound family, independently of this plugin.

## Authorized query boundary

`PluginResourceQueryV1` carries plugin-authored parameterized read-only candidate SQL producing one row per resource with `tenant_id` and `resource_id`. Bind browser values; never interpolate them. Preserve identity/content pairing, stay inside the plugin schema, and do not pre-aggregate hidden records or add top-level paging. Trusted installed plugin code still owns its joins/projections; this API is not a sandbox for malicious plugin code.

Core validates actor/session, accessible tenants, each role ceiling, effective plugin generation/enablement, ownership and live direct/group/inherited grants. It joins its index and authorization predicate BEFORE sorting, paging, counts or grouping. It never exposes an unrestricted executor to callers. Passing tenant IDs for plugins to filter themselves is insufficient. Every aggregate uses the same authorized relation. Hidden tenant metadata is not disclosed. Statement-level authorization governs revoke/read races; later requests cannot reuse stale scope.

Initial server paging is bounded to 100 rows and 10,000 pages. Deterministic ordering ends in tenant/resource identity tie breakers. These bounds do not make deep paging cheap; verify representative query plans. A tenant-leading index alone does not guarantee efficient global ordering. A later contract can add keyset navigation without changing resource ownership.

## Shared retention and deletion

Each kind registers `plugin:<pluginId>:<kind>` in the shared tenant retention framework, defaulting to indefinite retention. Finite deletion requires explicit activation. Registration enablement neither forces policy selection nor adds a duplicate selector.

Core owns policy revisions, holds, active-work/approval/writeback guards, bounded selection and deletion fencing. It calls `deleteRecords` with at most 100 same-tenant IDs and a transaction-bound database AFTER revalidation. The plugin deletes canonical content, relationships, titles, jobs, derived indexes/caches and owned copies. Core then removes index/grants/origins and pending delivery/enrichment references, with atomic destructive audit. Callback failure rolls everything back. Cleanup handlers remain available while user-facing functionality is disabled; uninstall is blocked until cleanup is safe.

Source-origin deletion/replay uses the full tenant/Inbound/source-event tuple and preserves alternate surviving origins. Receipts/fences need a documented replay TTL and contain no customer text. Tenant deletion includes profile/binding versions and preferences. Restore must reconcile expiry/deletion fences before delivery reactivation. Older backups, exports and external providers require separate operational handling; this contract does not prove those copies deleted.

## Optional enrichment

`structuredEnrichment` binds the broker to declared actions/jobs and requires audit plus declared resource kinds. `enrich` names an existing resource and requests title generation and/or allowed fields using the tenant's approved model. The Inbound opts into each feature independently, disabled by default. Core authorizes the resource/purpose, bounds request/output/deadline, checks persistence/deletion before sending content, treats source text as data, and exposes no tools or durable memory. Audit contains minimized metadata, not prompts/output.

The model cannot change tenant, owner, origin, upstream identity, grants or routing. Validate field types/enums and preserve null versus absent. Reject unrequested output. Timeout/unavailable is explicit; invocation cancellation rejects. Before application, plugins revalidate source/configuration revision, deletion, opt-out and manual-title precedence. Generated text is not a verified investigation conclusion. Accuracy/trust KPIs require independent review data.

`reference/resource-workspace.mjs` demonstrates transaction ordering, validation and unsupported-host failure. Real SQL wrapping, access, persistence and lifecycle fences remain host responsibilities.

After deleting all resource batches, the host calls `cleanupTenant` even for a tenant that never registered a record. Each callback deletes a bounded batch of profiles, bindings, preferences and remaining children and returns `{complete:false}` to resume or `{complete:true}` to finish. The host holds the tenant deletion fence, audits batches atomically, and cannot remove the tenant/uninstall the plugin before finalization completes. This avoids treating an empty resource index as evidence that plugin configuration was cleaned.
