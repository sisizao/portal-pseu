const { getProtectedPdfDescriptor } = require("./pdf.service");

const BOOK_CATALOG = [
  { bookId: "manual-do-despertar", title: "Manual do Despertar" },
  { bookId: "manual-do-lider-estoico", title: "Manual do Lider Estoico" },
  { bookId: "manual-do-vilao", title: "Manual do Vilao que Ousa Questionar a Luz" },
  { bookId: "a-dor-invisivel", title: "A Dor Invisivel" },
  { bookId: "ebook-de-produtividade", title: "E-book de Produtividade" },
  { bookId: "ebook-de-depressao", title: "E-book de Depressao" },
  { bookId: "olho-no-olho", title: "Olho no Olho" },
  { bookId: "capacitacao-financeira", title: "Capacitacao Financeira" },
  { bookId: "psicologia-do-day-trader", title: "Psicologia do Day Trader" },
  { bookId: "o-codigo-da-mente", title: "O Codigo da Mente" },
  { bookId: "a-rebeliao-silenciosa", title: "A Rebeliao Silenciosa" },
  { bookId: "manual-do-subconsciente", title: "Manual do Subconsciente" },
  { bookId: "a-verdade-como-mentira", title: "A Verdade Como Mentira" },
  { bookId: "o-codigo-oculto-do-governo", title: "O Codigo Oculto do Governo" },
  { bookId: "o-efeito-da-dupla-fenda", title: "O Efeito da Dupla Fenda" },
  { bookId: "os-segredos-dos-illuminati", title: "Os Segredos dos Illuminati" },
  { bookId: "o-despertar-da-realidade", title: "O Despertar Para a Realidade" },
  { bookId: "o-livro-18-a-chave", title: "O Livro 18 - A Chave" },
];

function listBookCatalog() {
  return BOOK_CATALOG;
}

function findBook(bookId) {
  return BOOK_CATALOG.find((book) => book.bookId === bookId) || null;
}

function mergeCatalogWithEntitlements(entitlements) {
  const entitlementMap = new Map(entitlements.map((item) => [item.bookId, item]));

  return BOOK_CATALOG.map((book) => {
    const entitlement = entitlementMap.get(book.bookId);
    const hasMappedPdf = Boolean(getProtectedPdfDescriptor(book.bookId));
    const canRead = Boolean(entitlement?.status === "active" && hasMappedPdf);

    return {
      bookId: book.bookId,
      title: book.title,
      status: canRead ? "unlocked" : "locked",
      source: entitlement?.source || null,
      canRead,
      pdfEndpoint: canRead ? `/api/books/${encodeURIComponent(book.bookId)}/pdf` : null,
    };
  });
}

module.exports = {
  findBook,
  listBookCatalog,
  mergeCatalogWithEntitlements,
};
