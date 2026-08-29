# Building Governed OpsRabbit Plugins

An instructor-ready, source-backed course for `@opsrabbit/plugin-sdk` 0.17.0
and `@opsrabbit/create-plugin` 0.17.0.

## Course promise

By the end of this course, a learner can generate, extend, test, validate, and
package an OpsRabbit plugin without relying on private host code. The learner
will understand the most important design rule in the platform:

> A plugin declares and registers behavior; the OpsRabbit host authorizes,
> isolates, persists, audits, and executes it.

The capstone combines Forms, workflow, analytics, actions, authenticated
ingress, object evidence, plugin-owned storage, and background work while
keeping those responsibilities separate.

## Audience and prerequisites

This course is for TypeScript developers and solution engineers who can read
`async` functions, JSON, and Vitest tests. Learners need:

- Node 24.18.0, selected from the repository `.nvmrc` with `nvm use`;
- npm for generated plugin repositories;
- familiarity with tenant-scoped SaaS concepts;
- an OpsRabbit deployment only for the optional installation lab.

The repository itself uses pnpm 10.12.1. Generated plugins use npm and are
deliberately verified outside the platform workspace.

## Format

Recommended delivery is two days or four half-day sessions.

| Module | Topic                         | Suggested time | Deliverable                              |
| ------ | ----------------------------- | -------------: | ---------------------------------------- |
| 1      | Platform and trust boundary   |         45 min | capability/authority map                 |
| 2      | Generate and inspect a plugin |         60 min | packaged read-only plugin                |
| 3      | Manifest and runtime parity   |         75 min | action with negative parity test         |
| 4      | Bounded host brokers          |         75 min | tenant record or scheduled-job lab       |
| 5      | Forms and workflows           |        120 min | published starter-pack design            |
| 6      | Insights                      |         90 min | validated catalog and dashboard template |
| 7      | Governed service plugins      |        120 min | authenticated ingress and evidence flow  |
| 8      | Packaging and release         |         45 min | deterministic release inventory          |
| 9      | Capstone                      |      4–8 hours | Field Inspection Hub                     |

## Source map and version policy

This material is based on the current public implementation, not the README
alone:

- `packages/plugin-sdk/src/contracts/`: TypeScript authoring contracts;
- `packages/plugin-sdk/src/validation/`: runtime and cross-reference checks;
- `packages/plugin-sdk/schemas/`: published JSON Schemas;
- `packages/plugin-sdk/src/testing/`: test context and parity assertions;
- `packages/create-plugin/assets/starters/`: twelve executable references;
- `packages/create-plugin/src/constants.ts`: authoritative CLI starter list;
- `scripts/verify-generated-starters.mjs`: isolated consumer verification;
- `docs/plugin-contract-v0.2.md` through `v0.15.md`: capability history and host
  compatibility expectations, including the v0.16 generic Connection and
  Knowledge review boundary.

The contract-history documents explain why features exist. Current SDK types,
validators, schemas, generated starters, and tests decide the syntax taught
here. The public SDK and create-plugin CLI are version 0.17.0, and the manifest `apiVersion` is
`1.0`; those are separate version axes.

---

## Module 1: Model the trust boundary

### Learning objectives

Learners can distinguish a declaration from authority and classify state by
its correct owner.

### Core model

`opsrabbit.plugin.json` is the authoritative static declaration. The compiled
ESM entrypoint registers matching runtime behavior. Neither grants access.

| Plugin declares or supplies                         | Host continues to own                                    |
| --------------------------------------------------- | -------------------------------------------------------- |
| identity, version, entrypoint, minimum host version | installation and compatibility decision                  |
| requested tools, actions, routes, jobs, and brokers | tenant enablement, role/grant checks, invocation         |
| required entitlement keys                           | entitlement catalog and active license state             |
| settings metadata                                   | configured values and secret handling                    |
| Forms starter-pack assets                           | validation, publication, persistence, numbering, history |
| workflow placement and executable action metadata   | transition concurrency, authorization, audit             |
| analytics catalog and immutable dashboard templates | caller-scoped queries, saved dashboards, grants          |
| ingress paths, methods, scopes, and request limits  | token hashes, revocation, tenant binding, dispatch       |
| plugin-schema migrations                            | review, schema confinement, database credentials         |
| object-store access request                         | short-lived URLs, namespace checks, object authorization |

