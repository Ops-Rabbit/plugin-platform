# OpsRabbit Plugins: User Guide

OpsRabbit plugins are packaged extensions that add business-specific workspaces,
tools, automations, dashboards, service integrations, and edge-agent ingestion
flows to an OpsRabbit deployment. A plugin is installed by an administrator,
enabled for one or more tenants, and then used by operators, reviewers, agents,
or external services through host-governed UI and APIs.

This guide is for plugin users, tenant administrators, and solution teams. It
explains what plugins can do and how they are normally used. It is not a
low-level SDK contract.

## What a plugin can add

A plugin can provide one or more of these capabilities:

- **Navigation/workspace**: a menu entry or app workspace inside OpsRabbit.
- **Forms-backed records**: configured records such as inspections, tickets,
  quality checks, cases, or service requests.
- **Workflows**: stages, transitions, follow-up forms, and governed operational
  actions on records.
- **Actions**: buttons that run controlled operations with role checks, audit,
  and optional availability rules.
- **Agent tools**: safe tools that OpsRabbit agents can use to answer questions
  or operate on allowed plugin data.
- **Insights**: dashboards and saved queries based on plugin-owned Forms data.
- **Service ingress**: authenticated internal APIs for edge agents or services.
- **Object evidence**: direct upload of images, videos, PDFs, logs, or other
  evidence to S3-compatible storage, with governed references attached to
  records.
- **Plugin database tables**: plugin-owned tenant-scoped tables for specialist
  state that does not belong in ordinary Forms submissions.
- **Scheduled jobs**: background tasks for refresh, retention, sync, or
  projection work.

The OpsRabbit host remains responsible for authentication, tenant enablement,
license checks, authorization, resource grants, audit, Forms persistence, object
access, dashboard storage, and runtime isolation.

## Typical lifecycle

### 1. Install or upload the plugin package

An administrator uploads the plugin ZIP or installs it from an approved release
source. OpsRabbit validates the manifest, package inventory, required host
version, required entitlements, declared capabilities, and packaged assets.

If validation fails, the plugin is not activated. Common causes are:

- the host version is older than the plugin requires;
- a required license entitlement is missing;
- the manifest declares unsupported properties;
- database migration metadata is missing or inconsistent;
- runtime registrations do not match the manifest.

### 2. Deploy or enable the plugin

After installation, the administrator enables the plugin globally or for a
specific tenant, depending on the plugin type. Some plugins are tenant-scoped,
which means the same plugin can be enabled for one tenant and disabled for
another.

If a required entitlement is not active, OpsRabbit hides plugin navigation and
blocks backend activation. Hiding the menu is only the user experience layer;
backend enforcement is still applied.

### 3. Configure plugin settings

Many plugins expose settings in the Plugins page. Settings may include display
labels, feature toggles, object-store configuration, external endpoints, model
selection, default dashboard behavior, or other plugin-specific options.

Secrets should be handled through host-governed secret fields or host connection
facilities where available. Edge agents should not need database credentials or
long-lived object-store credentials.

### 4. Publish or republish Forms starter packs

Forms-backed plugins ship a starter pack: a versioned definition of forms,
fields, lists, actions, workflow placement, and analytics field references.

After installing a new plugin version, admins should republish the starter pack
for tenants that should receive the updated definition. Republish preserves:

- existing definition ids;
- form keys and record numbering;
- local title and description customizations;
- submitted records;
- historical schema snapshots.

If users do not see new fields, dynamic dropdown values, actions, list columns,
workflow placement, or Insights mappings after an upgrade, check whether the
starter pack was republished for that tenant.

### 5. Use the workspace

Operators use the plugin workspace like a normal OpsRabbit app. Depending on the
plugin, they may:

- create records;
- start an operation;
- fill required form fields;
- move a record through workflow stages;
- review evidence;
- trigger available actions;
- open linked records;
- view activity history;
- open the Insights tab.

The plugin should use business vocabulary that fits the workflow. For example,
a quality plugin might show “Review”, “Decision”, and “Closed” rather than
generic technical terms.

## Forms, workflow, and records

Forms are the default way for plugins to model business records. A Forms-backed
plugin can define field groups, required fields, dropdowns, attachments, list
columns, workflow stages, and record actions.

Important behavior:

- records are tenant-scoped;
- users only see records allowed by their role and grants;
- field validation happens on the backend, not only in the browser;
- dynamic dropdown values can come from plugin-provided option sources;
- attachments and governed objects remain controlled by the host;
- workflow transitions and actions are audited.

Plugins should not bypass the Forms engine for ordinary configured records.
Specialist plugin tables are appropriate for device state, ingestion journals,
model metadata, evidence processing state, or other technical state that is not
itself the main user-facing record.

## Dynamic dropdowns

Some fields are populated dynamically. For example, an inspection form may let
an operator choose a registered device, line, belt, model, customer, or order.

The dropdown options are loaded from an authorized source and the backend also
validates submitted values. A user should not be able to submit arbitrary values
that were not offered by the option source.

If a dropdown is empty:

- confirm the plugin is enabled for the tenant;
- confirm prerequisite records or devices exist;
- refresh or republish the starter pack if the field was recently added;
- check whether the current user has permission to access the option source.

## Operational actions

Plugins can place buttons on a record or workspace. Examples:

- Start inspection
- Complete inspection
- Assign device
- Request review
- Move to decision
- Retry upload
- Register device

Action availability is authoritative on the backend. The UI may temporarily
show “accepted” or disable a button while the server updates the record state.
If an action remains unavailable, refresh the record and check whether the
record has moved to the expected stage or whether required fields are missing.

