# `@opsrabbit/plugin-sdk`

The SDK includes the `frontend.native_workspace` manifest contract and the
framework-neutral `OpsRabbitWorkspaceModule` browser ABI. See
[`plugin-contract-v0.11.md`](../../docs/plugin-contract-v0.11.md) and the
generated `native-workspace` starter for build and trust-boundary guidance.
Native workspaces may declare `plugin.actions.invoke` and call
`context.pluginActions.invoke(actionId, input?)`. This broker can invoke only an
action declared by the currently mounted plugin; it accepts no plugin or tenant
override. The host retains live authorization, tenant binding, package-generation
checks, action validation, execution, and audit.
See [Plugin Contract 0.17](../../docs/plugin-contract-v0.17.md).

Deployment interaction policies use the versioned `chatTurnAdmission`,
`chatComposerStatus`, `deploymentAdminWorkspace`, `subjectLifecycle`, and
`localization` contracts. The host owns authentication, authorization, queue and
transaction boundaries, schema confinement, and UI rendering. See the generated
`interaction-policy` starter and Plugin Contract 0.14.
Dedicated host-owned menu entries for those workspaces are defined by Plugin Contract 0.15.

The stable public contract for building and testing OpsRabbit plugins without
checking out the OpsRabbit product source.

```ts
import { definePlugin, toolResult } from "@opsrabbit/plugin-sdk";

export default definePlugin({
  tools: [
    {
      id: "hello",
      description: "Returns a greeting.",
      risk: "read",
      audience: "all",
      requiredPermission: "read",
      async run(input: { name: string }) {
        return toolResult(`Hello, ${input.name}`, { name: input.name });
      },
    },
  ],
});
```

`opsrabbit.plugin.json` is the authoritative identity and capability declaration.
The entrypoint registers behavior only; the host compares it with the manifest
before activation. A matching manifest declaration for the tool above is:

```json
{
  "capabilities": {
    "tools": [
      {
        "id": "hello",
        "risk": "read",
        "audience": "all",
        "requiredPermission": "read"
      }
    ]
  }
}
```

Use `@opsrabbit/plugin-sdk/testing` for an in-memory invocation context and
contract assertions. Use `@opsrabbit/plugin-sdk/packaging` for deterministic
package inventories and digests.

`toolResult(text, value)` preserves a concise agent-visible message alongside a
structured JSON value. Its tagged shape is recognized by the host without
guessing based on ordinary business fields. Returning an ordinary JSON value
remains supported and the host serializes it as the tool message.

The SDK intentionally contains no OpsRabbit backend, authentication, database,
runner, licensing, or deployment implementation. Capability declarations are
requests reviewed and enforced by the host; they never grant access by themselves.

Chat tool invocations may include `context.conversationBindings`, an immutable
JSON object selected when an Embedded Chat conversation starts. Use it for
deterministic routing hints such as `workspaceId` without relying on the model to
copy a prompt value into tool arguments. Bindings are untrusted browser input,
may be absent, and never grant access. For Embedded Chat, the separately verified
`context.embeddedChat.externalUserId` and `widgetId` identify the token subject;
validate the requested binding against that identity, `context.tenantId`, and the
plugin's authorization source before selecting data.
Never place credentials or secrets in bindings.

Forms-backed plugins may declare a host-rendered workspace through the optional
`navigation` manifest field. The host validates the `/apps/<module>` path,
supported icon, module key, and referenced title/icon settings. Navigation is
discoverability metadata only and never grants Forms-record or host-service access.

Forms-backed plugins may also declare a `formStarterPack` pointing to a strict
JSON asset under `./forms/`. Use `validateFormStarterPack` in unit tests and the
published `@opsrabbit/plugin-sdk/form-starter-pack-schema` in editors or other
tooling. Starter assets contain host-rendered form and list definitions only;
they cannot contain executable code, SQL, migrations, tenant data, or access
policy. See the repository's Plugin Contract 0.4 guide for the complete shape.
Fields may declare `readOnly: true`; a read-only non-attachment field may also
declare a bounded plugin-route `valueSource` with explicit dependencies so the
host can refresh a derived display value without allowing user edits. The host
continues to authorize the route and validate persisted values.

