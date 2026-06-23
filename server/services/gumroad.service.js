const { query } = require("../db/pool");
const { normalizeEmail } = require("./user.service");

const DEV_PRODUCT_ID = "PSEU_PORTAL_DEV_PRODUCT";

function readEventName(payload = {}) {
  return String(
    payload.event_name
    || payload.resource_name
    || payload.resource
    || payload.event
    || "sale"
  ).toLowerCase();
}

function mapGumroadStatus(eventName) {
  const event = String(eventName || "").toLowerCase();

  if (event.includes("dispute_won")) return "active";
  if (event.includes("refund")) return "refunded";
  if (event.includes("dispute")) return "disputed";
  if (event.includes("cancel")) return "cancelled";
  return "active";
}

function getProductId(payload = {}) {
  return String(
    payload.product_id
    || payload.product_permalink
    || payload.permalink
    || payload.product_permalink_id
    || ""
  ).trim();
}

function getSaleId(payload = {}) {
  return String(
    payload.sale_id
    || payload.id
    || payload.order_id
    || ""
  ).trim();
}

function getBuyerEmail(payload = {}) {
  return normalizeEmail(payload.email || payload.purchaser_email || payload.buyer_email || "");
}

function isExpectedProduct(productId) {
  const expected = process.env.GUMROAD_PRODUCT_ID;
  if (!expected && process.env.NODE_ENV !== "production") {
    return String(productId || "") === DEV_PRODUCT_ID;
  }
  if (!expected) return false;
  return String(productId || "") === String(expected);
}

function verifyWebhookSecret(req) {
  const expected = process.env.GUMROAD_WEBHOOK_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "missing_webhook_secret_config" };
    }
    console.warn("[PSEU GUMROAD] GUMROAD_WEBHOOK_SECRET ausente. Webhook aceito apenas como modo dev.");
    return { ok: true, mode: "dev-no-secret" };
  }

  const received = req.get("x-pseu-webhook-secret")
    || req.query?.secret
    || req.body?.webhook_secret;

  return received === expected
    ? { ok: true, mode: "secret-match" }
    : { ok: false, reason: "invalid_webhook_secret" };
}

async function verifySaleWithGumroad(payload) {
  const accessToken = process.env.GUMROAD_ACCESS_TOKEN;
  const saleId = getSaleId(payload);

  if (!accessToken) {
    console.warn("[PSEU GUMROAD] GUMROAD_ACCESS_TOKEN ausente. Validacao real da venda pendente.");
    return { configured: false, verified: false, skipped: true };
  }

  if (!saleId || typeof fetch !== "function") {
    return { configured: true, verified: false, skipped: true, reason: "missing_sale_id_or_fetch" };
  }

  const url = `https://api.gumroad.com/v2/sales/${encodeURIComponent(saleId)}?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url);
  if (!response.ok) {
    return { configured: true, verified: false, status: response.status };
  }

  const data = await response.json();
  const sale = data.sale || data;
  const verified = Boolean(data.success !== false && sale);

  return {
    configured: true,
    verified,
    sale,
  };
}

async function upsertGumroadSale({ saleId, productId, email, status, payload }) {
  const normalized = normalizeEmail(email);

  const result = await query(
    `INSERT INTO gumroad_sales (sale_id, product_id, email, status, raw_payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (sale_id) DO UPDATE
     SET
       product_id = EXCLUDED.product_id,
       email = EXCLUDED.email,
       status = EXCLUDED.status,
       raw_payload = EXCLUDED.raw_payload,
       updated_at = NOW()
     RETURNING id, sale_id, product_id, email, status, created_at, updated_at`,
    [saleId, productId, normalized, status, JSON.stringify(payload || {})]
  );

  return result.rows[0];
}

module.exports = {
  getBuyerEmail,
  getProductId,
  getSaleId,
  isExpectedProduct,
  mapGumroadStatus,
  readEventName,
  upsertGumroadSale,
  verifySaleWithGumroad,
  verifyWebhookSecret,
};
