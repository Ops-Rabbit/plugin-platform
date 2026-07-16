# Contributing

Use Node from `.nvmrc` and Corepack-managed pnpm.

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm quality
```

Public API changes require tests, a compatibility note, and review from the SDK
code owners. Never add OpsRabbit backend imports, internal schemas, credentials,
private endpoints, or product source to this repository.