The runtime receives opaque `tenantId` and actor identifiers plus bounded
brokers. It does not receive host sessions, internal services, database
credentials, or object-store credentials.

### Exercise: boundary review

For each proposal, mark it **plugin**, **host**, or **reject**:

1. Add a stable Form field key: plugin.
2. Decide whether an operator may read record 123: host.
3. Put a cloud access key in a plugin setting: reject.
4. Declare `configured_forms` as required: plugin.
5. Treat that declaration as a granted license: reject.
6. Return bounded semantic-query metadata: plugin.
7. Return raw SQL to an agent: reject.

Completion criterion: the learner can explain why hiding navigation is not an
authorization control.

---

## Module 2: Generate, run, and package the smallest plugin

### Learning objectives

Learners can choose a starter, locate the manifest/runtime pair, run quality
commands, and produce a reviewable ZIP.

### Discover the executable references

```bash
npx opsrabbit-plugin examples list --verbose
```

The twelve current starter ids are:

- `basic-readonly`
- `operational-action`
- `scheduled-tenant-job`
- `database-tenant-records`
- `forms-workflow`
- `forms-insights`
- `service-ingress`
- `knowledge-publisher`
- `knowledge-email-processor`
- `connection-knowledge-review`
- `native-workspace`
- `interaction-policy`

The `interaction-policy` starter demonstrates a privileged policy boundary.
Admission runs inside a host-owned transaction with a schema-confined database
facade and audit broker; it must not perform network calls or attempt transaction
control. Composer status is advisory, admin routes/actions remain host role-gated,
identity-directory values are presentation-only, and subject deletion removes
identity linkage without corrupting retained domain facts.

### Lab: read-only tenant status

```bash
npm create @opsrabbit/plugin@latest status-lab -- --starter basic-readonly
cd status-lab
npm install
npm run check
npm run test:coverage
npm run build
npm run plugin:check
npm run plugin:pack
```

The generated runtime follows this current SDK shape:

```ts
import { definePlugin, toolResult } from "@opsrabbit/plugin-sdk";

export default definePlugin({
  tools: [
    {
      id: "status-summary",
      description: "Returns a tenant-scoped status summary.",
      risk: "read",
      audience: "all",
      requiredPermission: "read",
      async run(input: { service?: string }, context) {
        const service = input.service ?? "all";
        context.logger.info("status summary requested", {
          tenantId: context.tenantId,
          service,
        });
        return toolResult("Status summary is ready.", {
          tenantId: context.tenantId,
          service,
          status: "unknown",
        });
      },
    },
  ],
});
```

The manifest must declare the same id and security metadata:

```json
{
  "id": "status-lab",
  "name": "Status Lab",
  "version": "0.1.0",
  "description": "Tenant status training plugin",
  "apiVersion": "1.0",
  "main": "./dist/index.js",
  "capabilities": {
    "tools": [
      {
        "id": "status-summary",
        "risk": "read",
        "audience": "all",
        "requiredPermission": "read"
      }
    ]
  }
}
```

`toolResult(text, value)` provides concise agent-visible text and a structured
JSON value. An ordinary JSON return is also valid.

### Checkpoint

Open the generated ZIP and identify its manifest, compiled entrypoint, package
metadata, inventory, and starter assets. Explain why packaging runs the compiled
entrypoint only for trusted source.

---

## Module 3: Manifest schema, runtime registration, and fail-closed parity

### Learning objectives

Learners can add a capability without creating a declaration/registration gap
and can interpret validation failures.

### Three validation layers

1. Published JSON Schema validates the portable wire shape.
2. Runtime validators add duplicate, cross-field, and referenced-asset checks.
3. Registration validation compares compiled behavior to the authoritative
   manifest.

Useful public APIs include:

```ts
import {
  checkApiCompatibility,
  validateDataInsightDashboardTemplateCatalog,
  validateFormStarterPack,
  validateFormsAnalyticsCatalog,
  validateManifest,
  validateRegistration,
} from "@opsrabbit/plugin-sdk";
import {
  assertValidPlugin,
  createTestContext,
} from "@opsrabbit/plugin-sdk/testing";
```

The manifest may declare tools, actions, scheduled jobs, read routes, ingress
routes, widgets, tenant-record collections, a plugin database, an object store,
and Knowledge write access. Registrations exist for the executable sections;
broker declarations request bounded context services and remain optional at
invocation time.

