(function () {
  const DEFAULT_ATMOSPHERE = {
    mood: "neutral",
    primaryColor: "#D4AF37",
    secondaryColor: "#2B1D4F",
    glow: "soft",
    particles: "minimal",
    background: "dark-stone",
    intensity: "low",
  };

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function asArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value) return [];
    return [value].filter(Boolean);
  }

  function normalizeAtmosphere(input = {}) {
    return {
      ...DEFAULT_ATMOSPHERE,
      ...input,
    };
  }

  function normalizeTheme(input, source = {}) {
    if (!input) {
      return {
        name: source.stage || "default",
        tone: source.stage || "neutral",
        accent: "gold",
        surface: "stone",
      };
    }

    if (typeof input === "string") {
      return {
        name: input,
        tone: source.stage || "neutral",
        accent: "gold",
        surface: "stone",
      };
    }

    return {
      name: input.name || source.stage || "default",
      tone: input.tone || source.stage || "neutral",
      accent: input.accent || "gold",
      surface: input.surface || "stone",
      ...input,
    };
  }

  function resolveCover(raw, context = {}) {
    return raw.cover || context.coverAssets?.[raw.number] || "";
  }

  function normalizeText(value, fallback = "") {
    return value == null ? fallback : String(value);
  }

  function createBook(raw = {}, context = {}) {
    const number = Number(raw.number || context.order || 0);
    const title = normalizeText(raw.title);
    const slug = raw.slug || slugify(raw.id || title || `book-${number}`);
    const shortDescription = normalizeText(raw.shortDescription || raw.summary || raw.caption || "");
    const longDescription = normalizeText(raw.longDescription || raw.caption || raw.readerSubtitle || shortDescription);
    const subtitle = normalizeText(raw.subtitle || raw.readerSubtitle || "");
    const pillar = normalizeText(raw.pillar || raw.act || "");
    const category = normalizeText(raw.category || "");
    const pdf = normalizeText(raw.pdf || "");
    const cover = resolveCover(raw, context);
    const totalPages = raw.totalPages ?? raw.pageCount ?? null;
    const order = Number.isFinite(Number(raw.order)) ? Number(raw.order) : number;
    const progress = Number.isFinite(Number(raw.progress)) ? Number(raw.progress) : 0;
    const status = normalizeText(raw.status || (raw.available === false ? "unavailable" : "available"));
    const available = typeof raw.available === "boolean" ? raw.available : status !== "em breve" && status !== "unavailable" && status !== "draft";
    const featured = typeof raw.featured === "boolean" ? raw.featured : order > 0 && order <= 2;
    const atmosphere = normalizeAtmosphere(raw.atmosphere);
    const theme = normalizeTheme(raw.theme, raw);
    const tags = asArray(raw.tags);

    return {
      ...raw,
      id: raw.id || slug,
      slug,
      number: Number.isFinite(number) && number > 0 ? number : raw.number || 0,
      order,
      title,
      subtitle,
      category,
      pillar,
      shortDescription,
      longDescription,
      summary: shortDescription,
      caption: longDescription,
      readerSubtitle: subtitle,
      cover,
      pdf,
      status,
      totalPages,
      pageCount: raw.pageCount ?? totalPages ?? 999,
      progress,
      atmosphere,
      theme,
      tags,
      featured,
      available,
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
    };
  }

  function validateBook(book) {
    const errors = [];

    if (!book || typeof book !== "object") {
      errors.push("book must be an object");
    } else {
      if (!book.id) errors.push("missing id");
      if (!book.slug) errors.push("missing slug");
      if (!book.title) errors.push("missing title");
      if (!book.pdf) errors.push("missing pdf");
      if (!Number.isFinite(Number(book.order))) errors.push("missing order");
      if (!book.atmosphere || typeof book.atmosphere !== "object") errors.push("missing atmosphere");
      if (book.totalPages != null && !Number.isFinite(Number(book.totalPages))) errors.push("totalPages must be numeric when present");
      if (book.pageCount != null && !Number.isFinite(Number(book.pageCount))) errors.push("pageCount must be numeric when present");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  function buildBookRegistry(rawRegistry = {}) {
    const coverAssets = rawRegistry.coverAssets || {};
    const books = (rawRegistry.books || []).map((book) => createBook(book, { coverAssets }));
    const validation = books.map((book) => ({ id: book.id, ...validateBook(book) })).filter((item) => !item.valid);

    return {
      coverAssets,
      books,
      validation,
    };
  }

  window.PSEU_BOOK_CONFIG = {
    DEFAULT_ATMOSPHERE,
    slugify,
    createBook,
    validateBook,
    buildBookRegistry,
    normalizeAtmosphere,
    normalizeTheme,
  };
})();
