const express = require("express");
const { withTransaction } = require("../db/pool");
const {
  clearExpiredPasswordResetTokens,
  createOrClaimUser,
  createPasswordResetRequest,
  findUserByEmail,
  findUserById,
  hasActivePurchase,
  inspectPasswordResetToken,
  normalizeEmail,
  publicUser,
  resetPasswordWithToken,
  touchLastLogin,
  verifyPassword,
} = require("../services/user.service");
const { ensureInitialEntitlements } = require("../services/entitlement.service");
const { isResendConfigured, sendPasswordResetEmail } = require("../services/email.service");

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

function maskEmailForLog(email) {
  const value = normalizeEmail(email);
  if (!value.includes("@")) return undefined;
  const [name, domain] = value.split("@");
  const visibleName = name.slice(0, 2);
  return `${visibleName}${"*".repeat(Math.max(name.length - 2, 2))}@${domain}`;
}

function compactLogDetails(details) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function formatPasswordResetTokenLog(tokenStatus = {}) {
  return compactLogDetails({
    tokenStatus: tokenStatus.status,
    tokenHashPrefix: tokenStatus.tokenHashPrefix,
    email: maskEmailForLog(tokenStatus.email),
    expiresAt: tokenStatus.expiresAt,
    usedAt: tokenStatus.usedAt,
    userStatus: tokenStatus.userStatus,
  });
}

function logPasswordResetFailure(reason, details = {}) {
  console.warn("[PSEU AUTH] Falha na redefinicao de senha:", compactLogDetails({
    reason,
    ...details,
  }));
}

function logResetResult(result, email, startedAt, details = {}) {
  console.info("[RESET]", compactLogDetails({
    email: maskEmailForLog(email),
    result,
    durationMs: startedAt ? Date.now() - startedAt : undefined,
    ...details,
  }));
}

function logClaimResult(result, email, startedAt, details = {}) {
  console.info("[CLAIM]", compactLogDetails({
    email: maskEmailForLog(email),
    result,
    durationMs: startedAt ? Date.now() - startedAt : undefined,
    ...details,
  }));
}

function logEntitlementsResult(result, email, details = {}) {
  console.info("[ENTITLEMENTS]", compactLogDetails({
    email: maskEmailForLog(email),
    result,
    ...details,
  }));
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
  const startedAt = Date.now();
  let email = "";

  try {
    await clearExpiredPasswordResetTokens();

    email = normalizeEmail(req.body?.email);
    const emailValid = email.includes("@");
    const resendReady = isResendConfigured();
    const resetRequest = emailValid && resendReady
      ? await createPasswordResetRequest(email)
      : null;

    if (!emailValid) {
      logResetResult("invalid_request", email, startedAt);
    } else if (!resendReady) {
      console.warn("[PSEU AUTH] Resend nao configurado. Recuperacao de senha solicitada sem envio de e-mail.");
      logResetResult("email_skipped_not_configured", email, startedAt);
    }

    if (resetRequest) {
      const resetUrl = buildPasswordResetUrl(req, resetRequest.token);
      try {
        await sendPasswordResetEmail({
          to: resetRequest.user.email,
          resetUrl,
          expiresAt: resetRequest.expiresAt,
        });
        logResetResult("email_sent", email, startedAt, {
          expiresAt: resetRequest.expiresAt,
        });
      } catch (err) {
        console.error("[PSEU AUTH] Falha ao enviar e-mail de recuperacao:", err);
        logResetResult("email_send_failed", email, startedAt, {
          reason: err.code || err.message || "resend_error",
        });
      }
    } else if (emailValid && resendReady) {
      logResetResult("neutral_response", email, startedAt);
    }

    return res.json({ ok: true, message: passwordResetNeutralMessage });
  } catch (err) {
    logResetResult("error", email, startedAt, {
      reason: err.code || err.message || "internal_error",
    });
    return next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  const startedAt = Date.now();

  try {
    await clearExpiredPasswordResetTokens();

    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!token) {
      logPasswordResetFailure("token_missing");
      return res.status(400).json({ error: "invalid_password_reset" });
    }

    if (password.length < 8) {
      logPasswordResetFailure("password_invalid", { passwordLength: password.length });
      return res.status(400).json({ error: "invalid_password_reset" });
    }

    if (password !== confirmPassword) {
      logPasswordResetFailure("password_confirmation_mismatch");
      return res.status(400).json({ error: "invalid_password_reset" });
    }

    const tokenStatus = await inspectPasswordResetToken(token);
    if (tokenStatus.status !== "valid") {
      logPasswordResetFailure("token_rejected", formatPasswordResetTokenLog(tokenStatus));
      return res.status(400).json({ error: "invalid_or_expired_token" });
    }

    const user = await resetPasswordWithToken(token, password);
    if (!user) {
      const postAttemptStatus = await inspectPasswordResetToken(token);
      logPasswordResetFailure("token_consume_failed", compactLogDetails({
        beforeStatus: tokenStatus.status,
        afterStatus: postAttemptStatus.status,
        ...formatPasswordResetTokenLog(postAttemptStatus),
      }));
      return res.status(400).json({ error: "invalid_or_expired_token" });
    }

    logResetResult("password_updated", user.email, startedAt);
    return res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post("/claim", async (req, res, next) => {
  const startedAt = Date.now();
  let email = "";

  try {
    email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !email.includes("@")) {
      logClaimResult("invalid_claim", email, startedAt);
      return res.status(400).json({ error: "invalid_claim" });
    }

    if (password.length < 8) {
      logClaimResult("weak_password", email, startedAt);
      return res.status(400).json({ error: "weak_password" });
    }

    const claim = await withTransaction(async (client) => {
      const purchaseActive = await hasActivePurchase(email, client);
      if (!purchaseActive) {
        const error = new Error("claim_not_available");
        error.code = "claim_not_available";
        throw error;
      }

      const user = await createOrClaimUser(email, password, client);
      const entitlements = await ensureInitialEntitlements(user.id, "claim", client);

      return {
        user,
        entitlements,
      };
    });

    logEntitlementsResult("granted", email, {
      count: claim.entitlements.length,
      source: "claim",
    });
    await regenerateSession(req);
    req.session.userId = claim.user.id;
    req.session.email = claim.user.email;
    await touchLastLogin(claim.user.id);
    logClaimResult("success", email, startedAt, {
      userId: claim.user.id,
    });

    return res.json({ ok: true, user: publicUser({ ...claim.user, last_login_at: new Date() }) });
  } catch (err) {
    if (err.code === "claim_not_available") {
      logClaimResult("claim_not_available", email, startedAt);
      return res.status(403).json({ error: "claim_not_available" });
    }
    if (err.code === "access_already_claimed") {
      logClaimResult("access_already_claimed", email, startedAt);
      return res.status(409).json({ error: "access_already_claimed" });
    }
    logClaimResult("error", email, startedAt, {
      reason: err.code || err.message || "internal_error",
    });
    return next(err);
  }
});

module.exports = router;
