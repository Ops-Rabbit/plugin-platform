# Knowledge Email Processor V1 Public Contract Plan

Date: 2026-08-20

## Purpose

Expose a narrow public plugin contract for deterministic, tenant-configurable processing and post-processing of IMAP-derived Knowledge content.

This capability is not `knowledge.write`. A processor never directly creates, updates, searches, or deletes host Knowledge records. The host supplies bounded authorized inputs, validates outputs, owns persistence and embeddings, and may fall back to generic behavior.

## Coordinated repositories

1. `Ops-Rabbit/plugin-platform`: public contracts, schema, validation, starter, documentation, and release.
2. `Ops-Rabbit/opsrabbit`: host adapter, runtime invocation, Knowledge integration, UI/configuration, authorization, lifecycle, and integration tests.
3. `Ops-Rabbit/opsrabbit-plugins`: `support_email_knowledge` implementation and release.

The plugin-platform release must be available before host and plugin PRs pin/use the new contract.

## Public manifest capability

```json
{
  "capabilities": {
    "knowledgeEmailProcessor": {
      "schemaVersion": "1"
    }
  }
}
```

Validation rules:

- `schemaVersion` is required and initially accepts only `"1"`.
- The capability does not imply `knowledge.write`, database, object-store, routes, tools, or network access.
- Registration must include exactly one matching processor when capability is declared.
- Registration is rejected when the processor is registered but undeclared.
- A processor plugin may use ordinary settings, but referenced setting keys must exist and pass existing cross-field validation.
- Database mode should be `none` for the reference starter.

## Runtime contracts

Add exported JSON-compatible types:

- `KnowledgeEmailProcessorDefinitionV1`
- `KnowledgeEmailProcessingContextV1`
- `KnowledgeEmailMessageInputV1`
- `KnowledgeEmailSectionV1`
- `KnowledgeEmailMessageResultV1`
- `KnowledgeEmailCandidateV1`
- `KnowledgeEmailCandidatePostProcessInputV1`
- `KnowledgeEmailCandidatePostProcessResultV1`
- category/status scalar aliases and reason-code enums

Add `registerKnowledgeEmailProcessor(definition)` to the public registration API and registration test harness.

### Message input

Input contains only bounded, host-approved values:

- source/message/thread identifiers;
- mailbox/folder and IMAP UID metadata;
- subject and timestamp;
- cleaned newly authored evidence text;
- processing limits;
- effective plugin configuration revision.

Participant addresses are excluded from processor input in V1. They remain host-owned provenance.

### Message result

Each section includes:

- exact `sourceText` derived from the supplied evidence;
- source offsets proving provenance;
- bounded `embeddingText`;
- `chunkType` and `resolutionStatus` strings;
- bounded JSON metadata;
- original section order.

The public contract documents that the host rejects invented evidence, invalid offsets, excessive output, overlapping sections, unknown fields, and non-JSON values. SDK validation helpers should validate shape and limits that are host-independent; host limits remain authoritative.

### Retrieval input/result

The processor receives only email candidates already authorized and retrieved by the host. Candidate input contains ID, score, evidence, thread/message metadata, plugin classification metadata, and bounded query text.

Output contains:

- ordered candidate IDs drawn only from the input set;
- optional suppressed candidate IDs drawn only from the input set;
- stable bounded reason codes;
- no replacement scores and no new evidence.

The host contract states that non-email candidates are never passed to this method and that the host preserves non-email ordering/scores while merging email candidates back into email slots.

## SDK implementation files

Expected areas:

- `packages/plugin-sdk/src/contracts/capabilities.ts`
- `packages/plugin-sdk/src/contracts/registration.ts`
- a dedicated `contracts/knowledge-email-processor.ts`
- `packages/plugin-sdk/src/validation/manifest.ts`
- `packages/plugin-sdk/src/validation/registration.ts`
- `packages/plugin-sdk/src/testing/` registration helpers/assertions
- `packages/plugin-sdk/schemas/opsrabbit-plugin.schema.json`
- SDK exports and generated declaration output

Exact filenames may follow existing organization, but the capability must not remain a host-only extension.

## Reference starter

Add `knowledge-email-processor` to both duplicated starter inventories and their parity test.

Starter contents:

- manifest with `knowledgeEmailProcessor.schemaVersion = "1"`;
- database mode `none`;
- deterministic `general_message` processor;
- one configurable heading/category example;
- conservative candidate identity ordering with no suppression by default;
- unit tests proving recommendation/hypothesis uncertainty preservation;
- README explaining host/plugin ownership and fallback behavior.

The starter must be executable as an isolated clean consumer and included in release inventory verification.

## Documentation and versioning

Update together:

- root README capability overview;
- `packages/plugin-sdk/README.md`;
- current plugin contract documentation;
- user guide;
- starter reference;
- training course with a lesson on pure Knowledge processors and evidence preservation;
- changelog;
- SDK and CLI package versions according to repository release policy;
- generated artifacts required by the repository.

The training course must explicitly distinguish:

- `knowledge.write`: privileged direct host Knowledge publication;
- `knowledgeEmailProcessor`: host-invoked pure processing of already authorized IMAP evidence.

## Security and privacy contract

- Processors are tenant-scoped and selected explicitly by the host.
- They receive no credentials, attachment bytes, raw MIME, inaccessible records, or database handles by virtue of this capability.
- No network or filesystem capability is implied.
- Inputs/outputs are JSON-compatible and bounded.
- The host owns timeouts, cancellation, circuit breaking, logging redaction, authorization, audit, persistence, retention, deletion, and legal holds.
- Processor output is untrusted and must be validated before persistence or retrieval use.
- Original evidence is authoritative; embedding enrichment and labels are derived data.

## Compatibility

- Older hosts reject or report incompatibility for the unknown capability through existing compatibility handling.
- Plugins declare a minimum host contract/version supporting V1.
- V1 fields are closed to unknown properties where practical.
- Future schema changes use a new schema version rather than silently changing V1 semantics.
- A host may ignore processor output and fall back to generic email behavior without violating the contract.

## Tests

Positive tests:

- valid manifest capability;
- matching processor registration;
- valid message and candidate results;
- generated starter validates, tests, packs, and runs outside workspace.

Negative tests:

- unknown schema version;
- capability without registration;
- registration without capability;
- duplicate processor registration;
- invented/out-of-range source offsets;
- candidate output containing unknown/duplicate IDs;
- malformed metadata, unknown fields, oversized values, and non-JSON values;
- accidental implication of Knowledge write/database permissions.

Parity and packaging tests:

- TypeScript contract and JSON Schema accept/reject equivalent manifests;
- starter inventory lists remain synchronized;
- package exports include runtime validators and types;
- packed SDK/CLI and clean consumer include required schema/starter assets only.

## Delivery sequence

1. Implement SDK contracts and schema.
2. Add runtime/result validation helpers and registration parity.
3. Add generated starter and clean-consumer coverage.
4. Update all documentation, training, changelog, and versions.
5. Run `pnpm quality` sequentially under repository Node.
6. Open plugin-platform PR and publish compatible package versions.
7. Update host dependency and implement host adapter.
8. Implement and release `support_email_knowledge` against the published SDK.

## Definition of done

- No host-only email processor property remains undocumented or unvalidated publicly.
- TypeScript, JSON Schema, runtime registration validation, testing utilities, and starter agree.
- Host/plugin ownership and security boundaries are explicit.
- Reference starter is executable as a clean consumer.
- README, contract docs, user guide, starter reference, training, changelog, versions, and release inventory are updated.
- Full `pnpm quality` passes without suppressions.
