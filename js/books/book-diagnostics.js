(function () {
  window.PSEU_DEV_MODE = window.PSEU_DEV_MODE ?? false;

  const DEV = window.PSEU_DEV_MODE !== false;
  const catalogState = new Map();

  function toUrl(path) {
    try {
      return new URL(path, document.baseURI).href;
    } catch {
      return encodeURI(String(path || ""));
    }
  }

  function log(kind, message) {
    if (!DEV) return;
    const prefix = `[PSEU ${kind}]`;
    const text = `${prefix} ${message}`;
    if (kind === "ERROR") console.error(text);
    else if (kind === "WARNING") console.warn(text);
    else console.log(text);
  }

  function isAvailableBook(book) {
    if (!book) return false;
    if (typeof book.available === "boolean") return book.available;
    return book.status !== "em breve" && book.status !== "unavailable" && book.status !== "draft";
  }

  function normalizeList(value) {
    return Array.isArray(value) ? value : [];
  }

  async function assetExists(assetPath) {
    if (!assetPath) return false;
    const url = toUrl(assetPath);

    try {
      const response = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (response.ok) return true;
      if (response.status === 405 || response.status === 501) {
        const fallback = await fetch(url, { cache: "no-store" });
        return fallback.ok;
      }
      return false;
    } catch {
      return false;
    }
  }

  function ensureSession(book) {
    if (!book?.id) return null;
    if (!catalogState.has(book.id)) {
      catalogState.set(book.id, {
        id: book.id,
        title: book.title || book.id,
        loadedPages: new Set(),
        coverReady: false,
        spreadReady: false,
        navigationChecked: false,
        savedChecked: false,
        activePage: 1,
      });
    }
    return catalogState.get(book.id);
  }

  function validateBookShape(book) {
    const required = ["id", "slug", "title", "cover", "pdf", "category", "pillar", "status"];
    const missing = required.filter((key) => !book?.[key]);
    const errors = [];
    const warnings = [];

    if (!book || typeof book !== "object") {
      errors.push("Livro invalido: entrada nao e um objeto.");
      return { errors, warnings };
    }

    if (missing.includes("id")) errors.push("id ausente");
    if (missing.includes("slug")) errors.push("slug ausente");
    if (missing.includes("title")) errors.push("title ausente");
    if (missing.includes("category")) errors.push("category ausente");
    if (missing.includes("pillar")) errors.push("pillar ausente");
    if (missing.includes("status")) errors.push("status ausente");

    if (missing.includes("cover")) {
      warnings.push("cover ausente");
    }

    if (isAvailableBook(book)) {
      if (missing.includes("pdf")) errors.push("pdf ausente");
    } else {
      if (missing.includes("pdf")) warnings.push("pdf ausente para livro em breve");
    }

    return { errors, warnings };
  }

  async function runCatalogDiagnostics(registry = window.PSEU_BOOK_REGISTRY || {}) {
    if (!DEV) return { ok: true, total: 0, errors: 0, warnings: 0 };

    const books = normalizeList(registry.books);
    const seenIds = new Set();
    const seenSlugs = new Set();
    let errors = 0;
    let warnings = 0;

    log("CHECK", `Iniciando diagnostico do catalogo (${books.length} livros)`);

    for (const book of books) {
      const { errors: shapeErrors, warnings: shapeWarnings } = validateBookShape(book);
      shapeErrors.forEach((message) => {
        errors += 1;
        log("ERROR", `${book?.title || book?.id || "Livro"}: ${message}`);
      });
      shapeWarnings.forEach((message) => {
        warnings += 1;
        log("WARNING", `${book?.title || book?.id || "Livro"}: ${message}`);
      });

      if (book?.id) {
        if (seenIds.has(book.id)) {
          errors += 1;
          log("ERROR", `id duplicado: ${book.id}`);
        } else {
          seenIds.add(book.id);
        }
      }

      if (book?.slug) {
        if (seenSlugs.has(book.slug)) {
          errors += 1;
          log("ERROR", `slug duplicado: ${book.slug}`);
        } else {
          seenSlugs.add(book.slug);
        }
      }

      const coverPath = book?.cover || "";
      const pdfPath = book?.pdf || "";

      if (coverPath) {
        const coverOk = await assetExists(coverPath);
        if (coverOk) log("CHECK", `Capa OK: ${book.title}`);
        else {
          warnings += 1;
          log("WARNING", `Capa nao encontrada: ${book.title}`);
        }
      } else if (isAvailableBook(book)) {
        errors += 1;
        log("ERROR", `Capa ausente: ${book.title}`);
      } else {
        warnings += 1;
        log("WARNING", `Capa nao definida: ${book.title}`);
      }

      if (pdfPath) {
        const pdfOk = await assetExists(pdfPath);
        if (pdfOk) log("CHECK", `PDF OK: ${book.title}`);
        else {
          errors += 1;
          log("ERROR", `PDF ausente: ${book.title}`);
        }
      } else if (isAvailableBook(book)) {
        errors += 1;
        log("ERROR", `PDF ausente: ${book.title}`);
      } else {
        warnings += 1;
        log("WARNING", `PDF nao definido: ${book.title}`);
      }

      if (!shapeErrors.length && isAvailableBook(book)) {
        log("CHECK", `Livro OK: ${book.title}`);
      }
    }

    return {
      ok: errors === 0,
      total: books.length,
      errors,
      warnings,
    };
  }

  window.runPseuDiagnostics = async function runPseuDiagnostics() {
    return runCatalogDiagnostics(window.PSEU_BOOK_REGISTRY || {});
  };

  async function testPseuPdfRender(bookId) {
    const registry = window.PSEU_BOOK_REGISTRY || {};
    const books = normalizeList(registry.books);
    const book = books.find((item) => item.id === bookId || item.slug === bookId || String(item.number) === String(bookId));

    if (!book) {
      console.error(`[PSEU PDF ERROR] Livro não encontrado: ${bookId}`);
      return null;
    }

    if (!window.pdfjsLib) {
      console.error(`[PSEU PDF ERROR] pdfjsLib indisponível para teste: ${book.title}`);
      return null;
    }

    const pdfUrl = toUrl(book.pdf || "");
    console.log(`[PSEU PDF CHECK] Teste manual iniciado: ${book.title}`);
    console.log(`[PSEU PDF CHECK] PDF URL: ${pdfUrl}`);

    try {
      const probe = await fetch(pdfUrl, { cache: "no-store" });
      console.log(`[PSEU PDF CHECK] Fetch status: ${probe.status}`);
      console.log(`[PSEU PDF CHECK] Content-Type: ${probe.headers.get("content-type") || "desconhecido"}`);
    } catch (error) {
      console.warn(`[PSEU PDF WARNING] Probe de fetch falhou: ${error?.message || error}`);
    }

    const doc = await window.pdfjsLib.getDocument({ url: pdfUrl }).promise;
    console.log(`[PSEU PDF CHECK] PDF carregado: ${doc.numPages} páginas`);
    const page = await doc.getPage(1);
    console.log("[PSEU PDF CHECK] Página 1 carregada");

    const viewport = page.getViewport({ scale: 1.4 });
    console.log(`[PSEU PDF CHECK] Viewport: ${Math.round(viewport.width)}x${Math.round(viewport.height)}`);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    canvas.style.position = "fixed";
    canvas.style.right = "16px";
    canvas.style.bottom = "16px";
    canvas.style.zIndex = "99999";
    canvas.style.border = "1px solid rgba(255,255,255,0.2)";
    canvas.style.background = "#000";
    document.body.appendChild(canvas);

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      console.error("[PSEU PDF ERROR] Canvas 2D indisponível no teste manual");
      return null;
    }

    console.log("[PSEU PDF CHECK] RenderTask iniciado");
    await page.render({
      canvasContext: context,
      viewport,
      background: "rgba(0,0,0,1)",
    }).promise;
    console.log("[PSEU PDF CHECK] RenderTask concluído");
    return canvas;
  }

  window.testPseuPdfRender = testPseuPdfRender;

  function setActiveBook(book) {
    if (!DEV || !book) return;
    const session = ensureSession(book);
    if (!session) return;
    session.activePage = 1;
    session.loadedPages.clear();
    session.coverReady = false;
    session.spreadReady = false;
    session.navigationChecked = false;
    session.savedChecked = false;
  }

  function markFrameLoaded(book, page, role) {
    if (!DEV || !book) return;
    const session = ensureSession(book);
    if (!session) return;

    const currentPage = Number(page || 0);
    if (currentPage > 0) {
      session.loadedPages.add(currentPage);
      session.activePage = currentPage;
    }

    if (currentPage === 1 && !session.coverReady) {
      session.coverReady = true;
      log("CHECK", `Capa OK: ${book.title}`);
    }

    if (!session.spreadReady && session.loadedPages.has(2) && session.loadedPages.has(3)) {
      session.spreadReady = true;
      log("CHECK", `Spread inicial OK: ${book.title}`);
    }

    if (role && currentPage > 1) {
      log("CHECK", `Pagina OK: ${book.title} | ${role} | p.${currentPage}`);
    }
  }

  function markFrameError(book, page, role, message) {
    if (!DEV || !book) return;
    const label = page === 1 ? "capa" : `pagina ${page}`;
    log("ERROR", `${book.title}: falha ao carregar ${label}${role ? ` (${role})` : ""}${message ? ` - ${message}` : ""}`);
  }

  function markNavigation(book, page, direction) {
    if (!DEV || !book) return;
    const session = ensureSession(book);
    if (!session) return;
    if (page === session.activePage && session.navigationChecked) return;
    session.activePage = page;
    session.navigationChecked = true;
    log("CHECK", `Navegacao OK: ${book.title} | ${direction || "step"} | p.${page}`);
  }

  function markSave(book, payload = {}) {
    if (!DEV || !book) return;
    const session = ensureSession(book);
    if (!session || session.savedChecked && session.activePage === payload.activePage) return;
    session.savedChecked = true;
    log("CHECK", `Progresso salvo: ${book.title} | pagina ${payload.activePage || 1} | ${payload.progress ?? 0}%`);
  }

  window.PSEU_BOOK_DIAGNOSTICS = {
    runCatalogDiagnostics,
    setActiveBook,
    markFrameLoaded,
    markFrameError,
    markNavigation,
    markSave,
  };
})();
