# Knowledge broker contract (SDK 0.9)

Declare `capabilities.knowledge.write: true` to request the optional
`context.knowledge` broker. It creates or reuses a source owned by the invoking
plugin, upserts UTF-8 plain-text, Markdown, or HTML documents by stable keys,
and publishes a searchable generation explicitly after a batch.

The declaration is a request, not authority. The host verifies plugin and
tenant enablement, actor and surface, source ownership, input bounds,
persistence, extraction, indexing, retention, and audit. Human invocations
require tenant-admin authority. Plugins cannot address sources by host id or
mutate administrator-created or other-plugin sources.

Source and document keys contain 1 to 128 lowercase letters, numbers, dots,
underscores, or hyphens; the first and last character must be alphanumeric.
Source names contain 1 to 160 characters and descriptions at most 2,000.
Document titles contain 1 to 500 characters. Content must be valid, non-empty
UTF-8 and cannot exceed 25 MiB. The supported content types are `text/plain`,
`text/markdown`, and `text/html`. Metadata must be JSON and cannot exceed 64
KiB after UTF-8 encoding. An optional source URI must be an HTTP or HTTPS URL
of at most 2,048 characters.

Call `publish` once after all documents in a batch are upserted. Search and
agent-source assignment remain separate host-authorized operations. See the
generated `knowledge-publisher` starter for an executable example.