### Lab: controlled action

Generate `operational-action`. Require both `itemId` and `reason`; return the
authorized `context.actor.id`, never an actor id supplied by the request.

Then perform these mutations one at a time and run `npm run plugin:check`:

1. Change the runtime id but not the manifest.
2. Change runtime `risk` from `write` to `read`.
3. Register an undeclared action.
4. Declare an action without registering it.

Each case must fail. Restore parity and add a negative unit test for blank
justification.

### Security discussion

Risk, role, and permission metadata are host-enforced policy inputs. Runtime
input validation still matters, but plugin code must not recreate host role or
tenant authorization.

---

## Module 4: Tenant isolation and bounded brokers

### Learning objectives

Learners can use tenant records, cancellation, logging, and settings without
obtaining infrastructure credentials.

### Runtime context

Every invocation exposes:

```ts
interface PluginInvocationContext {
  readonly tenantId: string;
  readonly actor: PluginActor;
  readonly signal: AbortSignal;
  readonly logger: PluginLogger;
  readonly settings: Readonly<Record<string, JsonValue>>;
  readonly conversationBindings?: Readonly<Record<string, JsonValue>>;
  readonly embeddedChat?: Readonly<{
    widgetId: string;
    externalUserId: string;
  }>;
  readonly tenantRecords?: TenantRecordStore;
  readonly database?: PluginDatabase;
  readonly objectStore?: PluginObjectStore;
  readonly knowledge?: PluginKnowledgeService;
  readonly forms?: PluginFormsService;
}
```

Optional brokers must be checked and code must fail closed when one is absent.

For chat tool invocations, `conversationBindings` can carry deterministic values selected when an Embedded Chat conversation starts, such as a workspace id. They bypass model argument copying but remain untrusted browser-supplied data. `embeddedChat` is different: it contains the external user and widget identity verified from the signed token. A plugin must validate each requested binding against that verified identity, `tenantId`, and its own authorization source before using it to select customer data. Bindings are absent on other invocation surfaces and must never contain secrets.

### Lab A: tenant records

Generate `database-tenant-records`. Observe that it declares the `notes`
collection and calls `context.tenantRecords.put(...)`; it does not import a SQL
client or accept credentials. Add tests that:

- assert the declared collection is used;
- assert the current tenant context is preserved;
- reject a missing broker;
- never interpolate an untrusted collection name.

### Lab B: scheduled work

Generate `scheduled-tenant-job`. Ensure `context.signal.aborted` is checked
before work and during long loops. The host owns tenant scheduling, timeouts,
retry limits, overlap prevention, cancellation, and the system actor.

---

## Module 5: Forms assets and workflows

### Learning objectives

Learners can model versioned product configuration, preserve stable keys, and
keep persistence, transitions, and plugin actions distinct.

### Forms starter-pack shape

A manifest points at a strict asset:

```json
"formStarterPack": {
  "moduleKey": "inspection_operations",
  "path": "./forms/inspection-operations.json"
}
```

The asset has `formatVersion: 1`, a matching `moduleKey`, and one or more
starters. Each starter defines identity, fields, sections, ordinary persistence
actions, and a list configuration.

Field types are `text`, `textarea`, `number`, `date`, `boolean`, `select`, and
`attachment`. Keys use stable lowercase snake case. Sections, list columns,
search/filter fields, option dependencies, and analytics references must name
declared fields.

### Keep three action concepts separate

| Concept                   | Examples                                   | Owner                                           |
| ------------------------- | ------------------------------------------ | ----------------------------------------------- |
| ordinary form persistence | `save_draft`, `submit`                     | Forms host                                      |
| workflow operations       | root creation, follow-up, stage transition | Forms host                                      |
| executable plugin action  | request review, retry upload               | plugin registration invoked through host policy |

An executable Form-placed action receives the wire field `submission_id`. Its
`formPlacement` must match the plugin's module and record type. Availability is
advisory UI metadata backed by the same authoritative host invocation checks.

### Lab: workflow request

Generate `forms-workflow` and identify:

- navigation kind `forms_workspace`;
- matching navigation and starter-pack module keys;
- `rootStarterKey` and JSON `stageModelSetting`;
- optional prefix/digit settings for host-owned numbering;
- a placed executable action using `context.forms`;
- a separate analytics-catalog read route.

