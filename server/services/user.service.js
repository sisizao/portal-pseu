const bcrypt = require("bcryptjs");
const { query } = require("../db/pool");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const result = await query(
    "SELECT id, email, password_hash, status, created_at, last_login_at FROM users WHERE LOWER(email) = $1 LIMIT 1",
    [normalized]
  );

  return result.rows[0] || null;
}

async function findUserById(userId) {
  if (!userId) return null;

  const result = await query(
    "SELECT id, email, status, created_at, last_login_at FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );

  return result.rows[0] || null;
}

async function hasActivePurchase(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const result = await query(
    `SELECT 1
     FROM gumroad_sales
     WHERE LOWER(email) = $1
       AND status = 'active'
     LIMIT 1`,
    [normalized]
  );

  return result.rowCount > 0;
}

async function createOrClaimUser(email, password) {
  const normalized = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(String(password), 12);
  const existing = await findUserByEmail(normalized);

  if (existing?.password_hash) {
    const error = new Error("access_already_claimed");
    error.code = "access_already_claimed";
    throw error;
  }

  if (existing) {
    const result = await query(
      `UPDATE users
       SET password_hash = $2, status = 'active'
       WHERE id = $1
       RETURNING id, email, status, created_at, last_login_at`,
      [existing.id, passwordHash]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO users (email, password_hash, status)
     VALUES ($1, $2, 'active')
     RETURNING id, email, status, created_at, last_login_at`,
    [normalized, passwordHash]
  );

  return result.rows[0];
}

async function ensurePurchasedUser(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const existing = await findUserByEmail(normalized);
  if (existing) {
    const result = await query(
      `UPDATE users
       SET status = 'active'
       WHERE id = $1
       RETURNING id, email, status, created_at, last_login_at`,
      [existing.id]
    );
    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO users (email, password_hash, status)
     VALUES ($1, NULL, 'active')
     RETURNING id, email, status, created_at, last_login_at`,
    [normalized]
  );

  return result.rows[0];
}

async function suspendUserIfNoActivePurchase(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const stillActive = await hasActivePurchase(normalized);
  if (stillActive) return null;

  const result = await query(
    `UPDATE users
     SET status = 'suspended'
     WHERE LOWER(email) = $1
     RETURNING id, email, status, created_at, last_login_at`,
    [normalized]
  );

  return result.rows[0] || null;
}

async function verifyPassword(user, password) {
  if (!user?.password_hash || !password) return false;
  return bcrypt.compare(String(password), user.password_hash);
}

async function touchLastLogin(userId) {
  await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [userId]);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  };
}

module.exports = {
  createOrClaimUser,
  ensurePurchasedUser,
  findUserByEmail,
  findUserById,
  hasActivePurchase,
  normalizeEmail,
  publicUser,
  suspendUserIfNoActivePurchase,
  touchLastLogin,
  verifyPassword,
};
