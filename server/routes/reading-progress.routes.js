const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { hasBookAccess } = require("../services/entitlement.service");
const { findBook } = require("../services/book-catalog.service");
const { getProtectedPdfDescriptor } = require("../services/pdf.service");
const {
  ReadingProgressError,
  createReadingProgressService,
} = require("../services/reading-progress.service");
const { createReadingProgressEventsService } = require("../services/reading-progress-events.service");

function requireReadingProgressAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Sessao necessaria para acessar esta rota.",
    });
  }
  return requireAuth(req, res, next);
}

function createReadingProgressRouter(dependencies = {}) {
  const router = express.Router();
  const progressService = dependencies.progressService || createReadingProgressService();
  const eventsService = dependencies.eventsService || createReadingProgressEventsService();
  const checkBookAccess = dependencies.hasBookAccess || hasBookAccess;

  router.get("/", requireReadingProgressAuth, async (req, res, next) => {
    try {
      const progress = await progressService.listForUser(req.session.userId);
      return res.json({ ok: true, progress });
    } catch (error) {
      return next(error);
    }
  });

  router.put("/:bookId/:documentId", requireReadingProgressAuth, async (req, res, next) => {
    try {
      const { bookId, documentId } = req.params;
      if (!findBook(bookId)) {
        return res.status(404).json({ error: "book_not_found" });
      }

      const document = getProtectedPdfDescriptor(bookId, documentId);
      if (!document) {
        return res.status(404).json({ error: "document_not_found" });
      }

      const allowed = await checkBookAccess(req.session.userId, bookId);
      if (!allowed) {
        return res.status(403).json({ error: "book_not_allowed" });
      }

      if (document.pageCount && Number(req.body?.total_pages) !== Number(document.pageCount)) {
        return res.status(400).json({ error: "invalid_document_page_count" });
      }

      const result = await progressService.updateCheckpoint({
        userId: req.session.userId,
        bookId,
        documentId,
        payload: req.body,
      });

      try {
        await eventsService.recordTransition({
          userId: req.session.userId,
          bookId,
          documentId,
          ...result,
        });
      } catch (eventError) {
        console.warn("[PSEU TELEMETRY] Falha nao bloqueante ao registrar evento do reader:", eventError.message);
      }

      return res.json({ ok: true, progress: result.progress });
    } catch (error) {
      if (error instanceof ReadingProgressError) {
        return res.status(error.status).json({
          error: error.code,
          ...(error.details || {}),
        });
      }
      return next(error);
    }
  });

  return router;
}

module.exports = createReadingProgressRouter();
module.exports.createReadingProgressRouter = createReadingProgressRouter;
