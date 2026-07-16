# Plugin Contract 0.2 Implementation Plan

Status: implementation complete; awaiting review and publication

## Objective

Make the public SDK the authoritative authoring contract that an OpsRabbit host
can validate and adapt without exposing private host services. Version 0.2
replaces the incompatible 0.1 experimental contract before the creator CLI is
published for the first time.

## Decisions

- `opsrabbit.plugin.json` is the authoritative identity, version, compatibility,
  entrypoint, settings, and capability declaration.
- The ESM entry exports only runtime registrations; it does not duplicate the
  manifest.
- Capability declarations name every tool, action, route, job, widget, and
  tenant-record collection and include host-enforced risk/role metadata.
- The public runtime receives opaque tenant/actor identifiers and bounded host
  brokers. It never receives SQL, credentials, host schemas, sessions, or
  internal services.
- Host-rendered widgets load through declared read-only routes.
- Scheduled jobs use interval, timeout, retry, and overlap metadata compatible
  with the existing OpsRabbit scheduler.
- Existing bundled OpsRabbit plugins remain behind a private legacy adapter
  during incremental migration.

## Compatibility and authorization

The host must reject unsupported API majors, source/manifest mismatches,
undeclared registrations, duplicate identifiers, missing widget routes, and
tenant-record collections not declared in the manifest. Role, tenant enablement,
resource grants, entitlements, cancellation, and system actor creation remain
host responsibilities.

## Prior art

Reviewed the Applied AI `claude-code` plugin loader, installation helpers, and
plugin operations. Borrowed strict path containment, explicit validation errors,
versioned immutable artifacts, shared non-interactive validation, and separation
between source description and effective host policy. Rejected desktop
user/project scopes, marketplace resolution, and in-process trust assumptions as
poor fits for a shared OpsRabbit server.

## Completion gates

- Schema, TypeScript manifest, runtime validator, and registration validator agree.
- Every generated starter clean-installs from packed SDK/CLI tarballs.
- Generated tests cover success, invalid input, cancellation where relevant,
  missing brokers, and tenant/actor propagation.
- Release checks prevent package/CLI/template version drift.
- Publishing resumes safely after registry propagation and can publish the CLI
  even when the SDK version already exists.

## Closeout

Implemented the authoritative manifest, named capability and security metadata,
declarative registration, actor/settings/cancellation context, host-rendered
widget, scheduler, and tenant-record broker contracts. Runtime and JSON Schema
validation are parity-tested. The CLI loads the compiled entry during `check`
and rejects declaration/registration drift before packaging.

Validation completed with formatting, lint, typechecking, 44 platform unit
tests, packed-artifact inspection, and clean-consumer generation of all four
references. SDK line coverage is above 95%; CLI line coverage is above 94%; all
generated plugin sources retain 100% line, branch, and function coverage.
