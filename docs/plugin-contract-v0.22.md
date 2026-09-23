# Plugin Contract 0.22: Tool Presentation Metadata

Available in `@opsrabbit/plugin-sdk` 0.22.0.

## Purpose

A plugin tool sometimes has a safe native next step after a read result: for
example, opening an already-authorized booking page or offering another
reviewed suggested question. Before this contract, plugins either had to put
an instruction in model-visible text (which a client must never execute) or
lose the structured intent entirely.

`toolResult(text, value, presentation?)` adds a small, typed sidecar to the
existing tagged tool result. It is optional and has no manifest capability. An
existing plugin that calls `toolResult(text, value)` has exactly the same result
shape and behaviour as before.

```ts
return toolResult(
  "Booking information is ready.",
  { bookingId: "B100" },
  {
    clientAction: {
      target: "bookings",
      labelKey: "chat.cta.bookings",
      resourceRef: "B100",
    },
    suggestedFollowUpIds: ["booking_summary", "support_ticket_summary"],
  },
);
```

## Portable wire contract

The optional `presentation` object accepts only these fields:

| Field                      | Limit                                | Meaning                                                                       |
| -------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| `clientAction.target`      | lower-case bounded identifier        | A host-defined native destination key. It is never a URL.                     |
| `clientAction.labelKey`    | lower-case bounded localization key  | A host/client-owned localized label key.                                      |
| `clientAction.resourceRef` | optional bounded opaque identifier   | A route-scoped reference that the host/client may validate before navigation. |
| `suggestedFollowUpIds`     | at most 6 unique bounded identifiers | Opaque ids a client may map to its own safe suggested question.               |

The SDK rejects malformed values. The tagged result recognizer also rejects
unknown presentation fields, duplicate follow-ups, URLs, arbitrary objects, and
out-of-bound identifiers. Presentation is not a manifest capability because it
does not create access, install UI, or authorize an operation.

## Host responsibilities

This contract carries a plugin request, never authority. A host that supports
presentation must:

1. accept it only from a validated, enabled plugin result—not from model text,
   thread metadata, browser input, bindings, or tool arguments;
2. validate the typed shape again at the host boundary;
3. use a closed per-surface action-target allowlist; clients must map follow-up
   ids to reviewed text and begin a normal next turn rather than invoke a tool;
4. recheck the active user's current authorization before rendering and again
   before navigation or accepting a selected follow-up;
5. emit native structured events, not URLs or HTML, and preserve them in the
   ordinary replayable turn-event stream; and
6. ignore unsupported or unauthorized metadata without treating the result text
   as a fallback command.

The host owns client localization, navigation, agent tool exposure, persistence,
retention, audit, and authorization. A plugin must not rely on a presentation
event for completion of a business operation.

## Plugin responsibilities

Plugins should use presentation only after a successful result and only for
read-safe guidance. They must not include credentials, payment data, customer
content, raw records, URLs, mutation affordances, or policy decisions in these
fields. A follow-up id is not a tool call: a client must map it to reviewed
localized text and begin a normal next turn, after which the agent determines
whether Knowledge or a permitted live tool is appropriate.

The generated `basic-readonly` starter and the SDK registration tests remain a
reference for ordinary tagged tool results. This API adds no required manifest
field and requires no change to existing starters or installed plugins.

## Compatibility

This is additive. Hosts that have not implemented this contract continue to
receive the result text and JSON value and must ignore `presentation`. Plugins
should use the 0.22 SDK peer range only when they emit presentation metadata.
