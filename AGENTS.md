# Plugin Platform Development Rules

## Public core-capability completeness

When OpsRabbit exposes a new core capability to plugins, the public surface is
not complete until all of the following move together:

- public TypeScript contracts and exports;
- JSON Schema and runtime validation with cross-field and referenced-asset checks;
- host-compatibility documentation that states what the plugin declares and what
  the host continues to authorize, persist, audit, and execute;
- at least one executable generated starter or reference implementation;
- focused positive, negative, schema-parity, packaging, and clean-consumer tests;
- README, starter reference, changelog, version, and release inventory updates.

Starter ids are duplicated in the TypeScript CLI inventory and the isolated
clean-consumer verification script. Update both lists and keep a test that fails
when they diverge.

Never expose a host-only manifest property or capability and describe the public
SDK as complete. Compare the public contract with the current host contract before
release, and fail closed when referenced settings, assets, starters, or capabilities
do not agree.

For Forms-backed functionality, keep ordinary form persistence actions
(`save_draft` and `submit`), Forms workflow operations (root creation, follow-ups,
and stage transitions), and executable plugin actions as separate concepts. The
host owns tenant enablement, authorization, grants, validation, persistence,
attachments, lineage, transition concurrency, record numbering, and audit.

Treat Forms starter assets as versioned product configuration. When changing
fields, sections, actions, dynamic option sources, workflow placement, analytics
field references, or default list configuration, keep stable keys where existing
records should survive and document that tenant admins must republish the starter
pack after upgrading. The host-owned publish flow refreshes existing
starter-backed definitions while preserving definition ids, form keys,
title/description customizations, submissions, and historical schema snapshots;
plugin code must not require manual SQL updates or write ordinary Forms
definitions directly.

## Runtime

Use the repository Node version through `nvm use`. Run test suites sequentially.
Before release, run `pnpm quality` and verify every generated starter as an
outside-workspace consumer.