Add a required `site_code` field and include it in the list. Keep all existing
keys stable. Validate the asset, then document: **tenant administrators must
republish the starter pack after upgrading**.

Republishing refreshes starter-backed definitions while preserving definition
ids, form keys, title/description customizations, submissions, and historical
schema snapshots. Plugin code must not issue SQL updates against ordinary Forms
definitions.

### Native Forms workspace boundary

Use the `native-workspace` starter when a Forms-backed module needs a dense,
specialist browser interface that the declarative renderer cannot express. The
plugin ships precompiled JavaScript and CSS; it never ships source for the host
to compile and never imports host-private Svelte modules.

The browser entry exports the public `mount(target, context)` ABI. Bundle Svelte
and every grid, chart, icon, or animation dependency into the plugin output.
Declare every entry, stylesheet, asset glob, SDK version, isolation mode, and
host capability. A native Forms workspace must also declare a starter pack
whose module key matches its navigation; validation fails closed when any of
those three declarations disagree. The host must still check tenant enablement, package
generation, module ownership, role, grants, validation, persistence, audit, and
retention for each request.

When the workspace needs to invoke one of its own declared actions, add
`plugin.actions.invoke` to `frontend.capabilities` and call
`context.pluginActions.invoke(actionId, input?)`. The closed broker has no plugin
or tenant selector: the host binds it to the mounted plugin and current tenant,
then revalidates session role, action declaration, package generation, runtime
lifecycle, and audit before dispatch. Test an undeclared action id and expect a
fail-closed rejection.

Shadow DOM prevents ordinary plugin CSS from leaking into the OpsRabbit shell,
but same-origin JavaScript remains full-trust browser code. Deployment approval
must communicate that risk. A native workspace must clean up subscriptions and
pending work when destroyed and must not durably cache customer data.

### Dynamic values

`optionSource` populates selectable options from a declared plugin read route.
`valueSource` is allowed only for a read-only, non-attachment derived field.
Dependencies are explicit. The host still authorizes the route and validates
submitted or persisted values.

---

## Module 6: Forms analytics and editable Insights

### Learning objectives

Learners can publish discoverable dataset metadata and immutable dashboard
templates without exposing raw SQL or dashboard persistence.

### Manifest wiring

```json
"dataInsight": {
  "catalogRoute": "/analytics-catalog",
  "templatesRoute": "/analytics-templates",
  "workspace": {
    "enabledSetting": "insights_enabled",
    "placement": "tab",
    "defaultTemplateId": "inspection-overview",
    "defaultTab": "records",
    "allowUserDefault": true
  }
}
```

Both paths must be declared read routes. A workspace requires Forms navigation;
`enabledSetting` must reference a declared boolean setting; and the default
template id must exist in the returned catalog.

The analytics catalog declares `schema_version: 1`, datasets, dimensions,
measures, and a default time field. Dashboard queries refer to dataset ids and
contain bounded `semantic_query` JSON. Widgets may be `metric`, `table`, `text`,
`bar`, `line`, `area`, `pie`, `donut`, or `scatter`.

Use `presentation.show_date_range: true` when the dashboard needs From and To
controls. Every referenced dataset must declare a timestamp
`default_time_field`, and every template query must use at most 10 saved filters
so Core can add the two range bounds without exceeding the Forms limit.

### Lab: records overview

Generate `forms-insights` and add:

1. a numeric `duration_minutes` Form field;
2. a corresponding numeric analytics dimension;
3. an average-duration measure;
4. a saved-query template referencing the dataset;
5. a metric widget referencing that query;
6. positive validator tests;
7. negative tests for an unknown dataset and dangling widget query key.

The host validates published Forms references, applies caller grants, executes
queries, and materializes templates into normal saved queries and editable
dashboards. “View records” is a caller-scoped deep link, not a grant. Agents use
the host's generic Data Insight tools; plugins must not add raw-SQL tools.

---

## Module 7: Authenticated ingress, database state, and evidence

### Learning objectives

Learners can implement internal JSON ingress and direct evidence upload without
turning the plugin into an authentication or storage service.

### Ingress contract

```json
{
  "path": "/events",
  "methods": ["POST"],
  "auth": "api_token",
  "requiredScopes": ["events.write"],
  "maxRequestBytes": 65536
}
```

