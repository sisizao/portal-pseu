const express = require("express");
const {
  createOrClaimUser,
  findUserByEmail,
  findUserById,
  hasActivePurchase,
  normalizeEmail,
  publicUser,
  touchLastLogin,
  verifyPassword,
} = require("../services/user.service");
const { ensureInitialEntitlements } = require("../services/entitlement.service");

const router = express.Router();
const sessionName = process.env.SESSION_NAME || "pseu.sid";

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
