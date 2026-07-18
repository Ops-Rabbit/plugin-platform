# OpsRabbit Plugin Platform

Public, versioned developer tooling for creating high-quality OpsRabbit plugins
without access to the private OpsRabbit product source.

This repository publishes:

- [`@opsrabbit/plugin-sdk`](./packages/plugin-sdk): contracts, manifest schema,
  validation, compatibility checks, governed service-plugin contracts, package
  inventory, and an isolated test harness.
- [`@opsrabbit/create-plugin`](./packages/create-plugin): CLI, six starters,
  reference implementations, generated tests, CI, README, and `AGENTS.md`.

## Create a plugin

```bash
npm create @opsrabbit/plugin@latest my-plugin -- --starter basic-readonly
cd my-plugin
npm install
npm run check
npm run test:coverage
npm run build
npm run plugin:check
npm run plugin:pack
```

Starters are executable reference plugins covering a read-only tool, controlled
operational action, tenant-scoped scheduled job, host-brokered tenant records,
a host-rendered Forms workflow, and authenticated service ingress with
plugin-owned storage. Run `opsrabbit-plugin examples list` to enumerate them. The generated ZIP is intended
for quarantine and administrator review in the OpsRabbit Plugins UI.

## Trust boundary

This repository intentionally contains no private OpsRabbit backend code,
database schema or credentials, authentication implementation, license internals,
runner broker implementation, deployment topology, or capability-token secrets.

The SDK describes requests and public contracts. It does not grant authority.
The OpsRabbit host remains responsible for role and resource authorization,
tenant isolation, capability enforcement, audit, approval, and isolated execution.

`opsrabbit.plugin.json` is authoritative. The compiled entry registers behavior
only, and the host rejects identifiers or security metadata that do not exactly
match the manifest.

## Develop the platform

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm quality
```

See [contributing](./CONTRIBUTING.md), [security](./SECURITY.md), and
[release operations](./docs/releasing.md). The [starter reference](./docs/starter-reference.md),
[Forms workspace navigation](./docs/plugin-contract-v0.3.md), and
[Forms starter-pack](./docs/plugin-contract-v0.4.md), and
[Forms workflow](./docs/plugin-contract-v0.5.md), and
[required entitlements](./docs/plugin-contract-v0.6.md) guides explain the contract
and expected tests for each plugin shape.
