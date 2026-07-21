const express = require("express");
const { withTransaction } = require("../db/pool");
const {
  getBuyerEmail,
  getProductId,
  getSaleId,
  isExpectedProduct,
  mapGumroadStatus,
  readEventName,
  upsertGumroadSale,
  verifySaleWithGumroad,
  verifyWebhookSecret,
} = require("../services/gumroad.service");
const {
  ensurePurchasedUser,
  findUserByEmail,
  hasActivePurchase,
  suspendUserIfNoActivePurchase,
} = require("../services/user.service");
const {
  ensureInitialEntitlements,
  revokeInitialEntitlements,
} = require("../services/entitlement.service");

const router = express.Router();

function compactLogDetails(details) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function maskEmailForLog(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value.includes("@")) return undefined;
  const [name, domain] = value.split("@");
  const visibleName = name.slice(0, 2);
  return `${visibleName}${"*".repeat(Math.max(name.length - 2, 2))}@${domain}`;
}

function logWebhookResult(result, details = {}) {
  console.info("[WEBHOOK]", compactLogDetails({
    result,
    saleId: details.saleId,
    status: details.status,
    effectiveStatus: details.effectiveStatus,
    productId: details.productId,
    email: maskEmailForLog(details.email),
    action: details.action,
    reason: details.reason,
    durationMs: details.startedAt ? Date.now() - details.startedAt : undefined,
  }));
}

function logEntitlementsResult(result, details = {}) {
  console.info("[ENTITLEMENTS]", compactLogDetails({
    result,
    saleId: details.saleId,
    email: maskEmailForLog(details.email),
    count: details.count,
    source: details.source,
  }));
}

router.post("/gumroad", async (req, res, next) => {
  const startedAt = Date.now();
  let saleId = "";
  let productId = "";
  let email = "";
  let status = "";

  try {
    const secretCheck = verifyWebhookSecret(req);
    if (!secretCheck.ok) {
      logWebhookResult("unauthorized", { startedAt });
      return res.status(401).json({ error: "webhook_not_authorized" });
    }

    const payload = req.body || {};
    const eventName = readEventName(payload);
    productId = getProductId(payload);
    saleId = getSaleId(payload);
    email = getBuyerEmail(payload);
    status = mapGumroadStatus(eventName);

    if (!saleId || !email || !productId) {
      logWebhookResult("invalid_payload", { saleId, productId, email, status, startedAt });
      return res.status(400).json({ error: "invalid_gumroad_payload" });
    }

    if (!isExpectedProduct(productId)) {
      logWebhookResult("ignored_product", { saleId, productId, email, status, startedAt });
      return res.status(202).json({
        ok: true,
        ignored: true,
        reason: "product_not_recognized",
      });
    }

    const verification = await verifySaleWithGumroad(payload);
    if (verification.configured && verification.verified === false && !verification.skipped) {
      logWebhookResult("verification_failed", { saleId, productId, email, status, reason: verification.reason, startedAt });
      return res.status(409).json({ error: "sale_verification_failed" });
    }

    const result = await withTransaction(async (client) => {
      const sale = await upsertGumroadSale({
        saleId,
        productId,
        email,
        status,
        eventName,
        payload: {
          ...payload,
          pseu_event_name: eventName,
          pseu_verification: {
            configured: verification.configured,
            verified: verification.verified,
            skipped: verification.skipped,
            reason: verification.reason,
          },
        },
      }, client);

      if (sale.status === "active") {
        const user = await ensurePurchasedUser(email, client);
        const entitlements = await ensureInitialEntitlements(user.id, `gumroad:${sale.sale_id}`, client);

        return {
          sale,
          action: "access_granted",
          entitlements,
          stillHasActivePurchase: true,
          revoked: [],
        };
      }

      const stillHasActivePurchase = await hasActivePurchase(email, client);
      const user = await findUserByEmail(email, client);
      const revoked = !stillHasActivePurchase && user ? await revokeInitialEntitlements(user.id, client) : [];
      if (!stillHasActivePurchase) {
        await suspendUserIfNoActivePurchase(email, client);
      }

      return {
        sale,
        action: stillHasActivePurchase ? "sale_status_updated" : "access_revoked_or_suspended",
        entitlements: [],
        stillHasActivePurchase,
        revoked,
      };
    });

    if (result.action === "access_granted") {
      logEntitlementsResult("granted", {
        saleId: result.sale.sale_id,
        email: result.sale.email,
        count: result.entitlements.length,
        source: `gumroad:${result.sale.sale_id}`,
      });
      logWebhookResult("processed", {
        saleId,
        productId,
        email,
        status,
        effectiveStatus: result.sale.status,
        action: result.action,
        startedAt,
      });

      return res.status(202).json({
        ok: true,
        action: result.action,
        saleId: result.sale.sale_id,
        email: result.sale.email,
        entitlements: result.entitlements,
        verification: {
          configured: verification.configured,
          verified: verification.verified,
          skipped: verification.skipped,
        },
      });
    }

    logEntitlementsResult(result.revoked.length ? "revoked" : "unchanged", {
      saleId: result.sale.sale_id,
      email: result.sale.email,
      count: result.revoked.length,
      source: "gumroad",
    });
    logWebhookResult("processed", {
      saleId,
      productId,
      email,
      status,
      effectiveStatus: result.sale.status,
      action: result.action,
      startedAt,
    });

    return res.status(202).json({
      ok: true,
      action: result.action,
      saleId: result.sale.sale_id,
      email: result.sale.email,
      status: result.sale.status,
      stillHasActivePurchase: result.stillHasActivePurchase,
      revoked: result.revoked,
    });
  } catch (err) {
    logWebhookResult("error", {
      saleId,
      productId,
      email,
      status,
      action: err.code || err.message || "internal_error",
      startedAt,
    });
    return next(err);
  }
});

module.exports = router;
