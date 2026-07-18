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

Forms-backed plugins may also declare a `formStarterPack` pointing to a strict
JSON asset under `./forms/`. Use `validateFormStarterPack` in unit tests and the
published `@opsrabbit/plugin-sdk/form-starter-pack-schema` in editors or other
tooling. Starter assets contain host-rendered form and list definitions only;
they cannot contain executable code, SQL, migrations, tenant data, or access
policy. See the repository's Plugin Contract 0.4 guide for the complete shape.

A Forms workspace may declare `navigation.workflow` to identify its root starter,
JSON stage-model setting, and optional string/number record-number settings. The
host, not plugin code, owns root and follow-up persistence, transitions,
authorization, concurrency, numbering, and audit. See Plugin Contract 0.5 and
the generated `forms-workflow` starter.
