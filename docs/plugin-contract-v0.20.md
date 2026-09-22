# Plugin Contract 0.20: Opaque Embedded Delegation

Host compatibility `0.7.0` adds a narrowly-scoped way for a reviewed managed
plugin to use an opaque, per-turn reference while serving a verified Embedded
Chat user. It is intended for a plugin that has its own configured downstream
integration and must bind that downstream call to the already-authenticated
embedded turn.

## Declaration

Declare every eligible read-only tool explicitly in both places:

```json
{
  "minimumOpsRabbitVersion": "0.7.0",
  "capabilities": {
    "tools": [
      {
        "id": "current-state",
        "risk": "read",
        "embeddedChat": true,
        "embeddedPresentation": {
          "clientAction": {
            "target": "records",
            "labelKey": "chat.cta.records"
          },
          "suggestedFollowUpIds": ["show-recent-records"]
        }
      }
    ],
    "embeddedDelegation": {
      "schemaVersion": "1",
      "toolIds": ["current-state"]
    }
  }
}
```

The runtime registration repeats `embeddedChat: true`. The SDK rejects a
manifest that binds an unknown or non-embedded tool, and rejects registration
metadata that differs from its manifest. Use the executable
`embedded-delegation` starter as the minimum reference.

`embeddedPresentation` is optional and declarative. A plugin may return the
matching `toolResult(text, value, presentation)` after a successful call; the
host accepts it only when it exactly matches the reviewed manifest declaration.
It then emits a structured client event, never a link parsed from model text.
The active embedded agent and client still apply their own closed target,
permission, and follow-up allowlists. Resource references are rejected unless
the manifest's fixed action explicitly allows one.

## Authority boundary

The host may supply `context.embeddedDelegationId` only when all of these are
true: an Embedded Chat turn is active and verified; the tool is declared in the
capability; the package was deployed through managed package intake; the
deployment administrator explicitly accepted its in-process trust boundary;
and the current package/tenant/tool authorization checks pass. A declaration
does not grant any of this authority.

The string is opaque. It is not a user ID, credential, permission, bearer
token, or general HTTP capability. It expires with the embedded turn and is
unavailable to normal chat, workflow, scheduled-job, route, action, resumed or
background work after expiry. The model, browser/mobile client, thread metadata,
plugin settings API, logs, and tool result must never receive it.

Plugins must use it only as the downstream system's documented per-turn binding
and must not persist, cache, log, return, display, hash for a cross-turn index,
or derive customer authority from it. Downstream calls still need independent
authentication, transport protection, endpoint allowlisting, response
validation, actor revalidation, and audit.

## Host responsibility

The host owns package approval, package digest selection, tenant enablement,
current agent/tool/thread permissions, embedded-widget verification, expiry,
revocation, cancellation, and suppression of the field from client and model
surfaces. The plugin owns only its downstream protocol and must fail closed if
the reference is absent. Neither plugin settings nor an approved package grants
access to another plugin's secrets.
