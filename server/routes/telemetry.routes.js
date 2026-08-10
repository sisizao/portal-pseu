const express = require("express");
const { TelemetryValidationError } = require("../services/telemetry-contract.service");
const {
  TelemetryIngestionError,
  ingestEvent: defaultIngestEvent,
} = require("../services/telemetry-ingestion.service");
const {
  createBehavioralSession: defaultCreateBehavioralSession,
} = require("../services/telemetry-session.service");

function createTelemetryRouter({
  createBehavioralSession = defaultCreateBehavioralSession,
  ingestEvent = defaultIngestEvent,
} = {}) {
  const router = express.Router();

  function sendKnownError(res, error) {
    if (!(error instanceof TelemetryValidationError || error instanceof TelemetryIngestionError)) {
      return false;
    }
    res.status(error.status).json({
      ok: false,
      error: error.code,
      ...(error.field ? { field: error.field } : {}),
    });
    return true;
  }

  function sendUnavailable(res, error) {
    console.error("[PSEU TELEMETRY] Falha isolada na ingestão", {
      name: error?.name || "Error",
      code: error?.code || "unknown",
    });
    return res.status(503).json({ ok: false, error: "telemetry_unavailable" });
  }

  router.post("/sessions", async (req, res) => {
    if (!req.is("application/json")) {
      return res.status(415).json({ ok: false, error: "json_required" });
    }

    try {
      const result = await createBehavioralSession(req.body);
      return res.status(result.created ? 201 : 200).json({ ok: true, ...result });
    } catch (error) {
      if (sendKnownError(res, error)) return undefined;
      return sendUnavailable(res, error);
    }
  });

  router.post("/events", async (req, res) => {
    if (!req.is("application/json")) {
      return res.status(415).json({ ok: false, error: "json_required" });
    }

    try {
      // O navegador nunca declara user_id. A atribuição autenticada permanece
      // resolvível pela behavioral_session vinculada no Login/Primeiro Acesso.
      const result = await ingestEvent(req.body, {
        authenticatedUserId: null,
        source: "web",
      });

      return res.status(result.created ? 201 : 200).json({ ok: true, ...result });
    } catch (error) {
      if (sendKnownError(res, error)) return undefined;
      return sendUnavailable(res, error);
    }
  });

  return router;
}

const router = createTelemetryRouter();

module.exports = router;
module.exports.createTelemetryRouter = createTelemetryRouter;
