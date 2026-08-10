const { query: databaseQuery } = require("../db/pool");

const BEHAVIORAL_SESSION_HEADER = "x-pseu-behavioral-session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class TelemetryLinkError extends Error {
  constructor(code, status = 500) {
    super(code);
    this.name = "TelemetryLinkError";
    this.code = code;
    this.status = status;
  }
}

function normalizeSessionId(value) {
  if (typeof value !== "string") {
    throw new TelemetryLinkError("invalid_behavioral_session_id", 400);
  }
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new TelemetryLinkError("invalid_behavioral_session_id", 400);
  }
  return normalized;
}

function normalizeTrustedUserId(value) {
  const normalized = String(value == null ? "" : value).trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new TelemetryLinkError("invalid_trusted_user_id", 500);
  }
  return normalized;
}

function createTelemetryLinkService({ query = databaseQuery } = {}) {
  if (typeof query !== "function") {
    throw new TypeError("query must be a function");
  }

  async function linkBehavioralSessionToUser(sessionIdValue, trustedUserIdValue) {
    const sessionId = normalizeSessionId(sessionIdValue);
    const trustedUserId = normalizeTrustedUserId(trustedUserIdValue);

    try {
      const linked = await query(
        `UPDATE behavioral_sessions
            SET user_id = $2::bigint,
                linked_at = COALESCE(linked_at, NOW())
          WHERE id = $1::uuid
            AND ended_at IS NULL
            AND started_at <= NOW() + INTERVAL '5 minutes'
            AND last_seen_at >= started_at
            AND last_seen_at <= NOW() + INTERVAL '5 minutes'
            AND last_seen_at >= NOW() - INTERVAL '35 minutes'
            AND (user_id IS NULL OR user_id = $2::bigint)
          RETURNING id, user_id, linked_at`,
        [sessionId, trustedUserId]
      );

      if (linked.rowCount === 1) {
        return {
          linked: true,
          sessionId: String(linked.rows[0].id),
          userId: String(linked.rows[0].user_id),
          linkedAt: new Date(linked.rows[0].linked_at).toISOString(),
        };
      }

      const inspected = await query(
        `SELECT id, user_id, started_at, last_seen_at, ended_at
           FROM behavioral_sessions
          WHERE id = $1::uuid
          LIMIT 1`,
        [sessionId]
      );
      const existing = inspected.rows[0];

      if (!existing) {
        throw new TelemetryLinkError("behavioral_session_not_found", 404);
      }
      if (existing.user_id != null && String(existing.user_id) !== trustedUserId) {
        throw new TelemetryLinkError("behavioral_session_link_conflict", 409);
      }

      const now = Date.now();
      const startedAt = new Date(existing.started_at).getTime();
      const lastSeenAt = new Date(existing.last_seen_at).getTime();
      const temporallyCoherent = Number.isFinite(startedAt)
        && Number.isFinite(lastSeenAt)
        && startedAt <= now + (5 * 60 * 1000)
        && lastSeenAt >= startedAt
        && lastSeenAt <= now + (5 * 60 * 1000)
        && lastSeenAt >= now - (35 * 60 * 1000);

      if (existing.ended_at || !temporallyCoherent) {
        throw new TelemetryLinkError("behavioral_session_inactive", 422);
      }

      throw new TelemetryLinkError("behavioral_session_link_unavailable", 503);
    } catch (error) {
      if (error instanceof TelemetryLinkError) throw error;
      throw new TelemetryLinkError("telemetry_link_unavailable", 503);
    }
  }

  return { linkBehavioralSessionToUser };
}

const defaultService = createTelemetryLinkService();

async function associateBehavioralSessionAfterAuth(
  req,
  trustedUserId,
  { linkBehavioralSessionToUser = defaultService.linkBehavioralSessionToUser } = {}
) {
  const sessionId = req?.get?.(BEHAVIORAL_SESSION_HEADER);
  if (!sessionId) return { linked: false, reason: "not_provided" };

  try {
    return await linkBehavioralSessionToUser(sessionId, trustedUserId);
  } catch (error) {
    console.warn("[PSEU TELEMETRY] Associação pós-autenticação isolada", {
      code: error?.code || "telemetry_link_unavailable",
    });
    return { linked: false, reason: error?.code || "telemetry_link_unavailable" };
  }
}

module.exports = {
  BEHAVIORAL_SESSION_HEADER,
  TelemetryLinkError,
  associateBehavioralSessionAfterAuth,
  createTelemetryLinkService,
  linkBehavioralSessionToUser: defaultService.linkBehavioralSessionToUser,
};