The host exposes it below
`/api/plugins/{pluginId}/ingress/{declaredPath}`. Only `POST`, `PUT`, `PATCH`,
and `DELETE` are supported. Runtime path, methods, auth, and scopes must match
the manifest. The host verifies token hash, tenant, plugin, subject, scopes,
method, size, enablement, entitlements, and revocation before dispatch.

Ingress is for bounded JSON events, not video or image proxying.

### Plugin-owned relational state

`capabilities.database.mode` may request `plugin_schema`; the top-level
`database.migrationsPath` points to ordered reviewed SQL migrations. Migration
metadata and journal entries must match the packaged SQL files. Every tenant
business row carries `tenant_id`, and every query filters by the invocation
tenant even though the host also confines the schema.

### Evidence flow

1. Ingress handler asks `context.objectStore.createUpload(...)` for a short-lived
   direct-upload instruction.
2. Agent uploads binary data directly to governed object storage.
3. Agent sends the opaque object id and metadata through JSON ingress.
4. Plugin can use `context.forms.attachObject(...)` for a declared attachment
   field.
5. Host checks tenant/plugin namespace, object state, and record access.

### Lab: service ingress

Generate `service-ingress`. Add tests for:

- non-object request rejection;
- missing database and object-store brokers;
- tenant id in every database write;
- idempotent event persistence;
- short-lived upload instructions;
- declared scope and runtime registration parity.

Never pass database or long-lived object-store credentials to an edge agent.

---

## Module 8: Test, package, and release

### Learning objectives

Learners can distinguish unit, contract, packaging, and clean-consumer gates.

### Required local sequence

```bash
npm run check
npm run test:coverage
npm run build
npm run plugin:check
npm run plugin:pack
```

`plugin:check` loads trusted compiled code and compares it with the manifest.
`plugin:pack` creates a deterministic ZIP for quarantine and administrator
review. Upload does not activate the plugin.

For an immutable release:

```bash
npm run plugin:release -- --tag v1.2.3
```

The package and manifest versions must match the exact tag. Release output
includes ZIP, SHA-256 checksum, SPDX 2.3 SBOM, and release metadata.

### Platform-maintainer gate

When changing this repository, use the pinned Node version, run suites
sequentially, execute `pnpm quality`, and verify every generated starter as an
outside-workspace consumer. If adding a starter, update both
`packages/create-plugin/src/constants.ts` and
`scripts/verify-generated-starters.mjs`; their parity test must continue to
fail on divergence.

---

# Capstone: Field Inspection Hub

## Scenario

A manufacturer needs tenant-scoped inspection records. Operators start and
review inspections in a Forms workspace. A device sends measurement events,
uploads evidence directly, and associates evidence with the correct inspection.
Reviewers request external review through a governed action. Managers use an
editable Insights dashboard. A scheduled job cleans expired technical journal
entries. No plugin or device receives host database, authentication, or cloud
storage credentials.

## Starting point

```bash
npm create @opsrabbit/plugin@latest field-inspection-hub -- --starter forms-insights
cd field-inspection-hub
npm install
```

Use the generated `forms-insights` implementation as the executable baseline.
Consult `forms-workflow` for workflow/action patterns and `service-ingress` for
ingress, migration, and object-store patterns. Copy concepts deliberately;
preserve the generated build, test, CI, and release machinery.

## Required public contract

### Identity and compatibility

- plugin id: `field-inspection-hub`;
- manifest API: `1.0`;
- minimum OpsRabbit version: at least `0.3.0`;
- entitlements: `configured_forms` and `data_insight`;
- module key: `field_inspections`;
- Forms navigation path: `/apps/field-inspections`.

### Settings

Declare:

- `menu_title`: string;
- `insights_enabled`: boolean;
- `workflow_stages`: JSON stage model;
- `record_prefix`: string;
- `record_digits`: number bounded from 6 through 12;
- `journal_retention_days`: number bounded from 1 through 365.

### Forms starter pack

Create root starter `inspection` and follow-up starter `inspection_review`.
The root includes stable fields:

- `site_code`: required text, list/search field;
- `device_id`: required select using an authorized option source;
- `inspection_type`: required static select;
- `started_at`: required date/timestamp-compatible analytics field;
- `measurement`: number;
- `result`: select with `pending`, `pass`, and `fail`;
- `external_review_requested`: read-only boolean;
- `evidence`: multiple attachment field.

