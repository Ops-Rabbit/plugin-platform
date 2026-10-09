# Tool execution updates

SDK 0.24.0 adds an optional third argument to `ToolDefinition.run`:

```ts
async run(input, context, onUpdate) {
  onUpdate?.({ text: 'Checking available case data' });
  context.signal.throwIfAborted();
  return toolResult('Completed', { completed: true });
}
```

Existing two-argument handlers and final result formats are unchanged. No manifest
flag, extra tool registration, or extra agent call is needed. Supporting hosts
provide the callback for streaming tool execution; older hosts and direct
nonstreaming invocations may omit it. Plugin code must use optional chaining.
The executable `basic-readonly` starter demonstrates both cases.

`PluginToolUpdate` contains only `text`: nonblank plain output of at most 4096
Unicode code points. Unknown fields, UI actions, presentation metadata and
caller-selected identities are rejected. `validatePluginToolUpdate` throws on
invalid input; `isPluginToolUpdate` is the nonthrowing guard. The exported
`PLUGIN_TOOL_UPDATE_SCHEMA` and `./tool-update-schema` JSON artifact have equivalent
validation. Updates are partial output, not a final tool result, final assistant
answer, durable job handle or permission decision.

The host validates updates and maps them to Pi's `onUpdate` partial results and
`tool_execution_update` events. The callback belongs to one active execution;
completion, failure or cancellation disables it. Cancellation still requires the
plugin to honor `context.signal`. A tool which intentionally continues after
returning needs a separate background-job contract.

Host tenant enablement, tool authorization, current actor/grants and approval gates
run before execution and remain unchanged. The plugin cannot select a thread,
turn, workflow, call id or recipient through an update. The host applies its output
redaction, size bounds and authorized stream/replay policy. Embedded widgets may
filter progress; supporting this callback does not authorize exposing internal
tool output to public users. Render text as text, never executable markup.

Progress uses the existing turn/execution output lifecycle; it creates no separate
store or retention policy. Hosts remain responsible for parent deletion, retention,
legal holds where supported, and output authorization. Plugins must avoid secrets
and unnecessary customer content in progress and must not persist a duplicate
progress history. Progress cannot skip approval or authorize any side effect.

The host integration is release-dependent: a source checkout or locally packed SDK
is useful for development verification but does not satisfy production consumption
of the published 0.24.0 dependency. Release SDK and CLI together, then update the
host's published dependency and lockfile before deploying dependent plugins.
