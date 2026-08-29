# Plugin Contract 0.17: Native Workspace Actions

OpsRabbit 0.3.2 and `@opsrabbit/plugin-sdk` 0.17 add a closed action broker for
native plugin workspaces. All Plugin Contract 0.16 boundaries remain in force.

## Declaration

A native workspace requests `plugin.actions.invoke` in `frontend.capabilities`
and lists the least-privilege declared action ids in `frontend.actionIds`. Every
listed id must also exist in `capabilities.actions`. The host supplies the
optional typed `context.pluginActions.invoke(actionId, input?)` broker only as a
capability surface; a workspace must still handle the broker being unavailable.

There is no plugin id or tenant id argument. A workspace cannot address another
plugin, another tenant, an undeclared action, or arbitrary host routes.

## Host authority

The capability is a request, not authority. Immediately before dispatch, the
host retains tenant and session authorization, the frontend action allowlist,
required-role and deployment-policy checks, effective enablement, exact managed
package generation and runtime lifecycle fencing, input validation, execution,
and action audit. Reload, replacement, removal, revocation, policy blocking, or
role demotion fails closed.

## Executable reference

```bash
npm create @opsrabbit/plugin@latest native-review -- --starter native-workspace
```

The generated starter declares and allowlists one action and tests both its
runtime action and browser ABI.
