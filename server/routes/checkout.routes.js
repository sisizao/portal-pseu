const express = require("express");

const router = express.Router();

function compactLogDetails(details) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function normalizeCheckoutUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return "";

  try {
    const parsed = new URL(rawUrl);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function logCheckoutResult(result, details = {}) {
  console.info("[CHECKOUT]", compactLogDetails({
    result,
    configured: details.configured,
    postPurchaseUrl: details.postPurchaseUrl,
    reason: details.reason,
  }));
}

function resolveRequestBaseUrl(req) {
  const host = req?.get?.("host");
  if (!host) return "";
  return `${req.protocol || "https"}://${host}`;
}

function resolvePostPurchaseUrl(req) {
  const baseUrl = String(resolveRequestBaseUrl(req) || process.env.APP_BASE_URL || "").trim();
  if (!baseUrl) return "/obrigado";

  try {
    return new URL("/obrigado", baseUrl).toString();
  } catch {
    return "/obrigado";
  }
}

router.get("/config", (req, res) => {
  const rawCheckoutUrl = String(process.env.GUMROAD_CHECKOUT_URL || "").trim();
  const checkoutUrl = normalizeCheckoutUrl(rawCheckoutUrl);
  const postPurchaseUrl = resolvePostPurchaseUrl(req);

  if (rawCheckoutUrl && !checkoutUrl) {
    console.warn("[PSEU CHECKOUT] GUMROAD_CHECKOUT_URL invalida. Configure uma URL http/https publica.");
  }

  logCheckoutResult(checkoutUrl ? "configured" : "missing_config", {
    configured: Boolean(checkoutUrl),
    postPurchaseUrl,
    reason: rawCheckoutUrl && !checkoutUrl ? "invalid_checkout_url" : undefined,
  });

  return res.json({
    ok: true,
    productName: "ACESSO AO PORTAL PSEU",
    checkoutUrl,
    checkoutConfigured: Boolean(checkoutUrl),
    postPurchasePath: "/obrigado",
    postPurchaseUrl,
    devMode: process.env.NODE_ENV !== "production",
  });
});

module.exports = router;
