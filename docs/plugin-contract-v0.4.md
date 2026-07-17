# Plugin Contract 0.4: Forms Starter Packs

Version 0.4 lets a Forms-backed plugin own its starter definitions as a bounded,
declarative JSON asset. It builds on the version 0.3 Forms-workspace navigation
contract and does not change plugin API version `1.0`.

The manifest points to one asset directly under the plugin's `forms/` directory:

```json
{
  "navigation": {
    "kind": "forms_workspace",
    "moduleKey": "quality",
    "path": "/apps/quality",
    "icon": "shield_check",
    "fallbackTitle": "Manufacturing Quality"
  },
  "formStarterPack": {
    "moduleKey": "quality",
    "path": "./forms/manufacturing-quality.json"
  }
}
```

The asset has a versioned format and uses the SDK's public camel-case types:

```json
{
  "formatVersion": 1,
  "moduleKey": "quality",
  "starters": [
    {
      "starterKey": "quality_report",
      "title": "Quality report",
      "description": "Capture a controlled quality report.",
      "recordType": "quality_report",
      "badge": "Quality",
      "icon": "check",
      "schema": {
        "fields": [{ "key": "batch_id", "label": "Batch ID", "type": "text" }],
        "sections": [
          { "key": "report", "label": "Report", "fieldKeys": ["batch_id"] }
        ],
        "actions": [{ "key": "submit", "label": "Submit", "kind": "submit" }]
      },
      "listConfig": {
        "columns": [{ "fieldKey": "batch_id", "label": "Batch ID" }],
        "defaultSort": "updated_at_desc"
      }
    }
  ]
}
```

`validate` and `check` read the referenced file, reject symlinks and files over
1 MiB, validate every nested property, and require its module key to match both
the manifest reference and Forms navigation. `pack` includes the `forms/`
directory in the deterministic release ZIP. The JSON Schema is exported as
`@opsrabbit/plugin-sdk/form-starter-pack-schema` and runtime validation is
available through `validateFormStarterPack`.

The asset can describe Forms fields, sections, actions, list columns, search and
filter fields, landing-workspace hints, page size, and the supported default
sort. It cannot contain SQL, migrations, executable code, tenant data,
authorization policy, arbitrary routes, or private host configuration.

The OpsRabbit host remains responsible for tenant plugin enablement, schema
installation and publication, Forms record authorization, validation,
persistence, attachments, and audit. Declaring a starter pack does not install
forms or grant access merely because its navigation is visible.
