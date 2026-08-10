const { query, withTransaction } = require("../db/pool");

const ALLOWED_CHECKPOINT_KEYS = new Set([
  "current_page",
  "furthest_page",
  "total_pages",
  "progress_percent",
  "expected_revision",
  "reason",
]);
const CHECKPOINT_REASONS = new Set([
  "progress",
  "opened",
  "resumed",
  "document-switch",
  "reader-close",
  "visibility",
  "max-interval",
  "completed",
]);

class ReadingProgressError extends Error {
  constructor(code, status = 400, details = null) {
    super(code);
    this.name = "ReadingProgressError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function calculateProgressPercent(furthestPage, totalPages) {
  if (totalPages <= 1) return 100;
  return Math.max(0, Math.min(100, Math.round(((furthestPage - 1) / (totalPages - 1)) * 100)));
}

function requireInteger(value, field, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ReadingProgressError(`invalid_${field}`);
  }
  return value;
}

function validateCheckpointPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ReadingProgressError("invalid_progress_payload");
  }
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 4096) {
    throw new ReadingProgressError("progress_payload_too_large", 413);
  }

  const keys = Object.keys(payload);
  const unknownKeys = keys.filter((key) => !ALLOWED_CHECKPOINT_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new ReadingProgressError("unexpected_progress_fields", 400, { fields: unknownKeys });
  }

  const currentPage = requireInteger(payload.current_page, "current_page", 1, 100000);
  const furthestPage = requireInteger(payload.furthest_page, "furthest_page", 1, 100000);
  const totalPages = requireInteger(payload.total_pages, "total_pages", 1, 100000);
  const progressPercent = requireInteger(payload.progress_percent, "progress_percent", 0, 100);
  const expectedRevision = requireInteger(payload.expected_revision, "expected_revision", 0, Number.MAX_SAFE_INTEGER);
  const reason = typeof payload.reason === "string" ? payload.reason : "progress";

  if (!CHECKPOINT_REASONS.has(reason)) {
    throw new ReadingProgressError("invalid_progress_reason");
  }
  if (currentPage > totalPages || furthestPage > totalPages || furthestPage < currentPage) {
    throw new ReadingProgressError("invalid_progress_pages");
  }

  const expectedPercent = calculateProgressPercent(furthestPage, totalPages);
  if (progressPercent !== expectedPercent) {
    throw new ReadingProgressError("invalid_progress_percent", 400, {
      expected: expectedPercent,
    });
  }

  return {
    currentPage,
    furthestPage,
    totalPages,
    progressPercent,
    expectedRevision,
    reason,
  };
}

function serializeProgressRow(row) {
  if (!row) return null;
  return {
    book_id: row.book_id,
    document_id: row.document_id,
    current_page: Number(row.current_page),
    furthest_page: Number(row.furthest_page),
    total_pages: Number(row.total_pages),
    progress_percent: Number(row.progress_percent),
    status: row.status,
    last_activity_at: row.last_activity_at,
    last_resumed_at: row.last_resumed_at,
    completed_at: row.completed_at,
    resume_count: Number(row.resume_count),
    revision: Number(row.revision),
    updated_at: row.updated_at,
  };
}

function createReadingProgressService(dependencies = {}) {
  const runQuery = dependencies.query || query;
  const runTransaction = dependencies.withTransaction || withTransaction;

  async function listForUser(userId) {
    const result = await runQuery(
      `SELECT rp.*
       FROM reading_progress rp
       WHERE rp.user_id = $1
         AND EXISTS (
           SELECT 1
           FROM entitlements e
           WHERE e.user_id = rp.user_id
             AND e.book_id = rp.book_id
             AND e.status = 'active'
         )
       ORDER BY rp.updated_at DESC`,
      [userId]
    );
    return result.rows.map(serializeProgressRow);
  }

  async function updateCheckpoint({ userId, bookId, documentId, payload }) {
    const checkpoint = validateCheckpointPayload(payload);

    return runTransaction(async (client) => {
      const existingResult = await client.query(
        `SELECT *
         FROM reading_progress
         WHERE user_id = $1 AND book_id = $2 AND document_id = $3
         FOR UPDATE`,
        [userId, bookId, documentId]
      );
      const existing = existingResult.rows[0] || null;

      if (!existing && checkpoint.expectedRevision !== 0) {
        throw new ReadingProgressError("stale_progress_revision", 409, { current: null });
      }
      if (existing && Number(existing.revision) !== checkpoint.expectedRevision) {
        throw new ReadingProgressError("stale_progress_revision", 409, {
          current: serializeProgressRow(existing),
        });
      }
      if (existing && Number(existing.total_pages) !== checkpoint.totalPages) {
        throw new ReadingProgressError("progress_total_pages_conflict", 409, {
          current: serializeProgressRow(existing),
        });
      }

      const furthestPage = Math.max(Number(existing?.furthest_page || 1), checkpoint.furthestPage);
      const progressPercent = calculateProgressPercent(furthestPage, checkpoint.totalPages);
      const wasCompleted = existing?.status === "completed";
      const isCompleted = wasCompleted || furthestPage >= checkpoint.totalPages || progressPercent === 100;
      const status = isCompleted ? "completed" : furthestPage > 1 ? "reading" : "started";
      const isResume = checkpoint.reason === "resumed" && Boolean(existing) && Number(existing.furthest_page) > 1;
      const revision = Number(existing?.revision || 0) + 1;

      const result = existing
        ? await client.query(
            `UPDATE reading_progress
             SET current_page = $4,
                 furthest_page = $5,
                 progress_percent = $6,
                 status = $7,
                 last_activity_at = NOW(),
                 last_resumed_at = CASE WHEN $8 THEN NOW() ELSE last_resumed_at END,
                 completed_at = CASE
                   WHEN completed_at IS NOT NULL THEN completed_at
                   WHEN $9 THEN NOW()
                   ELSE NULL
                 END,
                 resume_count = resume_count + CASE WHEN $8 THEN 1 ELSE 0 END,
                 revision = $10,
                 updated_at = NOW()
             WHERE user_id = $1 AND book_id = $2 AND document_id = $3
             RETURNING *`,
            [
              userId,
              bookId,
              documentId,
              checkpoint.currentPage,
              furthestPage,
              progressPercent,
              status,
              isResume,
              isCompleted,
              revision,
            ]
          )
        : await client.query(
            `INSERT INTO reading_progress (
               user_id, book_id, document_id, current_page, furthest_page,
               total_pages, progress_percent, status, completed_at, revision
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $9 THEN NOW() ELSE NULL END, $10)
             RETURNING *`,
            [
              userId,
              bookId,
              documentId,
              checkpoint.currentPage,
              furthestPage,
              checkpoint.totalPages,
              progressPercent,
              status,
              isCompleted,
              revision,
            ]
          );

      const row = result.rows[0];
      return {
        progress: serializeProgressRow(row),
        previous: serializeProgressRow(existing),
        reason: checkpoint.reason,
        transition: {
          resumed: isResume,
          newlyCompleted: !wasCompleted && isCompleted,
        },
      };
    });
  }

  return {
    listForUser,
    updateCheckpoint,
  };
}

module.exports = {
  ReadingProgressError,
  calculateProgressPercent,
  createReadingProgressService,
  serializeProgressRow,
  validateCheckpointPayload,
};
