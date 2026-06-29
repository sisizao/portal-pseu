(function () {
  const eventName = "pseu:content-provisioning-updated";
  const state = {
    books: {},
    videos: {},
    checks: new Map(),
    config: {
      books: [],
      coverAssets: {},
      backendBookIds: {},
      fragmentBookId: "",
      fragmentSource: "",
      videos: {}
    }
  };

  function toAbsoluteUrl(path) {
    if (!path) return "";

    try {
      return new URL(path, window.location.href).href;
    } catch (error) {
      return path;
    }
  }

  function createAsset(source) {
    return {
      configured: Boolean(source),
      available: source ? null : false,
      source: source || "",
      checkedAt: null
    };
  }

  function updateAsset(asset, available, source) {
    asset.available = available;
    asset.source = source || asset.source;
    asset.configured = Boolean(asset.source);
    asset.checkedAt = new Date().toISOString();
  }

  function emit(kind, id) {
    window.dispatchEvent(new CustomEvent(eventName, {
      detail: { kind, id, state }
    }));
  }

  function ensureBook(book) {
    if (!book?.id) return null;

    const existing = state.books[book.id] || {};
    state.books[book.id] = {
      id: book.id,
      backendBookId: existing.backendBookId || "",
      cover: existing.cover || createAsset(""),
      fragment: existing.fragment || createAsset(""),
      privatePdf: existing.privatePdf || createAsset("")
    };

    return state.books[book.id];
  }

  async function checkUrl(path) {
    const url = toAbsoluteUrl(path);
    if (!url) return false;

    try {
      if (new URL(url).origin !== window.location.origin) return null;
    } catch (error) {
      return null;
    }

    if (state.checks.has(url)) return state.checks.get(url);

    const check = (async () => {
      try {
        const head = await fetch(url, { method: "HEAD", cache: "no-store" });
        if (head.ok) return true;
        if (head.status !== 403 && head.status !== 405) return false;
      } catch (error) {
        // Some hosts block HEAD. The ranged GET below keeps the check light.
      }

      try {
        const response = await fetch(url, {
          method: "GET",
          cache: "no-store",
          headers: { Range: "bytes=0-0" }
        });
        return response.ok;
      } catch (error) {
        return false;
      }
    })();

    state.checks.set(url, check);
    return check;
  }

  function registerBooks(books, options = {}) {
    state.config.books = Array.isArray(books) ? books : [];
    state.config.coverAssets = options.coverAssets || {};
    state.config.backendBookIds = options.backendBookIds || {};
    state.config.fragmentBookId = options.fragmentBookId || "";
    state.config.fragmentSource = options.fragmentSource || "";

    state.config.books.forEach((book) => {
      const record = ensureBook(book);
      if (!record) return;

      record.backendBookId = state.config.backendBookIds[book.id] || record.backendBookId || "";
      if (!record.cover.source) {
        record.cover = createAsset(book.cover || state.config.coverAssets[book.number] || "");
      }

      if (book.id === state.config.fragmentBookId) {
        if (!record.fragment.source) record.fragment = createAsset(state.config.fragmentSource);
      }
    });

    return state.books;
  }

  function registerVideos(videos = {}) {
    state.config.videos = videos || {};

    Object.entries(state.config.videos).forEach(([key, media]) => {
      state.videos[key] = state.videos[key] || {
        video: createAsset(media.video),
        posterDesktop: createAsset(media.posterDesktop),
        posterMobile: createAsset(media.posterMobile)
      };
    });

    return state.videos;
  }

  async function verifyBookCover(book) {
    const record = ensureBook(book);
    if (!record) return null;

    const candidates = [book.cover, state.config.coverAssets[book.number]]
      .filter(Boolean)
      .filter((path, index, list) => list.indexOf(path) === index);

    record.cover = createAsset(candidates[0] || "");

    let hasUnknownCandidate = false;
    for (const candidate of candidates) {
      const available = await checkUrl(candidate);
      if (available === true) {
        updateAsset(record.cover, true, candidate);
        emit("book", book.id);
        return record.cover;
      }
      if (available === null) hasUnknownCandidate = true;
    }

    updateAsset(record.cover, hasUnknownCandidate ? null : false, candidates[0] || "");
    emit("book", book.id);
    return record.cover;
  }

  async function verifyBookFragment(book) {
    const record = ensureBook(book);
    if (!record || book.id !== state.config.fragmentBookId) return null;

    record.fragment = createAsset(state.config.fragmentSource);
    updateAsset(record.fragment, await checkUrl(state.config.fragmentSource), state.config.fragmentSource);
    emit("book", book.id);
    return record.fragment;
  }

  async function verifyVideo(key, media) {
    const record = state.videos[key] || {
      video: createAsset(media.video),
      posterDesktop: createAsset(media.posterDesktop),
      posterMobile: createAsset(media.posterMobile)
    };

    state.videos[key] = record;

    record.video = createAsset(media.video);
    record.posterDesktop = createAsset(media.posterDesktop);
    record.posterMobile = createAsset(media.posterMobile);

    if (media.video) updateAsset(record.video, await checkUrl(media.video), media.video);
    if (media.posterDesktop) updateAsset(record.posterDesktop, await checkUrl(media.posterDesktop), media.posterDesktop);
    if (media.posterMobile) updateAsset(record.posterMobile, await checkUrl(media.posterMobile), media.posterMobile);

    emit("video", key);
    return record;
  }

  async function verifyAll() {
    const books = state.config.books || [];
    const videos = state.config.videos || {};

    await Promise.all([
      ...books.map((book) => verifyBookCover(book)),
      ...books.map((book) => verifyBookFragment(book)),
      ...Object.entries(videos).map(([key, media]) => verifyVideo(key, media))
    ]);

    return state;
  }

  function applyProtectedBooksPayload(entries) {
    if (!Array.isArray(entries)) return state.books;

    entries.forEach((entry) => {
      const localId = Object.entries(state.config.backendBookIds)
        .find(([, backendId]) => backendId === entry.bookId)?.[0];

      if (!localId) return;

      const record = ensureBook({ id: localId });
      if (!record) return;

      record.backendBookId = entry.bookId || record.backendBookId;

      if (entry.provisioning?.privatePdf) {
        record.privatePdf = {
          ...createAsset(entry.pdfEndpoint || ""),
          ...entry.provisioning.privatePdf
        };
      }

      emit("book", localId);
    });

    return state.books;
  }

  function getBook(id) {
    return state.books[id] || null;
  }

  function getVideo(key) {
    return state.videos[key] || null;
  }

  window.PSEU_CONTENT_PROVISIONING = {
    eventName,
    state,
    registerBooks,
    registerVideos,
    verifyAll,
    checkUrl,
    applyProtectedBooksPayload,
    book: getBook,
    video: getVideo
  };
})();
