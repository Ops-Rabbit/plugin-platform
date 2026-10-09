# Tool execution updates

SDK 0.24.0 adds an optional third argument to `ToolDefinition.run`:

```ts
async run(input, context, onUpdate) {
  onUpdate?.('Checking available case data');
  context.signal.throwIfAborted();
  return toolResult('Completed', { completed: true });
}
```

`PluginToolUpdateCallback` accepts the existing `PluginToolOutput` contract:
a string, JSON value or tagged `toolResult`. No new manifest field, payload schema,
validation API or status tool is introduced. The host converts partial output
through the same adapter as final results and forwards it to Pi's `onUpdate`.
Existing two-argument handlers and final results remain unchanged. Older hosts
and nonstreaming invocations may omit the callback; use optional chaining.

Updates belong to the original authorized call. Completion, failure or cancellation
closes the callback before conversion. Keep honoring `context.signal`. Normal
approval, tenant/resource checks, output redaction/size bounds, authorized streams,
Embedded Chat filtering and parent-event retention/deletion still apply. Updates
cannot grant access or choose recipients. Avoid secrets and unnecessary customer
data; do not create a separate progress history.

The `basic-readonly` starter tests callback-present and callback-absent execution
against the packed SDK outside the workspace. Release SDK/CLI 0.24.0 together,
then update the host's published dependency and lockfile. Local source verification
does not satisfy that production release dependency.
