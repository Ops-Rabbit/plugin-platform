# Plugin navigation sections

Available in published SDK/CLI 0.19.0 and supporting OpsRabbit host 0.6.0.
Plugins declaring either new field must set minimumOpsRabbitVersion to 0.6.0.

The optional public manifest field `navigation.section` selects `primary`,
`operations`, `control`, or `platform`. Omission preserves the historical
Primary placement. Values are lowercase and case-sensitive; unknown values
fail manifest validation. The host reuses its localized section headings.

Example:

```json
{
  "kind": "forms_workspace",
  "moduleKey": "helpdesk",
  "path": "/apps/helpdesk",
  "icon": "headset",
  "fallbackTitle": "Helpdesk Ops",
  "section": "control",
  "order": 40
}
```

This metadata affects discoverability only. It does not make a Control entry
admin-only, grant access, change tenant enablement, or bypass Forms/resource/action
authorization. Hosts must preserve their existing filters in every section.

Independently, optional `navigation.adminOnly: true` restricts the entry and its
workspace descriptor, host-capability authorization, action invocation and
asset viewing to the authenticated active-tenant administrator. Omission or false
preserves existing access behavior. Backend checks are mandatory, including
live role revalidation before native workspace actions. This flag does not
restrict agent tools, scheduled jobs, or ordinary Forms resources; those retain
their own authorization. Declare admin-only action roles for control-plane read
actions reachable outside the workspace endpoint too.
Ordering remains the existing plugin navigation order within the selected group.
Mobile hosts may expose the grouped sidebar through their navigation toggle
rather than inserting all plugins into a compact fixed shortcut bar.

The generated `forms-workflow` starter demonstrates Operations placement and
remains executable using the standard starter build/test/package commands.

Release dependency: ship this contract in a new immutable published SDK/CLI
version, upgrade the host validator and navigation projection to that version,
then release plugins that declare the field. Older validators reject the new
field; a local source checkout is not a published release. Set the dependent
plugin's minimum host version to the release that implements this contract.
