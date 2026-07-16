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

Each starter is also a versioned reference example. Use
`opsrabbit-plugin create my-reference --example operational-action` to render one.

The generated repository contains unit tests, a CI workflow, `AGENTS.md`, a
manifest, build configuration, and release packaging. `pack` validates the
compiled registration against its authoritative manifest and creates a
deterministic ZIP for upload to an OpsRabbit deployment. Capability declarations
are reviewed during deployment and do not grant host access on their own.
