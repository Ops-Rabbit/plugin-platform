# Plugin Contract 0.3: Forms Workspace Navigation

Version 0.3 adds an optional, declarative Forms-workspace navigation entry to
the public plugin manifest. This is an additive authoring contract; it does not
change plugin API version `1.0` or grant a plugin access to Forms data.

```json
{
  "navigation": {
    "kind": "forms_workspace",
    "moduleKey": "quality",
    "path": "/apps/quality",
    "icon": "shield_check",
    "fallbackTitle": "Manufacturing Quality",
    "titleSetting": "menu_title",
    "iconSetting": "menu_icon",
    "order": 35
  }
}
```

The SDK validator and JSON Schema require a safe `/apps/<module>` path, a
lowercase module key, a supported host icon, a bounded fallback title, and a
finite optional order. `titleSetting` must reference a declared string setting.
`iconSetting` must reference a declared select setting whose choices are all
supported navigation icons.

The host treats navigation as discoverability metadata. Tenant plugin
enablement and Forms API authorization remain backend-enforced. The plugin does
not receive SQL, Forms services, sessions, or private host types through this
declaration.

This release intentionally does not add arbitrary frontend bundles or
plugin-defined routes outside the host-rendered `/apps/<module>` workspace.
