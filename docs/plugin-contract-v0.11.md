# Plugin contract 0.11: native Forms workspaces

OpsRabbit 0.5 and `@opsrabbit/plugin-sdk` 0.11 add an optional precompiled
browser workspace for a plugin-owned Forms module. The host still owns the
authenticated shell, tenant selection, plugin enablement, Forms persistence,
RBAC and grants, validation, attachments, workflow transitions, audit,
retention, deletion, exports, package approval, deployment, and rollback.

## Manifest

```json
{
  "navigation": {
    "kind": "forms_workspace",
    "moduleKey": "quotations",
    "path": "/apps/quotations",
    "icon": "receipt",
    "fallbackTitle": "Quotations"
  },
  "frontend": {
    "kind": "native_workspace",
    "entry": "./dist/frontend.js",
    "styles": ["./dist/frontend.css"],
    "assets": ["./dist/assets/**"],
    "sdkVersion": "1",
    "mountIsolation": "shadow_dom",
    "capabilities": [
      "forms.catalog.read",
      "forms.submissions.read",
      "forms.submissions.write",
      "forms.workflow",
      "forms.actions"
    ]
  }
}
```

All paths are package-relative regular files. Remote URLs, traversal, links,
source maps, unknown capabilities, and incompatible SDK or isolation versions
fail validation. Individual frontend files are limited to 5 MiB and the
declared frontend inventory to 20 MiB. The host revalidates the immutable
package and is authoritative if its deployment policy is stricter.

## Browser ABI

The entry exports a named `mount` function. Plugins import public types only;
the host does not provide or share a Svelte runtime.

```ts
import type { OpsRabbitWorkspaceModule } from "@opsrabbit/plugin-sdk";

export const mount: OpsRabbitWorkspaceModule["mount"] = (target, context) => {
  target.textContent = `Tenant ${context.tenant.id}`;
  void context.forms.catalog();
  return { destroy: () => target.replaceChildren() };
};
```

The context exposes display-safe identity; locale and theme subscriptions; safe
same-origin navigation; host notifications and confirmation; an overlay root;
declared asset URLs; lifecycle cancellation; and Forms clients, including
authorized existing-attachment content/text reads when `forms.attachments` is
declared. It never
exposes cookies, tokens, host stores, database connections, private frontend
imports, or backend service objects.

Every Forms call is checked twice: the client rejects undeclared frontend
capabilities, and the host rechecks the active package generation, enablement,
module ownership, role, and resource grants. A declaration is a requested
ceiling, never authorization.

## Building with Svelte or another UI library

Build a browser library bundle with a named `mount` export and bundle all UI
dependencies into the output. For Svelte, configure Vite/Rollup library mode,
use `src/frontend.ts` as the entry, and do not externalize Svelte, grid, chart,
icon, or animation packages. Emit CSS under `dist/`, static files under
`dist/assets/`, and disable production source maps. Do not load code or styles
from a CDN.

Keep the declared backend entry at `dist/index.js`. If it imports compiled
backend support modules, place those modules under `runtime/`; the packer
includes that directory while the host continues to reserve other
`dist/*.js` files for explicitly declared frontend entry points.

The `native-workspace` starter is framework-light so the ABI is visible.
Replace its DOM rendering with a compiled Svelte component while retaining the
same `mount` export and cleanup behavior.

## Trust and lifecycle

Native code executes as same-origin JavaScript in signed-in browsers. Shadow
DOM isolates CSS and component structure; it is not a security sandbox. Only
deployment-admin-approved trust tiers accepted by the host may deploy it.
Disabled or replaced generations remain package-history data according to host
retention policy but are not served as the active workspace. Browser caches
cannot be synchronously erased. The SDK adds no durable customer-data cache,
and Forms deletion and retention semantics do not change.
