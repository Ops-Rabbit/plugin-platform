# OpsRabbit Plugin Platform

SDK 0.25.0 adds versioned [persona host helpers](./docs/persona-host-v1.md) for the reviewed Data Insight SQL provider. SDK 0.24.0 added optional [tool execution updates](./docs/plugin-contract-v0.24.md)
through `onUpdate`, reusing the existing tool output contract with unchanged handlers and no
extra model-invoked status tool. The `basic-readonly` starter includes an executable
example. Production host integration requires the published SDK release.

See [navigation sections](docs/plugin-navigation-sections-v1.md) for declarative
Primary, Operations, Control and Platform placement. Placement is not access
control; the host continues to authorize all resources and actions.

The public SDK includes a V1 `knowledgeEmailProcessor` capability for bounded,
host-invoked processing of IMAP-derived Knowledge evidence and email-only candidate
post-processing. It does not grant direct Knowledge storage access.

Public, versioned developer tooling for creating high-quality OpsRabbit plugins
without access to the private OpsRabbit product source.

This repository publishes:

- [`@opsrabbit/plugin-sdk`](./packages/plugin-sdk): contracts, manifest schema,
  validation, compatibility checks, governed service-plugin contracts, package
  inventory, and an isolated test harness.
- [`@opsrabbit/create-plugin`](./packages/create-plugin): CLI, fifteen starters,
  reference implementations, generated tests, CI, README, and `AGENTS.md`.

## Create a plugin

```bash
npm create @opsrabbit/plugin@latest my-plugin -- --starter basic-readonly
cd my-plugin
npm install
npm run check
npm run test:coverage
npm run build
npm run plugin:check
npm run plugin:pack
```

Starters are executable reference plugins covering a read-only tool, controlled
operational action, tenant-scoped scheduled job, host-brokered tenant records,
a host-rendered Forms workflow, a Forms Insights workspace, authenticated
service ingress with plugin-owned storage, Knowledge publication, and a governed
Connection-to-Forms-to-Knowledge adapter workflow. Run `opsrabbit-plugin examples list`
to enumerate them. The generated ZIP is intended
for quarantine and administrator review in the OpsRabbit Plugins UI.

## Trust boundary

This repository intentionally contains no private OpsRabbit backend code,
database schema or credentials, authentication implementation, license internals,
runner broker implementation, deployment topology, or capability-token secrets.

The SDK describes requests and public contracts. It does not grant authority.
The OpsRabbit host remains responsible for role and resource authorization,
tenant isolation, capability enforcement, audit, approval, and isolated execution.
Declared Knowledge access supplies only a tenant-scoped broker for plugin-owned
sources; it does not expose Knowledge tables, storage paths, or credentials.

`opsrabbit.plugin.json` is authoritative. The compiled entry registers behavior
only, and the host rejects identifiers or security metadata that do not exactly
match the manifest.