Ordinary actions remain `save_draft` and `submit`. Workflow stages are `new`,
`review`, and `complete`. The host owns root creation, follow-ups, transitions,
numbering, persistence, concurrency, and audit.

### Runtime behavior

Register:

1. Read route `/device-options` returning bounded `{ value, label }` options.
2. Read route `/analytics-catalog` returning the Forms analytics catalog.
3. Read route `/analytics-templates` returning the dashboard templates.
4. Action `request-external-review`, placed on the `inspection` record for an
   operator, using input `submission_id` and `context.forms.updateSubmission`.
5. `POST /events` ingress requiring `events.write`, limited to 64 KiB.
6. `POST /evidence/uploads` ingress requiring `evidence.write`, limited to 8 KiB.
7. `POST /evidence/attach` ingress requiring `evidence.write`, limited to 16 KiB.
8. Scheduled job `purge-expired-journal` that honors cancellation and uses the
   invocation tenant plus the configured retention period.

Declare plugin-schema database migrations and read/write object-store access.
Runtime registrations must exactly match paths and security metadata.

### Persistence behavior

The event handler must:

- reject non-object input and require `event_id` plus `submission_id`;
- require the database broker;
- write `tenant_id`, opaque token subject, event id, submission id, and bounded
  event JSON;
- be idempotent on tenant plus event id;
- optionally use the Forms broker to update safe inspection values;
- never trust a request tenant id.

The upload handler returns a short-lived direct-upload instruction. The attach
handler accepts only an opaque object id, verifies it with `objectStore.stat`,
and attaches it through `forms.attachObject` to the `evidence` field. It does
not accept binary content.

### Insights behavior

Publish dataset `inspections.records` with dimensions for site, device, type,
result, and started time, plus measures for count and average measurement.
Publish template `inspection-overview` with:

- total-inspections metric;
- results-by-status bar or donut chart;
- inspections-by-site table;
- stable query/widget keys;
- suggested operator questions.

All queries are bounded semantic JSON. No SQL appears in a tool, catalog, or
template.

## Publishing plugin-owned Knowledge

Use the `knowledge-publisher` starter when a trusted plugin needs to contribute
reference content to native OpsRabbit Knowledge. The manifest must declare
`capabilities.knowledge.write: true`, and runtime code must still treat

Use `knowledge-email-processor` when a tenant needs customer-specific semantics for
host-owned IMAP Knowledge. It declares
`capabilities.knowledgeEmailProcessor.schemaVersion: "1"` and registers a pure
processor. It does not directly read or write Knowledge storage. The host supplies
already-authorized bounded evidence, validates that returned source text matches
source offsets, owns embeddings and lifecycle, and may fall back to generic chunks.

Retrieval post-processing receives only the processor's email candidates and may
return an ordering or suppress redundant supplied IDs. It cannot introduce results,
replace evidence, or alter non-email scores. Recommendations and hypotheses must
remain uncertain unless the source explicitly confirms a cause or resolution.
`context.knowledge` as optional because the host may withhold it when the actor,
tenant, plugin state, or invocation surface is not authorized.

The safe batch is explicit: create or reuse one plugin-owned source by stable
key, upsert bounded text documents by stable document keys, and call `publish`
once after the batch. Never accept a tenant id, host source id, database key, or
storage path from request input. The host owns source isolation, extraction,
indexing, audit, retention, and agent assignment; declaring the broker does not
grant search access to any user or agent.

Tests should prove the complete broker call order and fail closed when the
broker is absent. Production actions that publish Knowledge should require an
administrator because Knowledge remains a tenant control-plane resource.

### Governed Connection-to-Knowledge review

Generate `connection-knowledge-review` when a plugin must select an existing
IMAP Connection, invoke a bounded protocol-adapter seam, stage a human review,
and publish a linked Knowledge family. The executable adapter demonstrates the
boundary and normalized page limits; it is not a complete IMAP ingestion
library. `connections.materialize` returns
invocation-scoped values; never persist or log them. Publication remains a
separate administrator action and requires immutable approval provenance and
matching hashes. Revision manifests and delete permission remove obsolete
semantic siblings. Search reranks bounded competing candidates, then
`fetchByMetadata` expands the exact source, `case_id`, and revision family. The
manifest declares Knowledge read, write, and delete separately. The host authorizes Connection use,
Forms transitions, Knowledge access, retention, indexing, and audit.

