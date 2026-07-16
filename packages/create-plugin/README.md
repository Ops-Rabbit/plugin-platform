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

Available starters:

- `basic-readonly`
- `operational-action`
- `scheduled-tenant-job`
- `database-tenant-records`

The generated repository contains unit tests, a CI workflow, `AGENTS.md`, a
manifest, build configuration, and release packaging. `pack` validates the
compiled plugin and creates a deterministic ZIP for upload to an OpsRabbit
deployment. Capability declarations are reviewed during deployment and do not
grant host access on their own.
