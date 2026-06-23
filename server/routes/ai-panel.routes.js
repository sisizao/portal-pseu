const express = require("express");
const requireAdmin = require("../middleware/requireAdmin");
const { renderAiPanelPage } = require("../views/ai-panel-page");

const router = express.Router();

router.get("/ia-pseu", requireAdmin, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(renderAiPanelPage({
    adminEmail: req.adminUser?.email || "pseu.oficial@gmail.com",
  }));
});

module.exports = router;
