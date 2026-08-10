const fs = require("fs/promises");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");

const PRIMARY_PROTECTED_DOCUMENT_ID = "manual";

const PROTECTED_PDFS = {
  "manual-do-despertar": {
    manual: {
      title: "Manual do Despertar",
      fileName: "manual-do-despertar.pdf",
      relativePath: "protected/pdfs/manual-do-despertar.pdf",
    },
    "caderno-de-travessia": {
      title: "Caderno de Travessia",
      subtitle: "Material Complementar de Aplicação do Manual do Despertar",
      pageCount: 56,
      fileName: "caderno-de-travessia.pdf",
      relativePath: "protected/pdfs/caderno-de-travessia.pdf",
    },
  },
  "manual-do-lider-estoico": {
    manual: {
      title: "Manual do Lider Estoico",
      fileName: "manual-do-lider-estoico.pdf",
      relativePath: "protected/pdfs/manual-do-lider-estoico.pdf",
    },
  },
};

function getProtectedPdfDescriptor(bookId, documentId = PRIMARY_PROTECTED_DOCUMENT_ID) {
  const descriptor = PROTECTED_PDFS[bookId]?.[documentId];
  if (!descriptor) return null;

  const absolutePath = path.resolve(projectRoot, descriptor.relativePath);
  if (!absolutePath.startsWith(projectRoot)) {
    throw new Error("protected_pdf_path_outside_project");
  }

  return {
    ...descriptor,
    documentId,
    absolutePath,
  };
}

function listProtectedPdfDocuments(bookId) {
  return Object.keys(PROTECTED_PDFS[bookId] || {})
    .map((documentId) => getProtectedPdfDescriptor(bookId, documentId))
    .filter(Boolean);
}

async function assertProtectedPdfExists(bookId, documentId = PRIMARY_PROTECTED_DOCUMENT_ID) {
  const descriptor = getProtectedPdfDescriptor(bookId, documentId);
  if (!descriptor) return null;

  await fs.access(descriptor.absolutePath);
  return descriptor;
}

module.exports = {
  PRIMARY_PROTECTED_DOCUMENT_ID,
  assertProtectedPdfExists,
  getProtectedPdfDescriptor,
  listProtectedPdfDocuments,
};
