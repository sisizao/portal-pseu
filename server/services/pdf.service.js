const fs = require("fs/promises");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");

const PROTECTED_PDFS = {
  "manual-do-despertar": {
    fileName: "manual-do-despertar.pdf",
    relativePath: "private/pdfs/manual-do-despertar.pdf",
  },
  "manual-do-lider-estoico": {
    fileName: "manual-do-lider-estoico.pdf",
    relativePath: "private/pdfs/manual-do-lider-estoico.pdf",
  },
};

function getProtectedPdfDescriptor(bookId) {
  const descriptor = PROTECTED_PDFS[bookId];
  if (!descriptor) return null;

  const absolutePath = path.resolve(projectRoot, descriptor.relativePath);
  if (!absolutePath.startsWith(projectRoot)) {
    throw new Error("protected_pdf_path_outside_project");
  }

  return {
    ...descriptor,
    absolutePath,
  };
}

async function assertProtectedPdfExists(bookId) {
  const descriptor = getProtectedPdfDescriptor(bookId);
  if (!descriptor) return null;

  await fs.access(descriptor.absolutePath);
  return descriptor;
}

module.exports = {
  assertProtectedPdfExists,
  getProtectedPdfDescriptor,
};
