# Governed skill Connection execution v1

OpsRabbit host compatibility 0.6.0 adds an agent-runtime contract for provider helpers packaged in tenant-imported skills. This is a host-owned agent tool, not a plugin invocation broker. The plugin runtime does not receive filesystem or Connection material, but an imported helper invoked through this tool receives the selected Connection environment and is therefore trusted credential-bearing code that the tenant must review before import.

## Tool request

`skill_connection_exec` accepts exactly:

```json
{
  "connection": "Jira Read",
  "skill": "jira",
  "script": "jira_api.py",
  "args": ["get-issue", "--key", "QA-123"],
  "timeout_seconds": 120
}
```

- `connection`, `skill`, and `script` are required bounded strings.
- `args` contains at most 64 literal strings, each at most 4,096 characters and at most 65,536 serialized bytes in aggregate.
- `timeout_seconds` is optional and ranges from 1 through 900.
- Unknown properties, raw commands, working directories, interpreter selection, environment overrides, and command-family overrides are unsupported.

## Host guarantees

The host intersects the authenticated tenant actor, active agent, tenant-imported attached skill, attached Connection, Connection `use` permission, and provider authorization. Global/project skills are not executable through this contract. The Connection must be environment-only and its command-family restriction must contain exactly the reserved `skill_script` value. Such a Connection is rejected by raw `connection_exec`.

The host resolves a canonical regular non-symlink `.py` file beneath the tenant skill's `scripts/` directory, limits it to 1 MiB, reads one immutable snapshot, and calculates SHA-256. Approval identifies the dedicated tool, Connection, skill, script digest, and literal bounded arguments without exposing Connection secrets. Secret materialization occurs only after approval. The host reloads the active agent attachment, script, and Connection authorization after approval and fails if any relevant authority or digest changed.

Execution uses Python 3 with isolation flags and passes script bytes over stdin plus arguments as literal argv values. It never creates a shell command from model arguments and never falls back to the backend host. The deployment must enable a Docker sandbox with session scope, no host workspace mount, a read-only root, all capabilities dropped, bridge (not host) networking, and Python 3 in the image. The host gives each call a uniquely keyed container and destroys it afterward, so writable temporary storage is not reused. Connection secrets exist only in the sandbox child environment for that invocation. File-backed Connection secrets are rejected before resolution in v1. Existing timeout/cancellation, bounded output, secret redaction, and process-tree cleanup remain authoritative.

The tool creates no new durable resource or store. Output follows ordinary thread/tool-result retention and is not copied to durable Memory automatically. Skill or Connection deletion, revocation, detachment, or authorization changes prevent later executions.

## Plugin dependency

A plugin that distributes skills requiring this tool declares `minimumOpsRabbitVersion: 0.6.0` and describes the required agent tool and `skill_script` Connection. The plugin runtime cannot invoke this tool itself or receive the Connection secret directly; when an agent invokes an imported helper, that helper does receive the Connection environment and remains inside the tenant's trusted credential boundary.
