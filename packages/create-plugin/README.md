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

Each starter is also a versioned reference example. Use
`opsrabbit-plugin create my-reference --example operational-action` to render one.

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
release ZIP. A repository can contain multiple plugin directories as long as
each plugin runs these commands from its own package directory.
