const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { hasBookAccess, listActiveEntitlements } = require("../services/entitlement.service");
const { findBook, mergeCatalogWithEntitlements } = require("../services/book-catalog.service");
const { assertProtectedPdfExists } = require("../services/pdf.service");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const entitlements = await listActiveEntitlements(req.session.userId);
    const books = mergeCatalogWithEntitlements(entitlements);
    return res.json({
      ok: true,
      books,
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/:bookId/pdf", requireAuth, async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const book = findBook(bookId);
    if (!book) {
      return res.status(404).json({ error: "book_not_found" });
    }

    const allowed = await hasBookAccess(req.session.userId, bookId);

    if (!allowed) {
      return res.status(403).json({ error: "book_not_allowed" });
    }

    let pdf = null;
    try {
      pdf = await assertProtectedPdfExists(bookId);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return res.status(404).json({ error: "pdf_not_found" });
      }

      throw error;
    }

    if (!pdf) {
      return res.status(404).json({ error: "pdf_not_mapped" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${pdf.fileName}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    return res.sendFile(pdf.absolutePath);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
