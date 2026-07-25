const { query } = require("../db/pool");
const { normalizeEmail } = require("./user.service");

const DEV_PRODUCT_ID = "PSEU_PORTAL_DEV_PRODUCT";
const NON_ACTIVE_STATUSES = new Set(["refunded", "disputed", "cancelled", "revoked"]);

function executeQuery(client, text, params) {
  return client ? client.query(text, params) : query(text, params);
}

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

function canReactivateSale(eventName) {
  return String(eventName || "").toLowerCase().includes("dispute_won");
}

function getProductId(payload = {}) {
  return getProductCandidates(payload)[0] || "";
}

function getProductCandidates(payload = {}) {
  const values = [
    payload.product_id,
    payload.product_permalink,
    payload.permalink,
    payload.product_permalink_id,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return [...new Set(values)];
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

function isExpectedProduct(product) {
  const expected = process.env.GUMROAD_PRODUCT_ID;
  const candidates = typeof product === "object"
    ? getProductCandidates(product)
    : [String(product || "").trim()].filter(Boolean);

  if (!expected && process.env.NODE_ENV !== "production") {
    return candidates.includes(DEV_PRODUCT_ID);
  }
  if (!expected) return false;
  return candidates.includes(String(expected));
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
  const payloadEmail = getBuyerEmail(payload);
  const payloadProductId = getProductId(payload);

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
  const sale = data.sale || data.purchase || data;
  const saleIdFromApi = getSaleId(sale);
  const emailFromApi = getBuyerEmail(sale);
  const productCandidatesFromApi = getProductCandidates(sale);
  const saleHasVerificationFields = Boolean(saleIdFromApi || emailFromApi || productCandidatesFromApi.length);
  const saleMatchesWebhook = !saleIdFromApi || saleIdFromApi === saleId;
  const emailMatchesWebhook = !emailFromApi || emailFromApi === payloadEmail;
  const productMatchesWebhook = !productCandidatesFromApi.length
    || productCandidatesFromApi.includes(payloadProductId)
    || isExpectedProduct(sale);
  const verified = Boolean(
    data.success !== false
    && sale
    && saleHasVerificationFields
    && saleMatchesWebhook
    && emailMatchesWebhook
    && productMatchesWebhook
  );

  return {
    configured: true,
    verified,
    skipped: false,
    reason: verified ? undefined : saleHasVerificationFields ? "sale_mismatch" : "sale_missing_fields",
    checks: {
      fields: saleHasVerificationFields,
      saleId: saleMatchesWebhook,
      email: emailMatchesWebhook,
      product: productMatchesWebhook,
    },
    sale,
  };
}

async function upsertGumroadSale({ saleId, productId, email, status, payload, eventName }, client) {
  const normalized = normalizeEmail(email);
  const shouldReactivate = canReactivateSale(eventName || payload?.pseu_event_name);

  const result = await executeQuery(
    client,
    `INSERT INTO gumroad_sales (sale_id, product_id, email, status, raw_payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (sale_id) DO UPDATE
     SET
       product_id = EXCLUDED.product_id,
       email = EXCLUDED.email,
       status = CASE
         WHEN gumroad_sales.status = ANY($6::text[])
           AND EXCLUDED.status = 'active'
           AND $7::boolean IS NOT TRUE
         THEN gumroad_sales.status
         ELSE EXCLUDED.status
       END,
      raw_payload = CASE
        WHEN gumroad_sales.status = ANY($6::text[])
          AND EXCLUDED.status = 'active'
          AND $7::boolean IS NOT TRUE
        THEN gumroad_sales.raw_payload
        WHEN gumroad_sales.raw_payload ? 'pseu_access_email'
        THEN EXCLUDED.raw_payload || jsonb_build_object('pseu_access_email', gumroad_sales.raw_payload->'pseu_access_email')
        ELSE EXCLUDED.raw_payload
      END,
       updated_at = NOW()
     RETURNING id, sale_id, product_id, email, status, created_at, updated_at`,
    [saleId, productId, normalized, status, JSON.stringify(payload || {}), [...NON_ACTIVE_STATUSES], shouldReactivate]
  );

  return result.rows[0];
}

async function claimPurchaseAccessEmail(saleId, client) {
  const normalizedSaleId = String(saleId || "").trim();
  if (!normalizedSaleId) return false;

  const result = await executeQuery(
    client,
    `UPDATE gumroad_sales
     SET raw_payload = jsonb_set(
           COALESCE(raw_payload, '{}'::jsonb),
           '{pseu_access_email}',
           $2::jsonb,
           true
         ),
         updated_at = NOW()
     WHERE sale_id = $1
       AND COALESCE(raw_payload->'pseu_access_email'->>'status', 'pending') IN ('pending', 'failed')
     RETURNING sale_id`,
    [normalizedSaleId, JSON.stringify({ status: "sending", claimed_at: new Date().toISOString() })]
  );

  return result.rowCount > 0;
}

async function markPurchaseAccessEmailSent(saleId, client) {
  const normalizedSaleId = String(saleId || "").trim();
  if (!normalizedSaleId) return null;

  const result = await executeQuery(
    client,
    `UPDATE gumroad_sales
     SET raw_payload = jsonb_set(
           COALESCE(raw_payload, '{}'::jsonb),
           '{pseu_access_email}',
           $2::jsonb,
           true
         ),
         updated_at = NOW()
     WHERE sale_id = $1
     RETURNING sale_id`,
    [normalizedSaleId, JSON.stringify({ status: "sent", sent_at: new Date().toISOString() })]
  );

  return result.rows[0] || null;
}

async function markPurchaseAccessEmailFailed(saleId, reason, client) {
  const normalizedSaleId = String(saleId || "").trim();
  if (!normalizedSaleId) return null;

  const safeReason = String(reason || "email_error").slice(0, 120);
  const result = await executeQuery(
    client,
    `UPDATE gumroad_sales
     SET raw_payload = jsonb_set(
           COALESCE(raw_payload, '{}'::jsonb),
           '{pseu_access_email}',
           $2::jsonb,
           true
         ),
         updated_at = NOW()
     WHERE sale_id = $1
     RETURNING sale_id`,
    [normalizedSaleId, JSON.stringify({ status: "failed", failed_at: new Date().toISOString(), reason: safeReason })]
  );

  return result.rows[0] || null;
}

module.exports = {
  claimPurchaseAccessEmail,
  getBuyerEmail,
  getProductId,
  getSaleId,
  isExpectedProduct,
  markPurchaseAccessEmailFailed,
  markPurchaseAccessEmailSent,
  mapGumroadStatus,
  readEventName,
  upsertGumroadSale,
  verifySaleWithGumroad,
  verifyWebhookSecret,
};
