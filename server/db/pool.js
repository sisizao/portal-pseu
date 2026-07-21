const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("[PSEU DB] DATABASE_URL nao definido. Configure o .env antes de usar rotas com banco.");
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  if (typeof work !== "function") {
    throw new TypeError("withTransaction requires a callback function");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[PSEU DB] Falha ao reverter transacao:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
};
