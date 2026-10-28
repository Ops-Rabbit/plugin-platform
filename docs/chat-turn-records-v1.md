# Chat turn records v1

SDK 0.33.0 adds `chatTurnRecords/v1`, a read-only broker. A deployment interaction policy uses
it to show administrators the question and answer feedback for chat turns it admitted. SDK 0.36.0
adds the optional feedback comment to each record. At
admission a plugin receives the turn's identifiers, the actor, and request facts, but never the
message text. The host keeps the text and feedback and returns them on demand, so the plugin
never stores a copy.

Runtime availability requires a host that implements this contract. A host without it supplies
no `context.chatTurnRecords`; a plugin must treat that as "not available", not as an error.

## Declaration

```json
"capabilities": {
  "chatTurnAdmission": { "schemaVersion": "1", "scope": "deployment" },
  "deploymentAdminWorkspace": { "schemaVersion": "1" },
  "audit": { "write": true },
  "chatTurnRecords": { "schemaVersion": "1", "read": true }
}
```

`chatTurnRecords` requires `chatTurnAdmission`, `deploymentAdminWorkspace`, and `audit`, and the
manifest must set `minimumOpsRabbitVersion` to `0.11.0` or later, the first host release that
implements the broker. Runtime validation and the published manifest JSON Schema both enforce this.

## Use

```ts
const { turns } = await context.chatTurnRecords.getTurns({ turnIds });
```

The broker exists only in `requiredRole: "admin"` deployment workspace route calls. Actions,
scheduled jobs, tools, admission, and composer status never receive it. See
[`reference/chat-turn-records.mjs`](../packages/plugin-sdk/reference/chat-turn-records.mjs) for an
executable route helper that batches ids and degrades to "not available".

A call accepts 1 to `CHAT_TURN_RECORDS_MAX_TURN_IDS` (25) unique turn ids. A route invocation
may call it at most `CHAT_TURN_RECORDS_CALLS_PER_INVOCATION` (4) times. The result contains one
`ChatTurnRecordV1` per requested turn that still exists and that this plugin admitted, in
request order:

- `turnId` and `threadId`.
- `userMessage`: the user's question, at most `CHAT_TURN_RECORDS_MAX_MESSAGE_LENGTH` (2000)
  Unicode code points. `userMessageTruncated` reports whether it was cut.
- `userMessage` is `null` when the turn still exists but its question message or author has been
  deleted. `userMessageTruncated` is then `false`.
- `feedback`: `thumbs_up`, `thumbs_down`, or `null`, from the turn's assistant answer.
  `feedbackUpdatedAt` is a UTC timestamp `YYYY-MM-DDTHH:MM:SS[.fraction]Z` (1 to 9 fraction
  digits, an RFC 3339 profile), and is `null` exactly when `feedback` is null.
- `feedbackComment` (SDK 0.36.0, optional): the comment the user wrote with that feedback, at
  most `CHAT_TURN_RECORDS_MAX_FEEDBACK_COMMENT_LENGTH` (2000) Unicode code points and never
  empty. It is `null` when the feedback has no comment and always `null` when `feedback` is
  `null`. Hosts that do not supply comments omit the field; treat a missing field like `null`.

Unknown, deleted, and other plugins' turns are omitted, and the omission does not say which.
Records are presentation data. Never use them for authorization, and never write them to plugin
storage, logs, or audit metadata.

Request and result shapes are published as JSON Schemas
(`@opsrabbit/plugin-sdk/chat-turn-records-request-schema` and
`@opsrabbit/plugin-sdk/chat-turn-records-result-schema`). `validateChatTurnRecordsResult` also
checks what JSON Schema cannot: membership in the request, request order, and real calendar
instants.

## Errors

`getTurns` rejects with an error carrying an HTTP-style `status`
(`CHAT_TURN_RECORDS_ERROR_STATUS`):

| Status | Meaning                                                 |
| ------ | ------------------------------------------------------- |
| 400    | The request is invalid. This is a plugin bug.           |
| 429    | The per-invocation read limit is exhausted.             |
| 500    | The host produced a result that violates this contract. |

A plugin route should show a "not available" placeholder for the affected rows rather than fail
the whole table.

## Host responsibilities

A host:

- MUST return only turns that this plugin admitted through `chatTurnAdmission`. Record the
  admission in the turn's own transaction and delete the record with the turn. Turns admitted by
  other plugins, or never admitted, are omitted exactly like unknown ids.
- MUST supply the broker only to revalidated deployment administrators, in `requiredRole:
"admin"` workspace route calls of an enabled plugin that declares the capability.
- MUST validate requests with `validateChatTurnRecordsRequest` and self-check results with
  `validateChatTurnRecordsResult` before returning them.
- MUST return only the turn's canonical question, the feedback on its assistant answer, and the
  optional comment written with that feedback. It never returns assistant output, thinking,
  attachments, usage, or other metadata. A comment is user-written content, so it is subject to
  the same no-storage, no-logging, and no-audit rules as the question.
- MUST durably audit every successful read with the plugin id and turn counts, never content.
  Rejected requests (400, 429) return no content and need no read audit. The
  audit must commit before the content is returned and must not roll back if the route later
  fails. Its event type must be one that plugin-authored audit cannot produce.
- MUST enforce the per-invocation read limit and fail closed. An unavailable broker or an invalid
  request is an error, not an empty result.
