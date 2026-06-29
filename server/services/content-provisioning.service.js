const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { getProtectedPdfDescriptor } = require("./pdf.service");

const projectRoot = path.resolve(__dirname, "../..");

const PUBLIC_FRAGMENT_PDFS = new Map([
  [
    "/fragmentos/manual-do-despertar.pdf",
    {
      fileName: "fragmento-manual-do-despertar.pdf",
      relativePath: "livros/o livro despertar/Design sem nome.pdf",
    },
  ],
  [
    "/livros/o livro despertar/Design sem nome.pdf",
    {
      fileName: "fragmento-manual-do-despertar.pdf",
      relativePath: "livros/o livro despertar/Design sem nome.pdf",
    },
  ],
]);

function resolveProjectPath(relativePath) {
  const absolutePath = path.resolve(projectRoot, relativePath);
  if (!absolutePath.startsWith(projectRoot)) {
    throw new Error("content_asset_path_outside_project");
  }
  return absolutePath;
}

async function assetExists(absolutePath) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function assetExistsSync(absolutePath) {
  return fsSync.existsSync(absolutePath);
}

function getPublicFragmentDescriptor(assetPath) {
  const fragment = PUBLIC_FRAGMENT_PDFS.get(assetPath);
  if (!fragment) return null;

  return {
    ...fragment,
    source: assetPath,
    absolutePath: resolveProjectPath(fragment.relativePath),
  };
}

async function getPrivatePdfProvisioning(book) {
  const descriptor = getProtectedPdfDescriptor(book.bookId);
  if (!descriptor) {
    return {
      configured: false,
      available: false,
      source: "",
      reason: "pdf_not_mapped",
    };
  }

  const available = await assetExists(descriptor.absolutePath);

  return {
    configured: true,
    available,
    source: book.pdfEndpoint || "",
    fileName: descriptor.fileName,
    reason: available ? null : "pdf_not_provisioned",
  };
}

async function attachContentProvisioning(books = []) {
  return Promise.all(books.map(async (book) => ({
    ...book,
    provisioning: {
      ...(book.provisioning || {}),
      privatePdf: await getPrivatePdfProvisioning(book),
    },
  })));
}

module.exports = {
  assetExists,
  assetExistsSync,
  attachContentProvisioning,
  getPublicFragmentDescriptor,
};
