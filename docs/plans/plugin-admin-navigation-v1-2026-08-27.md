# Plugin Admin Navigation V1

Status: design accepted for implementation on 2026-08-27.

## Outcome

Managed plugins may contribute a dedicated, host-rendered administration menu entry for an existing declarative admin workspace. The host owns route construction, authorization, navigation placement, localization fallback, enablement fencing, and rendering. Plugins own workspace content and data/action handlers. Core never branches on a plugin id.

V1 is deliberately limited to deployment-administrator workspaces. A global wallet such as Interaction Points must not be mutable by one tenant administrator because its balance affects that user in other tenants. Tenant-admin navigation requires a future tenant-scoped workspace, route, action, identity, and lifecycle contract and is not implied here.

Disabling, blocking, making recovery-only, or removing a plugin removes its navigation contribution and makes direct workspace routes fail closed. The host derives the route as `/admin/plugin-workspaces/<plugin-id>`; manifests cannot inject arbitrary URLs. Duplicate ids, unknown icons, missing localization keys, unsupported audiences, and capability/declaration mismatches fail package validation.

## Contract

`adminWorkspace.navigation` is an explicit schema-versioned opt-in. Its menu label, icon, and order reuse the bounded localized fields of the containing workspace. It requires the deployment-admin-workspace capability, localization, and deployment-scoped routes/actions. Navigation inventory responses contain only bounded localized entries the caller is authorized to see.

The dedicated page reuses the generic declarative workspace renderer. Deployment administrators retain the workspace on the Plugins page during the transition; the dedicated menu becomes the primary entry. Tenant administrators never receive deployment identity-directory or deployment-only actions.

## Authorization and lifecycle

This is an admin-only control-plane surface, not a grant root. Deployment-admin role is checked on navigation discovery, direct page load, every table route, and every action. UI hiding is not authorization. Navigation records are derived and not persisted; disabling or deleting the plugin removes them. Plugin-owned workspace data retains its existing plugin lifecycle and legal-hold rules.

## UX

Entries appear in the host's Platform section on desktop. On mobile, they are exposed through an accessible pop-up attached to the existing Plugins destination so plugin entries do not overflow the fixed bottom bar. Labels come from packaged localization bundles and icons from the bounded host icon catalog. The workspace page has a localized title/description, independent table loading and errors, accessible dialogs, keyboard behavior, and responsive layout.

## Prior art

The required `applied-ai-consulting/claude-code` URL was not available under that owner during review. The closest verifiable Applied AI source was the public `applied-artificial-intelligence/claude-code-toolkit` plugin layout. We borrow its manifest-owned contribution discovery and deterministic host composition. We reject executable plugin-owned navigation/UI chrome: OpsRabbit keeps routes, RBAC, localization resolution, and rendering host-owned because these are enterprise authorization boundaries.

## Release and tests

Release order is plugin-platform contract and clean-consumer verification, published SDK/CLI, minimal generic host support, then plugin manifest adoption using the latest published SDK. Tests cover schema/runtime parity, missing keys, route derivation, enable/disable, direct-route authorization, locale fallback, desktop/mobile visibility, and a clean packed consumer.
