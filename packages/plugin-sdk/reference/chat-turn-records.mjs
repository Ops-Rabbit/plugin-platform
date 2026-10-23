import {
  CHAT_TURN_RECORDS_CALLS_PER_INVOCATION,
  CHAT_TURN_RECORDS_MAX_TURN_IDS,
  validateChatTurnRecordsResult,
} from "@opsrabbit/plugin-sdk";

/**
 * Executable reference for a deployment-admin route that shows the question and feedback for
 * turns the plugin admitted. Turn ids come from the plugin's own admission records; the text is
 * read on demand, shown once, and never stored, logged, or audited by the plugin.
 *
 * Returns the records found and the ids whose read failed (or exceeded the per-invocation read
 * limit), so the route can show "not available" for exactly those rows and still render the rest.
 */
export async function readChatTurnRecords(context, turnIds) {
  const records = new Map();
  const unique = [...new Set(turnIds)];
  if (typeof context.chatTurnRecords?.getTurns !== "function") {
    return { records, unavailable: new Set(unique) };
  }
  const unavailable = new Set();
  for (
    let batch = 0;
    batch * CHAT_TURN_RECORDS_MAX_TURN_IDS < unique.length;
    batch += 1
  ) {
    const ids = unique.slice(
      batch * CHAT_TURN_RECORDS_MAX_TURN_IDS,
      (batch + 1) * CHAT_TURN_RECORDS_MAX_TURN_IDS,
    );
    if (batch >= CHAT_TURN_RECORDS_CALLS_PER_INVOCATION) {
      for (const id of ids) unavailable.add(id);
      continue;
    }
    try {
      const request = { turnIds: ids };
      const result = await context.chatTurnRecords.getTurns(request);
      if (validateChatTurnRecordsResult(result, request).length > 0) {
        for (const id of ids) unavailable.add(id);
        continue;
      }
      for (const turn of result.turns) records.set(turn.turnId, turn);
    } catch {
      for (const id of ids) unavailable.add(id);
    }
  }
  return { records, unavailable };
}
