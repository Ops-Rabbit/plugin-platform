# Starter and reference plugins

Every starter is a complete executable reference implementation bundled with
`@opsrabbit/create-plugin`. Run `opsrabbit-plugin examples list` to see the ids.

| Starter                   | Capabilities                      | Demonstrates                                                     |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `basic-readonly`          | `tools`                           | Tenant-scoped read operation and structured logging              |
| `operational-action`      | `actions`                         | Validated input, write permission declaration, actor attribution |
| `scheduled-tenant-job`    | `scheduledJobs`                   | Tenant-scoped background work and cancellation                   |
| `database-tenant-records` | `tools`, `database.tenantRecords` | Host-brokered persistence with no SQL client or credentials      |

Each generated repository includes unit tests, coverage enforcement, TypeScript
checks, a pinned GitHub Actions workflow, README, `AGENTS.md`, manifest, and
deterministic package command. The platform CI regenerates all four from the
packed npm candidates, installs them outside the workspace, and runs every
documented quality command before either public package can be released.
