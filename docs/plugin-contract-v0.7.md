# Plugin Contract 0.7: Forms Insights workspaces

Contract 0.7 lets a Forms-backed plugin contribute immutable dashboard templates
to a host-rendered **Insights** tab. It does not give plugin code access to host
dashboard tables or authorization services.

Plugins that declare an Insights workspace should require OpsRabbit host
compatibility `0.3.0` or newer with `minimumOpsRabbitVersion`.

## Manifest

Add `templatesRoute` and `workspace` beside the existing Forms analytics
`catalogRoute`:

```json
{
  "dataInsight": {
    "catalogRoute": "/analytics-catalog",
    "templatesRoute": "/analytics-templates",
    "workspace": {
      "enabledSetting": "insights_enabled",
      "placement": "tab",
      "defaultTemplateId": "quality-overview",
      "defaultTab": "records",
      "allowUserDefault": true
    }
  }
}
```

Both routes must be declared read routes. `workspace` requires a
`forms_workspace` navigation declaration. When supplied, `enabledSetting` must
name a declared boolean setting.

## Templates route

Return a `DataInsightDashboardTemplateCatalog` with `schema_version: 1`.
Queries identify a dataset from the plugin's analytics catalog and contain only
bounded `semantic_query` JSON. Widgets reference query keys or contain static
text. The host materializes the template into normal saved queries and an
editable Data Insight dashboard, so templates may use the same dashboard widget
types as the host renderer: `metric`, `table`, `text`, `bar`, `line`, `area`,
`pie`, `donut`, and `scatter`. IDs and references must be stable within a
release.

The route supplies metadata only. The host validates catalog limits, dataset
references, and widget references, then executes each query as the authenticated
caller. A template cannot contain SQL, grant access, or expose records hidden by
Forms authorization. The host—not plugin code—persists the materialized saved
queries, dashboard, widgets, and layout.

## Preferences and saved dashboards

The host may persist the initial Records/Insights tab for the current tenant,
user, and module when `allowUserDefault` is enabled. Enabling a plugin alone does
not create analytics resources. The first authorized operator or administrator
who opens Insights materializes the configured template through the normal host
saved-query and dashboard services, preserving owner and grant rules. Later
opens render the accessible existing dashboard instead of duplicating it.

Users with dashboard write access can edit its metadata and widget set, drag or
resize widgets, and add their accessible saved queries. Layout changes use the
normal dashboard update authorization. Read-only users receive a static grid.

For query-backed widgets, the host can resolve the dataset's `module_key` and
`record_type` to a published, workspace-visible Form definition. **View records**
then deep-links to that list in the plugin workspace's Records tab. The target
catalog and list API remain caller-scoped; the link does not grant record access.

## Agent tools

Do not add SQL or duplicate generic analytics tools to the plugin. OpsRabbit
agents use the host-provided Data Insight tools:

- `data_insight_catalog_list` discovers enabled plugin/Form datasets and fields.
- `data_insight_query_preview` executes a bounded semantic query as the current
  actor.
- Saved-query and dashboard tools persist user-requested analysis under normal
  owner and grant rules.

## Generate a reference plugin

The CLI includes a complete reference with Forms metadata, analytics and
template routes, settings, widget layouts, and tests:

```bash
npm create @opsrabbit/plugin@latest quality-insights -- --starter forms-insights
cd quality-insights
npm install
npm run check
npm run test:coverage
npm run build
npm run plugin:check
npm run plugin:pack
```

The generated manifest requires OpsRabbit `0.3.0` or newer and the
`configured_forms` and `data_insight` entitlements. Install and publish its Forms
starter pack before expecting datasets, Records drill-through, or dashboard
results.
