# Channel approval contract — 2026-10-06

Scope: additive public capability supporting Slack inbound approval delivery in
OpsRabbit. Host owns authorization, persistence, protected external-identity audit
and execution. Trusted channel adapters own provider authentication, current
human membership verification and native rendering. No global resolver, arbitrary
tenant input, always-allow decision or plugin-owned durable store is introduced.

Finishing criteria: exported TypeScript contract, JSON Schema/runtime parity,
executable reference, packed outside-workspace consumer check, public docs and
training, approved aligned SDK/CLI release versions, quality gates and PR review.
The host cannot claim completion before consuming the published release.

Current implementation includes typed actor/delivery/decision contracts, strict
decision validation, equivalent schema, executable winner/loser reference,
packaging inventory and clean-consumer wiring. Training course was reviewed and
updated with authorization, audit and ambiguous-post lessons. The user explicitly
approved package changes on 2026-10-06. SDK/CLI manifests and generated version
constants now align at 0.23.0. The host dependency update awaits npm publication;
it must not substitute a source checkout or unreleased package.

Independent read-only review found no decision validation/contract safety issue.
Its actionable packaging, consumer and documentation gaps were addressed. Focused
checks and the executable source reference passed; full `pnpm quality` also passed,
including SDK/CLI coverage, builds, packaging and all thirteen generated starters.
The new validator has 100% fresh line coverage. The focused decision suite has 31
passing cases. Autoreview completed with one alleged trailing-newline regex bug;
six new regression cases demonstrate both the unmodified JS validator and AJV
reject those inputs, so the finding is invalid and no regex change was needed.
Release-version changes have independent reviews; the missing public schema
export was added and the packed consumer imports that subpath. Publication and PR
checks are not yet claimed. Host design and authorization/lifecycle matrix are in
`gaurav-exp/docs/plans/slack-inbound-approvals-2026-10-06.md`.
