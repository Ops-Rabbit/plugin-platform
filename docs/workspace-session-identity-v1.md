# Workspace signed-in identity and sign-out v1

A native workspace can show who is signed in and offer a Sign out control, without
building authentication. OpsRabbit owns login, sessions and identity for every plugin.
The workspace reads the signed-in user's own name and, when requested, email, and asks
the host to end the session. The host does the sign-out itself.

Available from SDK 0.40.0 on hosts with OpsRabbit plugin host version 0.13.0 or later.

## Declare

Request one or both frontend capabilities and require the supporting host:

```json
{
  "minimumOpsRabbitVersion": "0.13.0",
  "frontend": {
    "kind": "native_workspace",
    "capabilities": ["actor.email.read", "session.end"]
  }
}
```

| Capability         | Adds to `OpsRabbitWorkspaceContext`                    |
| ------------------ | ------------------------------------------------------ |
| `actor.email.read` | `actor.email?: string`, the signed-in user's own email |
| `session.end`      | `session?: { signOut(): Promise<void> }`               |

- Both capabilities work on standalone (`plugin_workspace`) and Forms workspaces.
- Runtime validation and the published manifest JSON Schema reject either capability
  when `minimumOpsRabbitVersion` is missing or lower than 0.13.0. Pre-releases of
  0.13.0 are also rejected.
- The exported constants are `WORKSPACE_ACTOR_EMAIL_CAPABILITY`,
  `WORKSPACE_SESSION_END_CAPABILITY` and
  `WORKSPACE_SESSION_IDENTITY_MINIMUM_OPSRABBIT_VERSION`.
- `actor.displayName` is unchanged and always present. It needs no capability.

## Use

```ts
const name = context.actor.displayName;
const email = context.actor.email ?? null; // absent unless requested and supplied

async function onSignOutClick() {
  if (!context.session) return; // not available on this host
  if (!(await context.confirmation.confirm("Sign out of OpsRabbit?"))) return;
  await context.session.signOut(); // the host navigates to its login page
}
```

- Treat an absent `actor.email` or `session` as "not available". Hide the control; do
  not fail.
- Call `signOut()` from the click handler of a visible control, after your own
  confirmation. Disable the control while the call runs. A resolved promise means the
  host accepted the request and is navigating away, so leave the control disabled.
- On a rejected call, re-enable the control and tell the user. The plugin has nothing
  else to clean up.

## What the host does

- It supplies `actor.email` only to a workspace that requested `actor.email.read`. The
  value is always the signed-in user's own email; no other user's email is ever
  exposed.
- `signOut()` checks the declared capability and that the workspace is still mounted.
  It also requires recent user activation (`navigator.userActivation.isActive`), so a
  workspace cannot end the session from a timer or background code.
- The host then revokes the session on the server, clears its own client state
  (tenant, chat and auth caches) and opens the OpsRabbit login page. This also ends the
  user's access to every plugin, because plugins have no sessions of their own.
- The host may also reject the call for other host-side reasons. Plugins must not retry
  automatically.

## Plugin rules

- Display the email; never persist, log, export, send it to another service, or pass
  it to an agent or model.
- Never call OpsRabbit authentication endpoints, read or clear cookies, or clear
  OpsRabbit storage to sign a user out. Use `session.signOut()` only.
- Do not sign the user out except from a direct user request.

## Compatibility

- The members are optional and `PLUGIN_FRONTEND_SDK_VERSION` stays `"1"`. Existing
  workspaces and manifests are unchanged.
- `PluginFrontendCapability` gains two members. Code that exhaustively switches over
  that union, or keys a complete record by it, needs the new members.
- Hosts older than 0.13.0 reject a manifest that requests these capabilities, so
  declare the minimum host version.

The executable reference is `packages/plugin-sdk/reference/workspace-session-identity.mjs`,
verified against the packed SDK by `scripts/verify-workspace-session-identity-consumer.mjs`.
