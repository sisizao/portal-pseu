const { query: databaseQuery } = require("../db/pool");
const {
  TelemetryValidationError,
  validateTelemetryEvent,
} = require("./telemetry-contract.service");

class TelemetryIngestionError extends Error {
  constructor(code, status = 500) {
    super(code);
    this.name = "TelemetryIngestionError";
    this.code = code;
    this.status = status;
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeDatabaseTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sameNullable(left, right) {
  return (left == null ? null : String(left)) === (right == null ? null : String(right));
}

function isSameEvent(existing, event, userId) {
  return (
    sameNullable(existing.session_id, event.sessionId) &&
    sameNullable(existing.user_id, userId) &&
    existing.event_name === event.eventName &&
    Number(existing.event_version) === event.eventVersion &&
    existing.source === event.source &&
    normalizeDatabaseTimestamp(existing.occurred_at) === event.occurredAt &&
    sameNullable(existing.section_id, event.sectionId) &&
    sameNullable(existing.book_id, event.bookId) &&
    sameNullable(existing.document_id, event.documentId) &&
    sameNullable(existing.correlation_id, event.correlationId) &&
    sameNullable(existing.dedupe_key, event.dedupeKey) &&
    stableJson(existing.properties || {}) === stableJson(event.properties)
  );
}

function normalizeTrustedUserId(value) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TelemetryIngestionError("invalid_trusted_user_id", 500);
  }
  return value;
}

function publicEvent(row) {
  return {
    event_id: row.id,
    event_name: row.event_name,
    event_version: Number(row.event_version),
    occurred_at: normalizeDatabaseTimestamp(row.occurred_at),
    received_at: normalizeDatabaseTimestamp(row.received_at),
  };
}

function createTelemetryIngestionService({ query = databaseQuery } = {}) {
  if (typeof query !== "function") {
    throw new TypeError("query must be a function");
  }

  async function ingestEvent(payload, { authenticatedUserId = null, source = "web" } = {}) {
    try {
      const event = validateTelemetryEvent(payload, { source });
      const userId = normalizeTrustedUserId(authenticatedUserId);

      const sessionResult = await query(
        `UPDATE behavioral_sessions
            SET last_seen_at = NOW()
          WHERE id = $1::uuid
            AND ended_at IS NULL
          RETURNING id`,
        [event.sessionId]
      );
      if (sessionResult.rowCount !== 1) {
        throw new TelemetryIngestionError("behavioral_session_not_found", 422);
      }

      const insertResult = await query(
        `INSERT INTO events (
          id,
          session_id,
          user_id,
          event_name,
          event_version,
          source,
          occurred_at,
          section_id,
          book_id,
          document_id,
          correlation_id,
          dedupe_key,
          properties
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::bigint,
          $4,
          $5,
          $6,
          $7::timestamptz,
          $8,
          $9,
          $10,
          $11::uuid,
          $12,
          $13::jsonb
        )
        ON CONFLICT DO NOTHING
        RETURNING *`,
        [
          event.id,
          event.sessionId,
          userId,
          event.eventName,
          event.eventVersion,
          event.source,
          event.occurredAt,
          event.sectionId,
          event.bookId,
          event.documentId,
          event.correlationId,
          event.dedupeKey,
          JSON.stringify(event.properties),
        ]
      );

      if (insertResult.rowCount === 1) {
        return {
          created: true,
          duplicate: false,
          event: publicEvent(insertResult.rows[0]),
        };
      }

      const existingResult = await query(
        `SELECT *
           FROM events
          WHERE id = $1::uuid
             OR ($2::text IS NOT NULL AND dedupe_key = $2)
          ORDER BY CASE WHEN id = $1::uuid THEN 0 ELSE 1 END
          LIMIT 1`,
        [event.id, event.dedupeKey]
      );

      const existing = existingResult.rows[0];
      if (!existing) {
        throw new TelemetryIngestionError("event_conflict", 409);
      }
      if (!isSameEvent(existing, event, userId)) {
        const conflictCode = String(existing.id) === event.id
          ? "event_id_conflict"
          : "dedupe_key_conflict";
        throw new TelemetryIngestionError(conflictCode, 409);
      }

      return {
        created: false,
        duplicate: true,
        duplicate_reason: String(existing.id) === event.id ? "event_id" : "dedupe_key",
        event: publicEvent(existing),
      };
    } catch (error) {
      if (error instanceof TelemetryValidationError || error instanceof TelemetryIngestionError) {
        throw error;
      }
      if (error?.code === "23503") {
        throw new TelemetryIngestionError("behavioral_session_not_found", 422);
      }
      throw new TelemetryIngestionError("telemetry_unavailable", 503);
    }
  }

  return { ingestEvent };
}

const defaultService = createTelemetryIngestionService();

module.exports = {
  TelemetryIngestionError,
  createTelemetryIngestionService,
  ingestEvent: defaultService.ingestEvent,
};