A Forms workspace may declare `navigation.workflow` to identify its root starter,
JSON stage-model setting, and optional string/number record-number settings. The
host, not plugin code, owns root and follow-up persistence, transitions,
authorization, concurrency, numbering, and audit. See Plugin Contract 0.5 and
the generated `forms-workflow` starter.

A Forms-backed plugin may declare `dataInsight.templatesRoute` and a tab- or
menu-based `dataInsight.workspace`. Menu placement gives Insights a separate
navigation entry immediately before the plugin workspace. The templates route returns the exported
`DataInsightDashboardTemplateCatalog` wire shape: bounded semantic query JSON,
widget references, layout hints, and suggested questions, never SQL. The host
validates the route and configured default template, executes queries through
the caller-scoped Forms analytics boundary, and owns any per-user default-tab
preference. On first authorized use, the host materializes the template as
normal saved queries and an editable Data Insight dashboard. Dashboard grants
control rendering and layout writes; query-backed widgets may drill into the
matching caller-visible list in the plugin's Records tab. Agents use the host's
generic Data Insight catalog and bounded query tools rather than plugin-specific
SQL or query tools. A referenced `enabledSetting` must be a declared boolean
setting. See Plugin Contract 0.7 and the generated `forms-insights` starter.
Validate analytics output with `validateFormsAnalyticsCatalog` and
`validateDataInsightDashboardTemplateCatalog`. The matching published JSON
Schemas are available from
`@opsrabbit/plugin-sdk/forms-analytics-catalog-schema` and
`@opsrabbit/plugin-sdk/data-insight-template-catalog-schema` for editor and CI
validation; runtime validation additionally checks duplicate identifiers and
query/widget references that JSON Schema cannot express.

Plugins may declare `requiredEntitlements` as a bounded list of host-defined
license keys. The host requires every key before exposing or activating the
plugin and continues to enforce entitlement state on backend invocation paths;
the manifest declaration never grants a license. See Plugin Contract 0.6.

Service plugins may additionally declare authenticated `ingressRoutes`, a
schema-confined `database`, and a tenant-scoped `objectStore`. The host supplies
opaque token principals, broker objects, and short-lived direct-upload URLs; it
does not expose database or object-store credentials. See Plugin Contract 0.6
for the mandatory authorization and confinement boundary.

Trusted plugins may declare `capabilities.knowledge.write: true` to request the
optional `context.knowledge` broker for plugin-owned source and document
publication. The host retains tenant and source isolation, administrator
authorization, indexing, retention, and audit; search access and agent-source
assignment are separate grants. See Plugin Contract 0.9 and the generated
`knowledge-publisher` starter.

Version 0.16 also supports typed, read-only IMAP Connection selectors through
`capabilities.connections.selectors`. The host resolves the selected Connection
only for an authorized invocation and exposes it through
`context.connections.materialize({ selector })`; plugins must never persist or
log the returned values. The Knowledge broker adds bounded `search` and
`fetchByMetadata` reads so a matching semantic section can be expanded to its
exact approved family. Forms submissions expose immutable approval transition,
reviewer, revision, and content hashes for publication gates. See Plugin
Contract 0.16 and the generated `connection-knowledge-review` starter.

### Knowledge email processors

Plugins that deterministically classify and enrich host-owned IMAP evidence declare
`capabilities.knowledgeEmailProcessor.schemaVersion: "1"` and register one
`knowledgeEmailProcessor`. This capability does not grant Knowledge write, database,
object-store, network, or attachment access. The host authorizes and bounds input,
validates source offsets and candidate IDs, persists evidence and embeddings, and
falls back to generic email processing when the processor is unavailable.

Use the `knowledge-email-processor` starter for a conservative implementation that
preserves evidence and defaults to `general_message` with unknown resolution status.
`context.classifyWithLlm` is optional and host-managed. Use it only as a bounded fallback after deterministic processing; never require provider credentials in plugin settings, and validate the returned class and status against the plugin's configured allowlist.
