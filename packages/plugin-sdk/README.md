# `@opsrabbit/plugin-sdk`

The stable public contract for building and testing OpsRabbit plugins without
checking out the OpsRabbit product source.

```ts
import { definePlugin, toolResult } from "@opsrabbit/plugin-sdk";

export default definePlugin({
  tools: [
    {
      id: "hello",
      description: "Returns a greeting.",
      risk: "read",
      audience: "all",
      requiredPermission: "read",
      async run(input: { name: string }) {
        return toolResult(`Hello, ${input.name}`, { name: input.name });
      },
    },
  ],
});
```

`opsrabbit.plugin.json` is the authoritative identity and capability declaration.
The entrypoint registers behavior only; the host compares it with the manifest
before activation. A matching manifest declaration for the tool above is:

```json
{
  "capabilities": {
    "tools": [
      {
        "id": "hello",
        "risk": "read",
        "audience": "all",
        "requiredPermission": "read"
      }
    ]
  }
}
```

Use `@opsrabbit/plugin-sdk/testing` for an in-memory invocation context and
contract assertions. Use `@opsrabbit/plugin-sdk/packaging` for deterministic
package inventories and digests.

`toolResult(text, value)` preserves a concise agent-visible message alongside a
structured JSON value. Its tagged shape is recognized by the host without
guessing based on ordinary business fields. Returning an ordinary JSON value
remains supported and the host serializes it as the tool message.

The SDK intentionally contains no OpsRabbit backend, authentication, database,
runner, licensing, or deployment implementation. Capability declarations are
requests reviewed and enforced by the host; they never grant access by themselves.

Forms-backed plugins may declare a host-rendered workspace through the optional
`navigation` manifest field. The host validates the `/apps/<module>` path,
supported icon, module key, and referenced title/icon settings. Navigation is
discoverability metadata only and never grants Forms-record or host-service access.
