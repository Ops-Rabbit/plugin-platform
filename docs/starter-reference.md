# Starter and reference plugins

Every starter is a complete executable reference implementation bundled with
`@opsrabbit/create-plugin`; no private checkout or network template download is
needed. Run `opsrabbit-plugin examples list` to see the ids and generate one with
`opsrabbit-plugin create <name> --starter <id>`.

| Starter                   | Capabilities                    | Demonstrates                                                      |
| ------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| `basic-readonly`          | `tools`                         | Tenant-scoped read operation and structured logging               |
| `operational-action`      | `actions`                       | Validated input, write permission declaration, actor attribution  |
| `scheduled-tenant-job`    | `scheduledJobs`                 | Tenant-scoped background work and cancellation                    |
| `database-tenant-records` | named tool and tenant records   | Host-brokered persistence with no SQL client or credentials       |
| `forms-workflow`          | Forms metadata and read tool    | Root/follow-up forms, configured stages, numbering, host boundary |
| `service-ingress`         | ingress, database, object store | Scoped tokens, schema migrations, direct evidence uploads         |

Each generated repository includes unit tests, coverage enforcement, TypeScript
checks, a pinned GitHub Actions workflow, README, `AGENTS.md`, manifest, and
deterministic package command. The platform CI regenerates all six from the
packed npm candidates, installs them outside the workspace, and runs every
documented quality command before either public package can be released.
