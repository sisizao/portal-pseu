const express = require("express");
const {
  clearExpiredPasswordResetTokens,
  createOrClaimUser,
  createPasswordResetRequest,
  findUserByEmail,
  findUserById,
  hasActivePurchase,
  normalizeEmail,
  publicUser,
  resetPasswordWithToken,
  touchLastLogin,
  verifyPassword,
} = require("../services/user.service");
const { ensureInitialEntitlements } = require("../services/entitlement.service");
const { isSmtpConfigured, sendPasswordResetEmail } = require("../services/email.service");

const router = express.Router();
const sessionName = process.env.SESSION_NAME || "pseu.sid";
const passwordResetNeutralMessage =
  "Se existir uma conta vinculada a este e-mail, enviaremos um link de recupera\u00e7\u00e3o.";

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

function buildPasswordResetUrl(req, token) {
  const configuredBaseUrl = process.env.PASSWORD_RESET_BASE_URL;
  const requestBaseUrl = `${req.protocol}://${req.get("host")}`;
  const baseUrl = String(configuredBaseUrl || requestBaseUrl).replace(/\/+$/, "");
  return `${baseUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

router.get("/me", async (req, res, next) => {
  try {
    if (!req.session?.userId) {
      return res.json({ authenticated: false, user: null });
    }

    const user = await findUserById(req.session.userId);
    if (!user || user.status !== "active") {
      return res.status(401).json({ authenticated: false, user: null });
    }

    return res.json({ authenticated: true, user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const user = await findUserByEmail(email);
    const passwordOk = await verifyPassword(user, password);

    if (!user || user.status !== "active" || !passwordOk) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.email = user.email;
    await touchLastLogin(user.id);

    return res.json({ ok: true, user: publicUser({ ...user, last_login_at: new Date() }) });
  } catch (err) {
    return next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    if (req.session) {
      await destroySession(req);
    }

    res.clearCookie(sessionName);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    await clearExpiredPasswordResetTokens();

    const email = normalizeEmail(req.body?.email);
    const smtpReady = isSmtpConfigured();
    const resetRequest = email.includes("@") && smtpReady
      ? await createPasswordResetRequest(email)
      : null;

    if (email.includes("@") && !smtpReady) {
      console.warn("[PSEU AUTH] SMTP nao configurado. Recuperacao de senha solicitada sem envio de e-mail.");
    }

    if (resetRequest) {
      const resetUrl = buildPasswordResetUrl(req, resetRequest.token);
      try {
        await sendPasswordResetEmail({
          to: resetRequest.user.email,
          resetUrl,
          expiresAt: resetRequest.expiresAt,
        });
      } catch (err) {
        console.error("[PSEU AUTH] Falha ao enviar e-mail de recuperacao:", err);
      }
    }

    return res.json({ ok: true, message: passwordResetNeutralMessage });
  } catch (err) {
    return next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    await clearExpiredPasswordResetTokens();

    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!token || password.length < 8 || password !== confirmPassword) {
      return res.status(400).json({ error: "invalid_password_reset" });
    }

    const user = await resetPasswordWithToken(token, password);
    if (!user) {
      return res.status(400).json({ error: "invalid_or_expired_token" });
    }

    return res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post("/claim", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "invalid_claim" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "weak_password" });
    }

    const purchaseActive = await hasActivePurchase(email);
    if (!purchaseActive) {
      return res.status(403).json({ error: "claim_not_available" });
    }

    const user = await createOrClaimUser(email, password);
    await ensureInitialEntitlements(user.id, "claim");
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.email = user.email;
    await touchLastLogin(user.id);

    return res.json({ ok: true, user: publicUser({ ...user, last_login_at: new Date() }) });
  } catch (err) {
    if (err.code === "access_already_claimed") {
      return res.status(409).json({ error: "access_already_claimed" });
    }
    return next(err);
  }
});

module.exports = router;
