const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const requireAuth = require("../middleware/requireAuth");
const { isAdminEmail } = require("../middleware/requireAdmin");
const { renderAccessPage } = require("../views/access-page");
const { renderThankYouPage } = require("../views/thank-you-page");
const { renderProtectedPortal } = require("../services/portal-page.service");

const router = express.Router();
const projectRoot = path.resolve(__dirname, "../..");
const indexPath = path.join(projectRoot, "index.html");

const adminFunnelReturn = `<style>
.admin-funnel-return {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 10000;
  border: 1px solid rgba(215, 173, 96, 0.46);
  padding: 10px 14px;
  color: #f5e5bf;
  background: rgba(7, 6, 9, 0.92);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
  font: 700 0.7rem/1 "Segoe UI", sans-serif;
  letter-spacing: 0.13em;
  text-decoration: none;
  text-transform: uppercase;
}

@media (max-width: 760px) {
  .admin-funnel-return {
    right: 10px;
    bottom: 10px;
    max-width: calc(100% - 20px);
  }
}
</style>
<a class="admin-funnel-return" href="/ia-pseu">Voltar ao Painel IA</a>`;

function addAdminFunnelReturn(html) {
  if (!html.includes("<body>")) return html;
  return html.replace("<body>", `<body>\n${adminFunnelReturn}`);
}

router.get("/", async (req, res, next) => {
  if (!isAdminEmail(req.session?.email)) {
    return res.sendFile(indexPath);
  }

  try {
    const html = addAdminFunnelReturn(await fs.readFile(indexPath, "utf8"));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(html);
  } catch (err) {
    return next(err);
  }
});

router.get("/acesso", (req, res) => {
  if (req.session?.userId) {
    return res.redirect(302, "/portal");
  }

  return res.status(200).send(renderAccessPage({
    supportEmail: process.env.PORTAL_SUPPORT_EMAIL || "pseu.oficial@gmail.com",
  }));
});

router.get("/obrigado", (_req, res) => {
  return res.status(200).send(renderThankYouPage({
    supportEmail: process.env.PORTAL_SUPPORT_EMAIL || "pseu.oficial@gmail.com",
  }));
});

router.get("/portal", requireAuth, async (req, res, next) => {
  try {
    const html = await renderProtectedPortal({
      showAdminPanelLink: isAdminEmail(req.session?.email),
    });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(html);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
