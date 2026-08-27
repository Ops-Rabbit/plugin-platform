# Plugin contract 0.15: administration navigation

Version 0.15 adds an optional, host-rendered navigation entry for declarative deployment-administrator workspaces.

```json
{
  "adminWorkspace": {
    "schemaVersion": "1",
    "navigation": { "schemaVersion": "1" },
    "titleKey": "credits.title",
    "icon": "receipt",
    "tables": [
      {
        "id": "accounts",
        "titleKey": "credits.accounts",
        "routePath": "/accounts",
        "rowIdKey": "subject_id",
        "columns": [
          {
            "key": "balance",
            "labelKey": "credits.balance",
            "format": "decimal"
          }
        ]
      }
    ]
  }
}
```

The host derives `/admin/plugin-workspaces/<plugin-id>`, resolves the title from the packaged localization bundle, and uses the bounded workspace icon and order. Plugins cannot supply a URL. The entry and direct APIs are available only to deployment administrators while the plugin is enabled, loaded, compatible, and not recovery-only.

This contract does not grant tenant administrators access to deployment-wide workspaces. Tenant-admin navigation requires a future tenant-scoped workspace, route, action, identity, and lifecycle contract.
