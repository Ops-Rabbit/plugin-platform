# Plugin Contract 0.5: Forms Workflows

Version 0.5 exposes the host's generic Forms-workflow declaration without moving
workflow execution into plugin code. It builds on the Forms workspace and starter
pack contracts from versions 0.3 and 0.4.

```json
{
  "navigation": {
    "kind": "forms_workspace",
    "moduleKey": "requests",
    "path": "/apps/requests",
    "icon": "shield_check",
    "fallbackTitle": "Requests",
    "workflow": {
      "rootStarterKey": "request",
      "stageModelSetting": "workflow_stages",
      "recordNumber": {
        "prefixSetting": "record_prefix",
        "digitsSetting": "record_digits"
      }
    }
  }
}
```

`rootStarterKey` must name a starter in the referenced Forms starter pack.
`stageModelSetting` must reference a declared `json` setting. Optional record
number references must point to declared `string` and `number` settings. The CLI
validates these relationships before packaging.

The stage setting is a JSON array. Each stage may declare `key`, `label`,
`purpose`, `owner_mode` (`agent_first`, `hybrid`, or `human_only`),
`human_gate`, `form_starter_keys`, `transition_form_starter_key`, and
`allowed_next_stage_keys`. Referenced forms are ordinary starters from the same
pack. Tenant configuration may change the stage model without changing plugin
code.

These three kinds of action are intentionally separate:

- a form schema action saves a draft or submits a form;
- a Forms workflow operation creates a root or follow-up record or changes stage;
- an executable plugin action runs registered plugin code and needs a declared
  action capability.

The host owns plugin enablement, tenant and resource authorization, owner/grant
checks, root/follow-up lineage, validation, persistence, attachments, stage
transition concurrency, record-number allocation, and audit. A plugin supplies
starter forms, settings, labels, and optional tools; it does not receive the
Forms database or recreate the workflow runtime.

Generate a complete reference with:

```bash
npm create @opsrabbit/plugin@latest my-workflow -- --starter forms-workflow
```
