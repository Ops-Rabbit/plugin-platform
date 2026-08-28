# Plugin Contract 0.16: governed Connection-to-Knowledge workflows

Version 0.16 adds generic public contracts for plugins that read an explicitly
selected Connection, stage host-owned Forms review, publish plugin-owned
Knowledge, and retrieve a complete linked document family.

## Manifest declaration

The setting remains an opaque Connection id. A selector binds that setting to a
host-recognized integration type, read access, and the scheduled jobs allowed to
materialize it:

```json
{
  "settings": [
    {
      "key": "imap_connection_id",
      "label": "IMAP Connection",
      "type": "string",
      "required": true
    }
  ],
  "capabilities": {
    "scheduledJobs": [{ "id": "stage-connection-review" }],
    "connections": {
      "selectors": [
        {
          "settingKey": "imap_connection_id",
          "integrationType": "imap_mailbox",
          "access": "read",
          "scheduledJobIds": ["stage-connection-review"]
        }
      ]
    },
    "knowledge": { "read": true, "write": true, "delete": true }
  }
}
```

The declaration requests access; it does not grant it. The host renders a typed
Connection selector, validates integration compatibility, checks tenant and
resource grants, binds scheduled invocation identity, and may withhold the
broker.

## Runtime flow

1. The scheduled job calls `context.connections.materialize({ selector:
"imap_connection_id" })`.
2. Materialized values exist only for that invocation. Plugin code must not log,
   return, persist, or copy credentials into Forms or Knowledge.
3. The starter invokes a bounded protocol-adapter seam and creates a review
   submission through `context.forms`; it is not a production IMAP library.
4. A host Forms transition records immutable reviewer, action/type, stage,
   revision, and approved/current content hashes.
5. A separate administrator action verifies those fields before using the
   plugin-owned Knowledge broker.
6. Publication stores a revision manifest and deletes obsolete siblings.
7. A read tool reranks bounded competing hits and expands the best hit with
   `fetchByMetadata({ sourceKey, caseId, sourceRevision })`.

## Host compatibility and ownership

The host owns Connection secret storage, selector UI, integration-kind checks,
`connection:use` authorization, scheduled identity, cancellation, Forms
persistence and transitions, immutable approval provenance, Knowledge source
ownership, indexing, retrieval authorization, retention, deletion, and audit.
The plugin owns protocol/business logic, bounded derived content, stable document
keys, and explicit fail-closed checks when a broker is absent.

Knowledge reads do not make a source visible to every user or agent. The host
continues to apply role and resource grants. Family expansion must include the
exact source key, case id, and source revision from an authorized hit; plugins
must not use caller-supplied tenant ids or unbounded metadata scans.

## Executable reference

```bash
npm create @opsrabbit/plugin@latest governed-review -- --starter connection-knowledge-review
```

The generated tests cover invocation-bound selector authorization, bounded
adapter reads without secret persistence, hashes tied to exact approved content,
revision replacement, independent Knowledge permissions, competing-case
reranking, exact family expansion, and missing-broker failure. Platform CI
installs and verifies the starter outside this workspace.
