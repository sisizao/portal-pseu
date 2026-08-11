const express = require("express");
const requireAdmin = require("../middleware/requireAdmin");
const {
  AdminObservabilityError,
  createAdminObservabilityService,
} = require("../services/admin-observability.service");

function createAdminObservabilityRouter(dependencies = {}) {
  const router = express.Router();
  const service = dependencies.service || createAdminObservabilityService();

  function handleKnownError(res, error) {
    if (!(error instanceof AdminObservabilityError)) return false;
    res.status(error.status).json({ ok: false, error: error.code });
    return true;
  }

  function read(handler) {
    return async (req, res, next) => {
      try {
        const data = await handler(req);
        return res.json({ ok: true, data });
      } catch (error) {
        if (handleKnownError(res, error)) return undefined;
        return next(error);
      }
    };
  }

  router.use(requireAdmin);
  router.get("/overview", read((req) => service.overview(req.query)));
  router.get("/funnel", read((req) => service.funnel(req.query)));
  router.get("/users", read((req) => service.users(req.query)));
  router.get("/reading", read((req) => service.reading(req.query)));
  router.get("/users/:userId/journey", read((req) => service.journey(req.params.userId, req.query)));

  router.all("*", (_req, res) => {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  });

  return router;
}

module.exports = createAdminObservabilityRouter();
module.exports.createAdminObservabilityRouter = createAdminObservabilityRouter;
