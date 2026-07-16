# `@opsrabbit/plugin-sdk`

The stable public contract for building and testing OpsRabbit plugins without
checking out the OpsRabbit product source.

```ts
import { definePlugin } from "@opsrabbit/plugin-sdk";

export default definePlugin({
  manifest: {
    id: "hello-ops",
    name: "Hello Ops",
    version: "0.1.0",
    description: "A minimal read-only tool.",
    apiVersion: "1.0",
    main: "./dist/index.js",
    capabilities: ["tools"],
  },
  tools: [
    {
      id: "hello",
      description: "Returns a greeting.",
      async run(input: { name: string }) {
        return { message: `Hello, ${input.name}` };
      },
    },
  ],
});
```

Use `@opsrabbit/plugin-sdk/testing` for an in-memory invocation context and
contract assertions. Use `@opsrabbit/plugin-sdk/packaging` for deterministic
package inventories and digests.

The SDK intentionally contains no OpsRabbit backend, authentication, database,
runner, licensing, or deployment implementation. Capability declarations are
requests reviewed and enforced by the host; they never grant access by themselves.