## Develop the platform

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm quality
```

See the [user guide](./docs/user-guide.md), [contributing](./CONTRIBUTING.md),
[security](./SECURITY.md), and [release operations](./docs/releasing.md).
The [source-backed training course](./docs/training-course.md) provides a
module-by-module curriculum and an integrated Field Inspection Hub capstone.
The [starter reference](./docs/starter-reference.md),
[Forms workspace navigation](./docs/plugin-contract-v0.3.md),
[Forms starter-pack](./docs/plugin-contract-v0.4.md),
[native workspace](./docs/plugin-contract-v0.11.md),
[deployment interaction policies](./docs/plugin-contract-v0.14.md),
[administration navigation](./docs/plugin-contract-v0.15.md),
[Forms workflow](./docs/plugin-contract-v0.5.md),
[plugin Insights workspace](./docs/plugin-contract-v0.7.md), and
[required entitlements](./docs/plugin-contract-v0.6.md) guides explain the contract
and expected tests for each plugin shape.
The [Knowledge broker contract](./docs/plugin-contract-v0.9.md) documents
plugin-owned source publication.
The [generic Connection and Knowledge review contract](./docs/plugin-contract-v0.16.md)
documents typed Connection selection, immutable Forms approval, Knowledge reads,
and exact case-family expansion.
The [native workspace action contract](./docs/plugin-contract-v0.17.md) documents
the generation-fenced, allowlisted current-plugin action broker.
The [structured-classification contract](./docs/plugin-contract-v0.18.md)
documents bounded governed classification for declared actions and scheduled jobs.
The [channel approval contract](./docs/plugin-contract-v0.23.md)
defines instance-scoped delivery, external human attribution and one-time decisions
for supporting hosts in SDK 0.23.0.
The [Data Insight authorization context](./docs/data-insight-authorization-v1.md)
documents plugin-owned policy/reference declarations and host-attested invocation scope.

The [governed skill Connection execution contract](./docs/host-skill-connection-exec-v1.md)
documents how host 0.6.0 executes reviewed helpers packaged in attached skills without exposing raw Connection commands.

## Agent runs v1

SDK 0.31.0 exports `PluginAgentRunsServiceV1`, completion and observation types, and request, output-schema and state validators. See [host responsibilities and reference](docs/plugin-agent-runs-v1.md). Runtime availability requires an implementing host; a binding requests access and grants none, and limits remain host policy.

## Document capture v1

SDK 0.32.0 exports `PluginDocumentCaptureServiceV1`, `PluginCapturedDocumentV1` and request and result validators. See [host responsibilities and reference](docs/plugin-document-capture-v1.md). A binding requests access and grants none; the host fetches under tenant Web Access policy, and plugins never open the connection themselves.

## Tenant provisioning v1

SDK 0.35.0 exports the `tenantProvisioning` browser broker contract, request/result validators and JSON Schemas, a test fake, and an executable [reference](packages/plugin-sdk/reference/tenant-provisioning.mjs). A deployment admin can onboard a customer from the plugin's own workspace in one host transaction: a tenant, its first admin with a host-generated temporary password shown once, admin access, and enablement of the calling plugin, with the tenant opening on that workspace full screen. See [host responsibilities](docs/tenant-provisioning-v1.md). Runtime availability requires host 0.12.0 or later.

## Chat turn records v1

SDK 0.33.0 exports the read-only `chatTurnRecords` broker contract, request/result validators and JSON Schemas, and an executable [reference](packages/plugin-sdk/reference/chat-turn-records.mjs). A deployment interaction policy's admin route can show the question and answer feedback for turns it admitted; the plugin never stores them. See [host responsibilities](docs/chat-turn-records-v1.md). Runtime availability requires an implementing host.

## Channel messaging v1

SDK 0.27.0 exports `ChannelMessagingContextV1`, `ChannelMessagingAdapterV1`, and message input validation/schema. See [host responsibilities and reference](docs/channel-messaging-v1.md). Runtime availability requires an implementing host; a saved connection alone grants no messaging authority.

## Inbound lifecycle subscription (next release)

Plugins can declare a versioned tenant-bound Inbound lifecycle handler. The strict event schema, runtime validator and executable reference are described in [the lifecycle contract](docs/inbound-lifecycle-v1.md). This contract does not itself implement host event delivery or cross-tenant authorization.

## Plugin-owned resource workspaces (next release)

The [resource workspace contract](docs/resource-workspaces-v1.md) covers standalone specialist navigation, core-authorized queries over plugin-owned SQL, shared resource grants/retention and optional tenant-model enrichment. Public types and references do not implement host enforcement. Consume the published coordinated release before deploying a dependent plugin; unsupported hosts fail closed. Ordinary Forms modules continue to use the Forms engine.

SDK/CLI 0.30.0 adds declarative source Inbound business configuration for host-owned registration controls. Core owns the checkbox, grants and delivery; plugins declare bounded localized mapping/enrichment fields and tenant-admin read/write actions. Configuration uses revision/incarnation fences. See [the Inbound registration contract](docs/inbound-registration-v1.md).

SDK 0.31.1 adds the `siren` navigation icon for operational incidents. Hosts must render this icon key before plugins select it; see [navigation compatibility](docs/plugin-navigation-sections-v1.md).

SDK 0.34.0 adds adapter-only channel messaging references for trusted Teams routing and confirmed sent-message quoting. No new send authority, authentication or content store is granted. See [host responsibilities](docs/channel-messaging-v1.md). Runtime use requires coordinated host support.