## Insights and dashboards

A plugin can provide an **Insights** tab inside its workspace. The Insights tab
uses OpsRabbit Data Insight dashboards, saved queries, and widgets rather than
a plugin-specific charting system.

Depending on permissions, users can:

- view default plugin dashboards;
- open the Insights tab by default;
- drag and resize widgets;
- add saved queries to the dashboard;
- edit dashboard metadata;
- click **View records** on supported widgets to open the matching Records list.

Agents can use host-provided Data Insight tools to discover plugin datasets and
run bounded semantic queries. Plugins expose catalog metadata; they should not
expose raw SQL tools to ordinary users or agents.

## Service ingress and API tokens

Service plugins can expose internal authenticated endpoints under:

```text
/api/plugins/{pluginId}/ingress/{declaredPath}
```

These endpoints are intended for JSON control events from trusted agents or
internal services. They are not for public unauthenticated traffic and should
not be used to proxy large images or videos.

Admins create, rotate, and revoke tenant-scoped API tokens in the plugin
settings UI. The token panel appears only when:

- the plugin declares ingress scopes;
- the plugin is effectively enabled for the selected tenant;
- the current user has plugin administration access.

An installer or edge agent typically needs:

- OpsRabbit backend URL;
- plugin id or module id;
- tenant or tenant context;
- subject/device id;
- generated API token;
- optional local processing configuration.

The agent should send event metadata through ingress and upload binary evidence
through object-store upload instructions.

## Evidence and object storage

For images, videos, logs, or other large evidence, the preferred pattern is:

1. Plugin or agent asks the host for an upload instruction.
2. Agent uploads directly to S3-compatible object storage.
3. Agent sends the object id and metadata to plugin ingress.
4. Plugin links the governed object to a Forms record.
5. Users view the evidence from OpsRabbit through governed read access.

This avoids pushing large binary payloads through plugin ingress or storing them
inside ordinary Forms JSON. The host can validate object ownership, tenant,
plugin, status, content type, and access.

## Edge agents

Some plugins pair with an edge agent, such as a Raspberry Pi camera agent. The
agent typically runs close to a machine, camera, scanner, or local service.

For a vision-style plugin, the flow may be:

1. Operator creates or starts an inspection in OpsRabbit.
2. OpsRabbit assigns a registered device or agent.
3. The edge agent captures frames or reads a video stream.
4. One or more detection phases run locally.
5. Relevant images or clips are uploaded asynchronously as evidence.
6. The agent reports detections, location data, and evidence references.
7. Reviewers inspect the record, annotated images, video, and workflow history.

The agent should be lightweight, restartable, and configurable. It should not
need OpsRabbit database access or cloud provider secrets when the plugin can
issue short-lived object-store instructions.

## Licensing and visibility

Plugins can require entitlements such as `configured_forms`, `data_insight`, or
a domain-specific entitlement. If required entitlements are missing:

- menu entries are hidden;
- tenant enablement is blocked or ineffective;
- backend invocation is denied;
- service ingress is denied.

This means a user may not see a plugin menu even if the package is installed.
Check plugin enablement, tenant enablement, role, grants, and license
entitlements together.

## Troubleshooting checklist

### Plugin menu is missing

- Is the plugin installed and enabled?
- Is it enabled for the selected tenant?
- Are required entitlements active?
- Does the user have access to the relevant surface?
- Is the plugin in recovery-only or failed-load state?

### New fields/actions are missing

- Was the new plugin package deployed?
- Was the Forms starter pack republished for the tenant?
- Did field/action keys remain stable?
- Is the browser showing a cached old page?

### Dynamic dropdown is empty

- Does the source data exist, such as registered devices?
- Is the plugin effectively enabled?
- Does the current user have permission to read the source?
- Was the starter pack republished after adding `option_source`?

### Agent cannot call ingress

- Is the API token copied correctly?
- Is the token scoped to the same tenant and plugin?
- Is the subject/device id correct?
- Does the route require scopes the token has?
- Is the plugin effectively enabled for the tenant?
- Is the backend URL reachable from the agent network?

### Evidence does not display

- Was the object upload completed?
- Was the object linked to the right submission?
- Does the plugin object-store configuration match where the object was stored?
- Does the current user have read access to the record?

### Insights tab is empty

- Is `data_insight` entitlement active?
- Is the plugin’s Insights setting enabled?
- Was the Forms starter pack published?
- Does the plugin analytics catalog validate against the published fields?
- Does the user have permission to view or materialize the dashboard?

## What plugin authors should keep stable

When upgrading a Forms-backed plugin, keep these keys stable unless you are
intentionally creating a breaking change:

- plugin id;
- module key;
- starter pack key;
- starter keys;
- record types;
- field keys;
- section keys;
- workflow stage keys;
- action ids;
- analytics dataset ids;
- dashboard template ids.

Stable keys let OpsRabbit preserve records, dashboards, workflow state, saved
queries, and drill-through links across plugin upgrades.

## Recommended operating model

For production usage:

- install plugins from reviewed releases;
- test plugin upgrades in a non-production tenant first;
- republish starter packs after reviewing form changes;
- create scoped API tokens per device or service subject;
- rotate tokens when devices are replaced;
- keep large evidence in object storage, not in JSON submissions;
- use Insights dashboards for operational visibility;
- use OpsRabbit agents with bounded Data Insight tools for questions over
  plugin data;
- document plugin-specific operator steps in the customer runbook.
