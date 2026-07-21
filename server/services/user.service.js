const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query } = require("../db/pool");

const passwordResetTtlMs = 60 * 60 * 1000;

function executeQuery(client, text, params) {
  return client ? client.query(text, params) : query(text, params);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function findUserByEmail(email, client) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const result = await executeQuery(
    client,
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

async function hasActivePurchase(email, client) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const result = await executeQuery(
    client,
    `SELECT 1
     FROM gumroad_sales
     WHERE LOWER(email) = $1
       AND status = 'active'
     LIMIT 1`,
    [normalized]
  );

  return result.rowCount > 0;
}

async function createOrClaimUser(email, password, client) {
  const normalized = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(String(password), 12);
  const db = client || null;

  const inserted = await executeQuery(
    db,
    `INSERT INTO users (email, password_hash, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, status, created_at, last_login_at`,
    [normalized, passwordHash]
  );

  if (inserted.rows[0]) {
    return inserted.rows[0];
  }

  const existingResult = await executeQuery(
    db,
    `SELECT id, email, password_hash, status, created_at, last_login_at
     FROM users
     WHERE LOWER(email) = $1
     LIMIT 1
     ${db ? "FOR UPDATE" : ""}`,
    [normalized]
  );
  const existing = existingResult.rows[0] || null;

  if (existing?.password_hash) {
    const error = new Error("access_already_claimed");
    error.code = "access_already_claimed";
    throw error;
  }

  if (existing) {
    const result = await executeQuery(
      db,
      `UPDATE users
       SET password_hash = $2, status = 'active'
       WHERE id = $1
         AND password_hash IS NULL
       RETURNING id, email, status, created_at, last_login_at`,
      [existing.id, passwordHash]
    );

    if (result.rows[0]) {
      return result.rows[0];
    }
  }

  const error = new Error("access_already_claimed");
  error.code = "access_already_claimed";
  throw error;
}

function createPasswordResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashPasswordResetToken(token) {
  const value = String(token || "").trim();
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function createPasswordResetRequest(email) {
  const user = await findUserByEmail(email);
  if (!user || user.status !== "active" || !user.password_hash) {
    return null;
  }

  const token = createPasswordResetToken();
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = new Date(Date.now() + passwordResetTtlMs);
  const normalized = normalizeEmail(user.email);

  await query(
    `UPDATE access_tokens
     SET used_at = NOW()
     WHERE LOWER(email) = $1
       AND purpose = 'password_reset'
       AND used_at IS NULL`,
    [normalized]
  );

  await query(
    `INSERT INTO access_tokens (email, token_hash, purpose, expires_at)
     VALUES ($1, $2, 'password_reset', $3)`,
    [user.email, tokenHash, expiresAt]
  );

  return {
    token,
    expiresAt,
    user: publicUser(user),
  };
}

async function findUserByPasswordResetToken(token) {
  const tokenHash = hashPasswordResetToken(token);
  if (!tokenHash) return null;

  const result = await query(
    `SELECT users.id, users.email, users.status, users.created_at, users.last_login_at, access_tokens.expires_at
     FROM access_tokens
     INNER JOIN users ON LOWER(users.email) = LOWER(access_tokens.email)
     WHERE access_tokens.token_hash = $1
       AND access_tokens.purpose = 'password_reset'
       AND access_tokens.used_at IS NULL
       AND access_tokens.expires_at > NOW()
       AND users.status = 'active'
     LIMIT 1`,
    [tokenHash]
  );

  return result.rows[0] || null;
}

async function inspectPasswordResetToken(token) {
  const tokenHash = hashPasswordResetToken(token);
  if (!tokenHash) {
    return { status: "missing_token" };
  }

  const result = await query(
    `SELECT access_tokens.email,
            access_tokens.expires_at,
            access_tokens.used_at,
            users.id AS user_id,
            users.status AS user_status
     FROM access_tokens
     LEFT JOIN users ON LOWER(users.email) = LOWER(access_tokens.email)
     WHERE access_tokens.token_hash = $1
       AND access_tokens.purpose = 'password_reset'
     LIMIT 1`,
    [tokenHash]
  );

  const tokenInfo = {
    tokenHashPrefix: tokenHash.slice(0, 12),
  };

  const row = result.rows[0];
  if (!row) {
    return { ...tokenInfo, status: "token_not_found" };
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const expired = expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
  const details = {
    ...tokenInfo,
    email: row.email,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    userStatus: row.user_status || null,
  };

  if (expired) {
    return { ...details, status: "token_expired" };
  }

  if (row.used_at) {
    return { ...details, status: "token_used" };
  }

  if (!row.user_id) {
    return { ...details, status: "user_not_found" };
  }

  if (row.user_status !== "active") {
    return { ...details, status: "user_not_active" };
  }

  return { ...details, status: "valid" };
}

async function resetPasswordWithToken(token, password) {
  const tokenHash = hashPasswordResetToken(token);
  if (!tokenHash) return null;

  const passwordHash = await bcrypt.hash(String(password), 12);
  const result = await query(
    `WITH consumed_token AS (
       UPDATE access_tokens
       SET used_at = NOW()
       WHERE token_hash = $1
         AND purpose = 'password_reset'
         AND used_at IS NULL
         AND expires_at > NOW()
       RETURNING email
     )
     UPDATE users
     SET password_hash = $2,
         status = 'active'
     FROM consumed_token
     WHERE LOWER(users.email) = LOWER(consumed_token.email)
       AND users.status = 'active'
     RETURNING users.id, users.email, users.status, users.created_at, users.last_login_at`,
    [tokenHash, passwordHash]
  );

  return result.rows[0] || null;
}

async function clearExpiredPasswordResetTokens() {
  await query(
    `UPDATE access_tokens
     SET used_at = COALESCE(used_at, NOW())
     WHERE purpose = 'password_reset'
       AND expires_at <= NOW()
       AND used_at IS NULL`
  );
}

async function ensurePurchasedUser(email, client) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const result = await executeQuery(
    client,
    `INSERT INTO users (email, password_hash, status)
     VALUES ($1, NULL, 'active')
     ON CONFLICT (email) DO UPDATE
     SET status = 'active'
     RETURNING id, email, status, created_at, last_login_at`,
    [normalized]
  );

  return result.rows[0];
}

async function suspendUserIfNoActivePurchase(email, client) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const stillActive = await hasActivePurchase(normalized, client);
  if (stillActive) return null;

  const result = await executeQuery(
    client,
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
  clearExpiredPasswordResetTokens,
  createOrClaimUser,
  createPasswordResetRequest,
  ensurePurchasedUser,
  findUserByEmail,
  findUserById,
  findUserByPasswordResetToken,
  hasActivePurchase,
  inspectPasswordResetToken,
  normalizeEmail,
  publicUser,
  resetPasswordWithToken,
  suspendUserIfNoActivePurchase,
  touchLastLogin,
  verifyPassword,
};
