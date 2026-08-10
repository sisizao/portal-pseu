const { query: databaseQuery } = require("../db/pool");
const {
  TelemetryValidationError,
  validateBehavioralSession,
} = require("./telemetry-contract.service");
const { TelemetryIngestionError } = require("./telemetry-ingestion.service");

function publicSession(row, created) {
  return {
    created,
    session: {
      session_id: row.id,
      started_at: new Date(row.started_at).toISOString(),
      last_seen_at: new Date(row.last_seen_at).toISOString(),
    },
  };
}

function createTelemetrySessionService({ query = databaseQuery } = {}) {
  if (typeof query !== "function") {
    throw new TypeError("query must be a function");
  }

  async function createBehavioralSession(payload) {
    try {
      const session = validateBehavioralSession(payload);
      const insertResult = await query(
        `INSERT INTO behavioral_sessions (
          id,
          anonymous_id,
          user_id,
          entry_path,
          entry_source,
          device_class,
          consent_state
        )
        VALUES ($1::uuid, $2::uuid, NULL, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
        RETURNING id, anonymous_id, started_at, last_seen_at`,
        [
          session.id,
          session.anonymousId,
          session.entryPath,
          session.entrySource,
          session.deviceClass,
          session.consentState,
        ]
      );

      if (insertResult.rowCount === 1) {
        return publicSession(insertResult.rows[0], true);
      }

      const existingResult = await query(
        `SELECT id, anonymous_id, started_at, last_seen_at
           FROM behavioral_sessions
          WHERE id = $1::uuid
          LIMIT 1`,
        [session.id]
      );
      const existing = existingResult.rows[0];
      if (!existing || String(existing.anonymous_id) !== session.anonymousId) {
        throw new TelemetryIngestionError("behavioral_session_conflict", 409);
      }

      const touchResult = await query(
        `UPDATE behavioral_sessions
            SET last_seen_at = NOW()
          WHERE id = $1::uuid
          RETURNING id, anonymous_id, started_at, last_seen_at`,
        [session.id]
      );

      return publicSession(touchResult.rows[0], false);
    } catch (error) {
      if (error instanceof TelemetryValidationError || error instanceof TelemetryIngestionError) {
        throw error;
      }
      throw new TelemetryIngestionError("telemetry_unavailable", 503);
    }
  }

  return { createBehavioralSession };
}

const defaultService = createTelemetrySessionService();

module.exports = {
  createBehavioralSession: defaultService.createBehavioralSession,
  createTelemetrySessionService,
};
