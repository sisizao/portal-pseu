const express = require("express");

const router = express.Router();

function resolvePostPurchaseUrl() {
  const baseUrl = String(process.env.APP_BASE_URL || "").trim();
  if (!baseUrl) return "/obrigado";

  try {
    return new URL("/obrigado", baseUrl).toString();
  } catch {
    return "/obrigado";
  }
}

router.get("/config", (_req, res) => {
  const checkoutUrl = String(process.env.GUMROAD_CHECKOUT_URL || "").trim();

  return res.json({
    ok: true,
    productName: "ACESSO AO PORTAL PSEU",
    checkoutUrl,
    checkoutConfigured: Boolean(checkoutUrl),
    postPurchasePath: "/obrigado",
    postPurchaseUrl: resolvePostPurchaseUrl(),
    devMode: process.env.NODE_ENV !== "production",
  });
});

module.exports = router;
