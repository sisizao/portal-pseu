const express = require("express");
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

router.post("/gumroad", async (req, res, next) => {
  try {
    const secretCheck = verifyWebhookSecret(req);
    if (!secretCheck.ok) {
      return res.status(401).json({ error: "webhook_not_authorized" });
    }

    const payload = req.body || {};
    const eventName = readEventName(payload);
    const productId = getProductId(payload);
    const saleId = getSaleId(payload);
    const email = getBuyerEmail(payload);
    const status = mapGumroadStatus(eventName);

    if (!saleId || !email || !productId) {
      return res.status(400).json({ error: "invalid_gumroad_payload" });
    }

    if (!isExpectedProduct(productId)) {
      return res.status(202).json({
        ok: true,
        ignored: true,
        reason: "product_not_recognized",
      });
    }

    const verification = await verifySaleWithGumroad(payload);
    if (verification.configured && verification.verified === false && !verification.skipped) {
      return res.status(409).json({ error: "sale_verification_failed" });
    }

    const sale = await upsertGumroadSale({
      saleId,
      productId,
      email,
      status,
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
    });

    if (status === "active") {
      const user = await ensurePurchasedUser(email);
      const entitlements = await ensureInitialEntitlements(user.id, `gumroad:${sale.sale_id}`);

      return res.status(202).json({
        ok: true,
        action: "access_granted",
        saleId: sale.sale_id,
        email: sale.email,
        entitlements,
        verification: {
          configured: verification.configured,
          verified: verification.verified,
          skipped: verification.skipped,
        },
      });
    }

    const stillHasActivePurchase = await hasActivePurchase(email);
    const user = await findUserByEmail(email);
    const revoked = !stillHasActivePurchase && user ? await revokeInitialEntitlements(user.id) : [];
    if (!stillHasActivePurchase) {
      await suspendUserIfNoActivePurchase(email);
    }

    return res.status(202).json({
      ok: true,
      action: stillHasActivePurchase ? "sale_status_updated" : "access_revoked_or_suspended",
      saleId: sale.sale_id,
      email: sale.email,
      status,
      stillHasActivePurchase,
      revoked,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
