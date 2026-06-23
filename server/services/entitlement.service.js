const { query } = require("../db/pool");
const { listBookCatalog } = require("./book-catalog.service");

const CURRENT_RELEASE_BOOK_IDS = Object.freeze([
  "manual-do-despertar",
  "manual-do-lider-estoico",
]);

function listPortalEntitlementBookIds() {
  return [...CURRENT_RELEASE_BOOK_IDS];
}

function listPortalCatalogBookIds() {
  return listBookCatalog().map((book) => book.bookId);
}

async function listActiveEntitlements(userId) {
  const result = await query(
    "SELECT book_id, status, source, created_at FROM entitlements WHERE user_id = $1 AND status = 'active' ORDER BY created_at ASC",
    [userId]
  );

  return result.rows.map((row) => ({
    bookId: row.book_id,
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
  }));
}

async function hasBookAccess(userId, bookId) {
  const result = await query(
    "SELECT 1 FROM entitlements WHERE user_id = $1 AND book_id = $2 AND status = 'active' LIMIT 1",
    [userId, bookId]
  );

  return result.rowCount > 0;
}

async function ensureInitialEntitlements(userId, source = "claim") {
  const created = [];

  for (const bookId of listPortalEntitlementBookIds()) {
    await query(
      `INSERT INTO entitlements (user_id, book_id, status, source)
       VALUES ($1, $2, 'active', $3)
       ON CONFLICT (user_id, book_id) DO UPDATE
       SET status = 'active', source = EXCLUDED.source`,
      [userId, bookId, source]
    );
    created.push(bookId);
  }

  return created;
}

async function revokeInitialEntitlements(userId) {
  if (!userId) return [];

  const result = await query(
    `UPDATE entitlements
     SET status = 'revoked'
     WHERE user_id = $1
       AND book_id = ANY($2::text[])
     RETURNING book_id`,
    [userId, listPortalCatalogBookIds()]
  );

  return result.rows.map((row) => row.book_id);
}

module.exports = {
  CURRENT_RELEASE_BOOK_IDS,
  ensureInitialEntitlements,
  hasBookAccess,
  listPortalEntitlementBookIds,
  listActiveEntitlements,
  revokeInitialEntitlements,
};