## Required tests

### Positive tests

- each route returns its documented wire shape;
- analytics and template validators return `{ ok: true, issues: [] }`;
- external review updates the correct submission;
- repeated event ids use idempotent persistence;
- upload preparation returns an opaque object id and `PUT` instruction;
- evidence attachment targets the declared field;
- scheduled cleanup uses the current tenant and setting.

### Negative and fail-closed tests

- missing optional broker produces a clear error;
- missing Knowledge broker prevents source or document publication;
- blank ids and non-object ingress input are rejected;
- aborted scheduled invocation does no work;
- runtime/manifest method, scope, risk, role, and id mismatches fail parity;
- analytics query with an unknown dataset fails;
- widget with an unknown query key fails;
- Form option/value source with an undeclared route fails;
- analytics reference to an undeclared Form field fails;
- migration journal/SQL mismatch fails packaging;
- a request-supplied tenant id is ignored or rejected.

### Packaging and clean-consumer checks

The final submission must pass, sequentially:

```bash
npm run check
npm run test:coverage
npm run build
npm run plugin:check
npm run plugin:pack
```

Extract the ZIP to a fresh temporary directory and verify that all required
runtime files, manifest, migration journal/SQL, and Forms assets are present.
No workspace-only imports or symlinks are allowed.

## Review rubric (100 points)

| Area                       | Points | Full-credit evidence                                             |
| -------------------------- | -----: | ---------------------------------------------------------------- |
| Contract parity            |     20 | schema, manifest, runtime, and references agree                  |
| Trust boundary             |     20 | no credentials/private APIs; host responsibilities preserved     |
| Tenant and input safety    |     15 | tenant from context, bounded validation, broker checks           |
| Forms/workflow correctness |     15 | stable keys and three action concepts remain separate            |
| Insights correctness       |     10 | valid catalogs, stable references, semantic queries only         |
| Evidence/service design    |     10 | scoped ingress and direct governed upload flow                   |
| Tests and packaging        |     10 | positive, negative, parity, asset, and clean-consumer gates pass |

Automatic failure conditions: embedded credentials; raw SQL exposed to agents;
ordinary Forms definitions written directly; trusting a request tenant id;
binary evidence proxied through ingress; or a manifest/runtime security mismatch.

## Instructor acceptance walkthrough

Ask the learner to demonstrate this sequence:

1. Explain the manifest/runtime pair and identify every requested capability.
2. Run all quality and packaging commands.
3. Show a deliberate parity failure, then restore it.
4. Validate the Forms, analytics, and template assets.
5. Invoke action, event, upload, attach, and cancellation tests.
6. Trace tenant identity from context through persistence.
7. Trace evidence without revealing credentials or proxying bytes.
8. Explain what happens when an entitlement is missing.
9. Explain why an admin must republish the starter pack after an upgrade.
10. Inspect the clean ZIP inventory.
11. Explain why Knowledge publication is plugin-owned and does not assign the source to an agent.

## Expected architecture explanation

A successful learner should be able to say:

> The plugin package contributes versioned declarations, Forms configuration,
> catalog metadata, migrations, and matching runtime handlers. The host validates
> and reviews the package, binds every invocation to a tenant and actor, checks
> entitlements and grants, confines database and object access, persists Forms
> and dashboards, and audits execution. Devices receive scoped API tokens and
> short-lived upload instructions—not database or storage credentials.

---

## Further study

- `docs/user-guide.md`: operator and tenant-admin lifecycle;
- `docs/starter-reference.md`: starter selection matrix;
- `docs/plugin-contract-v0.2.md`: authoritative manifest and compatibility;
- `docs/plugin-contract-v0.3.md`: Forms workspace navigation;
- `docs/plugin-contract-v0.4.md`: Forms starter packs;
- `docs/plugin-contract-v0.11.md`: native Forms workspace ABI and trust model;
- `docs/plugin-contract-v0.5.md`: Forms workflows;
- `docs/plugin-contract-v0.6.md`: entitlements and governed services;
- `docs/plugin-contract-v0.7.md`: Forms Insights workspace;
- `docs/plugin-contract-v0.9.md`: plugin-owned Knowledge publication;
- generated starter source and tests: executable source of truth.
