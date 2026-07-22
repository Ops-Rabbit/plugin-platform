# `@opsrabbit/create-plugin`

Create an isolated, testable OpsRabbit plugin repository:

```bash
npm create @opsrabbit/plugin@latest my-plugin -- --starter basic-readonly
cd my-plugin
npm install
npm test
npm run build
npx opsrabbit-plugin check
npx opsrabbit-plugin pack
```

`check` loads the plugin's compiled entry so it can compare runtime
registrations with the manifest. Run it only on source you trust, just as you
would the plugin's own build or test scripts.

Available starters:

- `basic-readonly`
- `operational-action`
- `scheduled-tenant-job`
- `database-tenant-records`
- `forms-workflow`
- `forms-insights`
- `service-ingress`

Each starter is also a versioned reference example. Use
`opsrabbit-plugin create my-reference --example operational-action` to render one.
`opsrabbit-plugin examples list` retains its script-friendly one-ID-per-line
output; add `--verbose` for descriptions.

The generated repository contains unit tests, CI and automatic-release workflows,
`AGENTS.md`, a manifest, build configuration, and release packaging. `pack` validates the
compiled registration against its authoritative manifest and creates a
deterministic ZIP for upload to an OpsRabbit deployment. Capability declarations
are reviewed during deployment and do not grant host access on their own.

`release` additionally requires an exact `vX.Y.Z` tag/version match and creates
the ZIP, SHA-256 checksum, SPDX 2.3 SBOM, and release metadata. The generated
workflow publishes those files in an immutable GitHub Release after a
release-content merge to `main`, automatically choosing a patch increment when
the current version is already released. It creates GitHub artifact provenance
when supported and otherwise retains checksum/SBOM verification and release
publication.

For a Forms-backed plugin, place the versioned starter JSON under `forms/` and
reference it with `formStarterPack` in `opsrabbit.plugin.json`. `validate` and
`check` validate that asset and its module ownership; a declared Forms workflow
also verifies its settings and root starter. `pack` includes it in the
release ZIP. Treat that starter asset as versioned product configuration:
changing fields, sections, actions, dynamic option sources, workflow placement,
or default list configuration requires tenants to republish the starter pack
after installing the plugin upgrade. The host refreshes installed
starter-backed definitions during publish while preserving definition ids, form
keys, local title/description customizations, submissions, and historical schema
snapshots. A repository can contain multiple plugin directories as long as each
plugin runs these commands from its own package directory.

Operationally, a plugin upgrade has two steps: upload/deploy the new package,
then republish the starter pack for tenants that should receive the updated
Forms definition. If an upgraded plugin appears to run but users do not see new
fields, dynamic dropdowns, workflow actions, list columns, or Insights mappings,
confirm the starter pack was republished.

The generated Forms-workflow reference also demonstrates
`requiredEntitlements`. These are host-defined license requirements, not
capabilities granted by the plugin manifest.

Use `forms-insights` for a complete Forms-backed analytics reference. It
generates a published starter pack, a caller-scoped analytics catalog, an
Insights template route, a configurable Insights tab, dashboard widgets, and
tests for both wire catalogs. After installation and publication, the host
materializes the default template into ordinary saved queries and an editable
Data Insight dashboard. Users with dashboard write access can drag, resize, and
add saved-query widgets. Query-backed widgets can open the matching list in the
plugin workspace's Records tab. Agents use the host's generic Data Insight
catalog and bounded query tools; the plugin does not reimplement them.

```bash
npm create @opsrabbit/plugin@latest quality-insights -- --starter forms-insights
```

Use `service-ingress` as the reference for scoped API-token ingress,
journaled plugin-schema Drizzle migrations, and direct evidence-upload
preparation. Validation requires `meta/_journal.json` and rejects journal
entries that do not exactly match the packaged SQL migration files.
After deploying a service-ingress plugin, create the tenant-scoped API token in
the host plugin settings UI and pass that token to the edge/agent installer.
Agents should send JSON control events to ingress and upload large binary
evidence through host-issued object-store instructions.
