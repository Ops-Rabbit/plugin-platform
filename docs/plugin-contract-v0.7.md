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
caller. A template cannot contain SQL, grant access, persist a dashboard, or
expose records hidden by Forms authorization.

## Preferences and saved dashboards

The host may persist the initial Records/Insights tab for the current tenant,
user, and module when `allowUserDefault` is enabled. Enabling a plugin never
creates saved queries or dashboards. Agents and users create those through the
normal host services, preserving owner and grant rules.
