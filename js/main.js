document.addEventListener("DOMContentLoaded", () => {
  const registry = window.PSEU_BOOK_REGISTRY || { coverAssets: {}, books: [] };
  const coverAssets = registry.coverAssets || {};
  const books = (registry.books || []).map((book) => ({
    ...book,
    atmosphere: { ...(book.atmosphere || {}) },
  }));
  const contentProvisioning = window.PSEU_CONTENT_PROVISIONING || null;

  const state = {
    activeIndex: 0,
    activeChapterIndex: 0,
    activePage: 1,
    resumePage: 1,
    readerMode: "cover",
    search: "",
    renderToken: 0,
    pendingFrames: 0,
    turnDirection: "forward",
    swipeStartX: 0,
    swipeStartY: 0,
    swipeActive: false,
    controlsVisible: false,
    controlsTimer: 0,
    readerError: "",
    lastBookId: "",
    bookStates: {},
    favoriteBooks: [],
    bookmarks: {},
    lastOpenedBooks: [],
    lastOpenedAt: null,
    readerScope: null,
    readerReturnScrollY: 0,
    portalUnlocked: false,
    funnelUnlockedStage: 1,
    protectedBooks: {
      loaded: false,
      loading: false,
      error: "",
      byId: {},
    },
    recoveredArchives: {
      unlocked: 1,
      completed: [],
      activeIndex: 0,
      progress: {},
      watch: {},
      seeking: false,
    },
    traversalNotebook: {
      version: 1,
      entries: {},
      activeBookId: "",
    },
    continuity: {
      version: 1,
      lastFunnelStage: 1,
      maxFunnelStage: 1,
      fragmentsRead: [],
      lastVideoId: "",
      videos: {},
      updatedAt: null,
    },
  };

  const pdfSourceCache = new Map();
  const pdfDocumentCache = new Map();
  const funnelControlsTimers = new Map();
  const funnelProgressSavedAt = new Map();
  const CONTINUITY_STORAGE_KEY = "pseu.portal.continuity.v1";
  const TRAVERSAL_NOTEBOOK_STORAGE_KEY = "pseu.portal.traversalNotebook.v1";
  const FUNNEL_PROGRESS_SAVE_MS = 3500;
  const FRAGMENT_BOOK_ID = "despertar";
  const FRAGMENT_ALLOWED_PAGES = [3, 13, 19, 31, 51];
  const FRAGMENT_PDF_SOURCE = "/fragmentos/manual-do-despertar.pdf";
  const FRAGMENT_PAGE_MAP = {
    3: 1,
    13: 2,
    19: 3,
    31: 4,
    51: 5,
  };
  const BACKEND_BOOK_ID_ALIASES = {
    "manual-do-despertar": "despertar",
    "manual-do-lider-estoico": "lider-estoico",
    "manual-do-vilao": "manual-do-vilao-que-ousa-questionar-a-luz",
    "a-dor-invisivel": "a-dor-invisivel",
    "a-verdade-como-mentira": "a-verdade-como-mentira",
    "ebook-de-produtividade": "e-book-de-produtividade",
    "ebook-de-depressao": "e-book-de-depressao",
    "olho-no-olho": "olho-no-olho",
    "capacitacao-financeira": "capacitacao-financeira",
    "psicologia-do-day-trader": "psicologia-do-day-trader",
    "o-codigo-da-mente": "o-codigo-da-mente",
    "a-rebeliao-silenciosa": "a-rebeliao-silenciosa",
    "manual-do-subconsciente": "manual-do-subconsciente",
    "o-efeito-da-dupla-fenda": "o-efeito-da-dupla-fenda",
    "o-codigo-oculto-do-governo": "o-codigo-oculto-do-governo",
    "o-despertar-da-realidade": "o-despertar-da-realidade",
    "os-segredos-dos-illuminati": "os-segredos-dos-illuminati",
    "o-livro-18-a-chave": "o-livro-18-a-chave",
  };
  const LOCAL_BOOK_ID_TO_BACKEND = Object.fromEntries(
    Object.entries(BACKEND_BOOK_ID_ALIASES).map(([backendId, localId]) => [localId, backendId])
  );
  const FRAGMENT_ECHOS = [
    { page: 3, label: "Eco 01 · Ruptura", copy: "O primeiro eco rompe a superfície." },
    { page: 13, label: "Eco 02 · Resistência", copy: "A mente tenta conservar o que já deixou de servir." },
    { page: 19, label: "Eco 03 · Colapso", copy: "O silêncio pesa quando a antiga forma começa a ceder." },
    { page: 31, label: "Eco 04 · Reconstrução", copy: "Depois da queda, a consciência reaprende a permanecer." },
    { page: 51, label: "Eco 05 · Porta final", copy: "A última página revelada não conclui. Ela aponta para além." },
  ];
  let activeFragmentEcho = 0;
  const TRAVERSAL_CONTEXTS = {
    "funil-chamado": "call",
    "funil-biblioteca": "library",
    "funil-travessia": "travessia",
    "portal-interno": "portal",
  };
  const PSEU_HASH_ROUTES = {
    "#chamado": "funil-chamado",
    "#funil-chamado": "funil-chamado",
    "#biblioteca": "funil-biblioteca",
    "#funil-biblioteca": "funil-biblioteca",
    "#travessia": "funil-travessia",
    "#funil-travessia": "funil-travessia",
    "#oferta": "funil-oferta",
    "#funil-oferta": "funil-oferta",
    "#portal": "portal-interno",
    "#portal-interno": "portal-interno",
  };
  const PSEU_SECTION_HASHES = {
    "funil-chamado": "#chamado",
    "funil-biblioteca": "#biblioteca",
    "funil-travessia": "#travessia",
    "funil-oferta": "#oferta",
    "portal-interno": "#portal",
  };
  const PDF_JS_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const PDF_DEBUG = Boolean(window.PSEU_DEV_MODE);
  const PREPORTAL_CONFIG = window.PSEU_PREPORTAL_CONFIG || window.PSEU_FUNNEL_CONFIG || {};
  const CHECKOUT_CONFIG_ENDPOINT = "/api/checkout/config";
  const FUNNEL_MEDIA = {
    main: {
      title: "Travessia",
      video: PREPORTAL_CONFIG.vsl?.main?.url || window.VSL_PRINCIPAL_URL || "0509 vsl 1 de cima Pseu.mp4",
      posterDesktop: PREPORTAL_CONFIG.vsl?.main?.posterDesktop || window.POSTER_VSL_PRINCIPAL || "PCL/assets/images/visuals/vsl-main-16x9.svg",
      posterMobile: PREPORTAL_CONFIG.vsl?.main?.posterMobile || window.POSTER_VSL_PRINCIPAL_MOBILE || "PCL/assets/images/visuals/vsl-main-9x16.svg",
      description: "Apresenta o portal, abre o contexto e cria conexão emocional antes da decisão.",
    },
    offer: {
      title: "Decisão",
      video: PREPORTAL_CONFIG.vsl?.offer?.url || window.VSL_OFERTA_URL || "IMG_6166.MOV",
      posterDesktop: PREPORTAL_CONFIG.vsl?.offer?.posterDesktop || window.POSTER_VSL_OFERTA || "PCL/assets/images/visuals/vsl-offer-16x9.svg",
      posterMobile: PREPORTAL_CONFIG.vsl?.offer?.posterMobile || window.POSTER_VSL_OFERTA_MOBILE || "PCL/assets/images/visuals/vsl-offer-9x16.svg",
      description: "A camada mais direta, dourada e quieta. Um convite para entrar sem ruído.",
    },
  };
  window.PSEU_FUNNEL_CONFIG = FUNNEL_MEDIA;
  // Troque estes caminhos quando os videos provisórios forem substituídos.
  const RECOVERED_ARCHIVE_FILES = [
    { index: 1, title: "ARQUIVO 01", status: "Transmissão recuperada / 01", video: "escesqueleto/IMG_6443video 1.MP4" },
    { index: 2, title: "ARQUIVO 02", status: "Transmissão recuperada / 02", video: "escesqueleto/IMG_6445video 2.MP4" },
    { index: 3, title: "ARQUIVO 03", status: "Transmissão recuperada / 03", video: "escesqueleto/IMG_6446video 3.MOV" },
  ];
  const RECOVERED_ARCHIVE_UNLOCK_RATIO = 0.9;
  let recoveredArchiveNoticeTimer = 0;
  let checkoutConfigPromise = null;
  let contentProvisioningRefreshTimer = 0;

  function trackAnalytics(eventName, options = {}) {
    window.PSEU_ANALYTICS?.track?.(eventName, options);
  }

  function pdfDebug(kind, message, extra) {
    if (!PDF_DEBUG) return;
    const prefix = `[PSEU PDF ${kind}]`;
    const payload = extra === undefined ? `${prefix} ${message}` : `${prefix} ${message} | ${extra}`;
    if (kind === "ERROR") console.error(payload);
    else if (kind === "WARNING") console.warn(payload);
    else console.log(payload);
  }

  const els = {
    body: document.body,
    preportal: document.getElementById("funil"),
    appShell: document.getElementById("portal-interno"),
    sidebar: document.querySelector(".sidebar"),
    readerLayout: document.getElementById("leitura"),
    readerContent: document.querySelector(".reader-content"),
    readerControls: document.querySelector("[data-reader-controls]"),
    readerBookStage: document.querySelector("[data-reader-book-stage]"),
    readerBookTitle: document.querySelector("[data-reader-book-title]"),
    readerPageLabel: document.querySelector("[data-reader-page-label]"),
    readerProgressLabel: document.querySelector("[data-reader-progress-label]"),
    readerSpreadLabel: document.querySelector("[data-reader-spread-label]"),
    readerMediaCover: document.getElementById("pdf-media-cover"),
    readerMediaLeft: document.getElementById("pdf-media-left"),
    readerMediaRight: document.getElementById("pdf-media-right"),
    pdfFrameCover: document.getElementById("pdf-frame-cover"),
    pdfFrameLeft: document.getElementById("pdf-frame-left"),
    pdfFrameRight: document.getElementById("pdf-frame-right"),
    readerCanvasCover: document.getElementById("pdf-canvas-cover"),
    readerCanvasLeft: document.getElementById("pdf-canvas-left"),
    readerCanvasRight: document.getElementById("pdf-canvas-right"),
    libraryGrid: document.getElementById("library-grid"),
    funnelBooks: document.querySelector("[data-funnel-books]"),
    libraryKeyFinal: document.querySelector("[data-library-key-final]"),
    funnelVideos: document.querySelectorAll("[data-funnel-video]"),
    funnelPlayButtons: document.querySelectorAll("[data-funnel-play]"),
    funnelCommandButtons: document.querySelectorAll("[data-funnel-command]"),
    funnelVolumeInputs: document.querySelectorAll("[data-funnel-volume]"),
    funnelResumeButtons: document.querySelectorAll("[data-vsl-resume]"),
    funnelResumeStates: document.querySelectorAll("[data-vsl-resume-state]"),
    recoveredArchives: document.querySelector("[data-recovered-archives]"),
    recoveredArchiveEnter: document.querySelector("[data-recovered-enter]"),
    recoveredArchiveButtons: document.querySelectorAll("[data-recovered-open]"),
    recoveredArchiveStates: document.querySelectorAll("[data-recovered-file-state]"),
    recoveredArchiveScreen: document.querySelector("[data-recovered-screen]"),
    recoveredArchiveVideo: document.querySelector("[data-recovered-video]"),
    recoveredArchiveTitle: document.querySelector("[data-recovered-title]"),
    recoveredArchiveStatus: document.querySelector("[data-recovered-status]"),
    recoveredArchiveNotice: document.querySelector("[data-recovered-notice]"),
    recoveredArchiveClose: document.querySelector("[data-recovered-close]"),
    recoveredArchiveOfferPoint: document.querySelector(".travessia-official__offer-prologue"),
    chapterList: document.getElementById("chapter-list"),
    imageStack: document.getElementById("image-stack"),
    pageStrip: document.getElementById("page-strip"),
    totalProgress: document.querySelector("[data-total-progress]"),
    currentPhase: document.querySelector("[data-current-phase]"),
    heroTitle: document.querySelector("[data-hero-title]"),
    heroCopy: document.querySelector("[data-hero-copy]"),
    heroPhrase: document.querySelector("[data-hero-phrase]"),
    heroCover: document.querySelector("[data-hero-cover]"),
    bookProgress: document.querySelector("[data-book-progress]"),
    readerSubtitle: document.querySelector("[data-reader-subtitle]"),
    libraryNotes: document.querySelectorAll("[data-library-note]"),
    recentAccesses: document.querySelector("[data-recent-accesses]"),
    recentAccessList: document.querySelector("[data-recent-access-list]"),
    portalMemoryCount: document.querySelector("[data-portal-memory-count]"),
    portalMemoryCopy: document.querySelector("[data-portal-memory-copy]"),
    continuityWhisper: document.querySelector("[data-continuity-whisper]"),
    continuityEyebrow: document.querySelector("[data-continuity-eyebrow]"),
    continuityCopy: document.querySelector("[data-continuity-copy]"),
    continuityAction: document.querySelector("[data-continuity-action]"),
    fragmentReader: document.querySelector("[data-fragment-reader]"),
    fragmentFrame: document.querySelector("[data-fragment-frame]"),
    fragmentLabel: document.querySelector("[data-fragment-label]"),
    fragmentCopy: document.querySelector("[data-fragment-copy]"),
    fragmentProgress: document.querySelector("[data-fragment-progress]"),
    fragmentEnding: document.querySelector("[data-fragment-ending]"),
    fragmentOpen: document.querySelector("[data-fragment-open]"),
    fragmentCloseButtons: document.querySelectorAll("[data-fragment-close]"),
    fragmentPrev: document.querySelector("[data-fragment-prev]"),
    fragmentNext: document.querySelector("[data-fragment-next]"),
    preportalPages: document.querySelectorAll(".preportal-page"),
    readerClose: document.querySelector("[data-reader-close]"),
    mobileDrawerOpen: document.querySelector("[data-mobile-drawer-open]"),
    mobileDrawerClose: document.querySelector("[data-mobile-drawer-close]"),
    mobileDrawerBackdrop: document.querySelector("[data-mobile-drawer-backdrop]"),
    traversalVeil: document.querySelector("[data-traversal-veil]"),
    readerDebug: document.createElement("div"),
    prevChapter: document.querySelector("[data-reader-prev]"),
    nextChapter: document.querySelector("[data-reader-next]"),
    searchInput: document.getElementById("search-input"),
    navItems: document.querySelectorAll("[data-nav]"),
    actPills: document.querySelectorAll("[data-act-pill]"),
    focusFrame: document.querySelector("[data-focus-frame]"),
    readerFavorite: document.querySelector("[data-reader-favorite]"),
    readerMark: document.querySelector("[data-reader-mark]"),
    readerToast: document.querySelector("[data-reader-toast]"),
    missionTitle: document.querySelector("[data-mission-title]"),
    missionCopy: document.querySelector("[data-mission-copy]"),
    missionProgress: document.querySelector("[data-mission-progress]"),
    personalArchiveList: document.querySelector("[data-personal-archive-list]"),
    observerLog: document.querySelector("[data-observer-log]"),
    myRecordsList: document.querySelector("[data-my-records-list]"),
    notebookDrawer: document.querySelector("[data-traversal-notebook]"),
    notebookOpenButtons: document.querySelectorAll("[data-notebook-open]"),
    notebookCloseButtons: document.querySelectorAll("[data-notebook-close]"),
    notebookBookTitle: document.querySelector("[data-notebook-book-title]"),
    notebookMeta: document.querySelector("[data-notebook-meta]"),
    notebookText: document.querySelector("[data-notebook-text]"),
    notebookStatus: document.querySelector("[data-notebook-status]"),
    notebookPageButton: document.querySelector("[data-notebook-page]"),
  };

  const saved = readSavedState();
  if (saved) {
    state.activeIndex = clamp(saved.activeIndex, 0, books.length - 1);
    state.activeChapterIndex = clamp(saved.activeChapterIndex, 0, 99);
    state.activePage = clamp(saved.activePage, 1, books[state.activeIndex]?.pageCount || 999);
    state.resumePage = clamp(saved.resumePage || saved.activePage || 1, 1, books[state.activeIndex]?.pageCount || 999);
    state.lastBookId = saved.lastBookId || books[state.activeIndex]?.id || "";
    state.bookStates = saved.bookStates || {};
    state.favoriteBooks = Array.isArray(saved.favoriteBooks) ? saved.favoriteBooks : [];
    state.bookmarks = saved.bookmarks && typeof saved.bookmarks === "object" ? saved.bookmarks : {};
    state.lastOpenedBooks = Array.isArray(saved.lastOpenedBooks) ? saved.lastOpenedBooks : [];
    state.lastOpenedAt = saved.lastOpenedAt || null;
    state.portalUnlocked = Boolean(saved.portalUnlocked);
    if (books[state.activeIndex]) {
      books[state.activeIndex].lastPage = state.activePage;
    }
    books.forEach((book) => {
      const savedBook = state.bookStates?.[book.id];
      if (savedBook?.page) {
        book.lastPage = clamp(savedBook.page, 1, book.pageCount || 999);
      }
    });
  }

  if (!state.portalUnlocked) {
    state.portalUnlocked = localStorage.getItem("pseu.portal.unlocked") === "1";
  }
  state.continuity = readContinuityState();
  state.traversalNotebook = readTraversalNotebook();

  if (isProtectedPortalPath()) {
    state.portalUnlocked = true;
    els.body.classList.add("is-protected-portal");
    isolateExternalFunnelForProtectedPortal();
  } else {
    state.portalUnlocked = false;
    try {
      localStorage.removeItem("pseu.portal.unlocked");
    } catch {}
  }
  els.body.classList.toggle("is-portal-unlocked", state.portalUnlocked);

  setupContentProvisioning();
  setupProtectedBooksBridge();
  startPortalEntrance();
  renderLibrary();
  renderFunnelSection();
  enhanceSensoryLettering();
  syncFunnelMedia();
  mountRecoveredArchiveScreen();
  updateRecoveredArchiveUi();
  bindInteractions();
  setupContinuityObservers();
  mountReaderDebugPanel();
  setupPdfJs();
  selectBook(state.activeIndex, { preservePage: Boolean(saved), open: false, trackHistory: false });
  renderPortalMemory();
  renderOperations();
  updateContinuityUi();
  revealBlocks();
  applyInitialFunnelPage();
  setupHashRoutes();

  function bindInteractions() {
    els.searchInput?.addEventListener("input", (event) => {
      state.search = event.target.value.trim().toLowerCase();
      renderLibrary();
    });

    els.prevChapter?.addEventListener("click", () => navigateReaderPage(-1));
    els.nextChapter?.addEventListener("click", () => navigateReaderPage(1));

    els.mobileDrawerOpen?.addEventListener("click", openMobileDrawer);
    els.mobileDrawerClose?.addEventListener("click", closeMobileDrawer);
    els.mobileDrawerBackdrop?.addEventListener("click", closeMobileDrawer);
    els.sidebar?.addEventListener("pointerenter", expandOperationsSidebar);
    els.sidebar?.addEventListener("pointerleave", collapseOperationsSidebar);
    els.sidebar?.addEventListener("focusin", expandOperationsSidebar);
    els.sidebar?.addEventListener("focusout", (event) => {
      if (els.sidebar?.contains(event.relatedTarget)) return;
      collapseOperationsSidebar();
    });

    els.funnelPlayButtons.forEach((button) => {
      button.addEventListener("click", () => toggleFunnelVideo(button.dataset.funnelPlay));
    });

    els.funnelCommandButtons.forEach((button) => {
      button.addEventListener("click", () => handleFunnelCommand(button.dataset.funnelCommand, button.dataset.funnelTarget));
    });

    els.funnelVolumeInputs.forEach((input) => {
      input.addEventListener("input", () => setFunnelVolume(input.dataset.funnelVolume, Number(input.value)));
    });

    els.funnelResumeButtons.forEach((button) => {
      button.addEventListener("click", () => resumeFunnelVideo(button.dataset.vslResume));
    });

    els.recoveredArchiveEnter?.addEventListener("click", () => openRecoveredArchive(getNextRecoveredArchiveIndex()));
    els.recoveredArchiveButtons.forEach((button) => {
      button.addEventListener("click", () => openRecoveredArchive(Number(button.dataset.recoveredOpen)));
    });
    els.recoveredArchiveClose?.addEventListener("click", () => closeRecoveredArchive({ returnTarget: "gate" }));
    els.recoveredArchiveScreen?.addEventListener("click", (event) => {
      if (event.target === els.recoveredArchiveScreen) closeRecoveredArchive({ returnTarget: "gate" });
    });
    els.recoveredArchiveVideo?.addEventListener("play", resetRecoveredArchiveWatchAnchor);
    els.recoveredArchiveVideo?.addEventListener("seeking", markRecoveredArchiveSeeking);
    els.recoveredArchiveVideo?.addEventListener("seeked", resetRecoveredArchiveWatchAnchor);
    els.recoveredArchiveVideo?.addEventListener("ended", handleRecoveredArchiveEnded);
    els.recoveredArchiveVideo?.addEventListener("timeupdate", handleRecoveredArchiveTimeUpdate);

    document.querySelectorAll(".call-official__video, .travessia-entry-background-video, .travessia-entry-artifact__video").forEach((video) => {
      video.addEventListener("error", () => markPassiveVideoUnavailable(video));
      video.querySelectorAll("source").forEach((source) => {
        source.addEventListener("error", () => markPassiveVideoUnavailable(video));
      });
    });

    els.funnelVideos.forEach((video) => {
      const key = video.dataset.funnelVideo;
      const stage = video.closest(".funnel-vsl-stage");
      video.addEventListener("play", () => {
        video.closest(".funnel-vsl-card")?.classList.add("is-playing");
        rememberFunnelVideo(video, true);
        showFunnelControls(key);
        updateFunnelControls(key);
      });
      video.addEventListener("pause", () => {
        video.closest(".funnel-vsl-card")?.classList.remove("is-playing");
        rememberFunnelVideo(video, true);
        showFunnelControls(key, false);
        updateFunnelControls(key);
      });
      video.addEventListener("ended", () => {
        video.closest(".funnel-vsl-card")?.classList.remove("is-playing");
        rememberFunnelVideo(video, true);
        showFunnelControls(key, false);
        updateFunnelControls(key);
      });
      video.addEventListener("timeupdate", () => rememberFunnelVideo(video));
      video.addEventListener("loadedmetadata", () => {
        setFunnelVideoUnavailable(video, false);
        updateContinuityUi();
      });
      video.addEventListener("error", () => markFunnelVideoUnavailable(video));
      stage?.addEventListener("pointermove", () => showFunnelControls(key));
      stage?.addEventListener("pointerdown", () => showFunnelControls(key));
      stage?.addEventListener("pointerleave", () => scheduleHideFunnelControls(key, 900));
      stage?.addEventListener("touchstart", () => showFunnelControls(key), { passive: true });
      stage?.addEventListener("focusin", () => showFunnelControls(key, false));
      stage?.addEventListener("focusout", () => scheduleHideFunnelControls(key));
    });

    els.continuityAction?.addEventListener("click", handleContinuityAction);
    els.fragmentOpen?.addEventListener("click", () => openFragmentReader());
    els.fragmentCloseButtons.forEach((button) => button.addEventListener("click", closeFragmentReader));
    els.fragmentPrev?.addEventListener("click", () => navigateFragmentEcho(-1));
    els.fragmentNext?.addEventListener("click", () => navigateFragmentEcho(1));
    els.notebookOpenButtons.forEach((button) => button.addEventListener("click", () => openTraversalNotebook()));
    els.notebookCloseButtons.forEach((button) => button.addEventListener("click", closeTraversalNotebook));
    els.notebookText?.addEventListener("input", handleTraversalNotebookInput);
    els.notebookPageButton?.addEventListener("click", markTraversalNotebookPage);

    els.focusFrame?.addEventListener("pointermove", handleTilt);
    els.focusFrame?.addEventListener("pointerleave", resetTilt);
    els.focusFrame?.addEventListener("pointercancel", resetTilt);

    els.readerClose?.addEventListener("click", closeReader);
    els.readerLayout?.addEventListener("click", (event) => {
      if (event.target === els.readerLayout) closeReader();
    });
    els.readerLayout?.addEventListener("pointermove", handleReaderPointerMove);
    els.readerLayout?.addEventListener("pointerdown", handleReaderPointerMove);
    els.readerLayout?.addEventListener("pointerleave", scheduleHideReaderControls);
    els.readerControls?.addEventListener("pointerenter", () => showReaderControls(false));
    els.readerControls?.addEventListener("pointerleave", () => scheduleHideReaderControls());
    els.readerControls?.addEventListener("pointerup", () => {
      if (!isTouchReaderControls()) {
        document.activeElement?.blur?.();
        scheduleHideReaderControls(1400);
      }
    });
    els.readerControls?.addEventListener("focusin", () => showReaderControls(false));
    els.readerControls?.addEventListener("focusout", () => scheduleHideReaderControls());
    els.readerFavorite?.addEventListener("click", handleReaderFavorite);
    els.readerMark?.addEventListener("click", handleReaderBookmark);

    window.addEventListener("resize", () => {
      if (!isDesktopOperationsSidebar()) {
        els.appShell?.classList.remove("is-sidebar-expanded");
      }
      syncFunnelMedia();
    }, { passive: true });
    window.addEventListener("orientationchange", syncFunnelMedia);

    const handleReaderFrameLoad = (event) => {
      finalizeReaderFrameLoad(event.currentTarget);
    };

    [els.readerMediaCover, els.readerMediaLeft, els.readerMediaRight, els.pdfFrameCover, els.pdfFrameLeft, els.pdfFrameRight].forEach((frame) => {
      frame?.addEventListener("load", handleReaderFrameLoad);
      frame?.addEventListener("error", handleReaderFrameError);
    });

    els.readerBookStage?.addEventListener("pointerdown", handleBookSwipeStart);
    els.readerBookStage?.addEventListener("pointerup", handleBookSwipeEnd);
    els.readerBookStage?.addEventListener("pointercancel", resetBookSwipe);
    els.readerBookStage?.addEventListener("pointerleave", resetBookSwipe);

    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) return;

      if (isTraversalNotebookOpen()) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeTraversalNotebook();
        }
        if (event.key === "Tab") {
          trapTraversalNotebookFocus(event);
        }
        return;
      }

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      if (els.recoveredArchiveScreen && !els.recoveredArchiveScreen.hidden) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeRecoveredArchive({ returnTarget: "gate" });
        }
        return;
      }

      if (els.fragmentReader && !els.fragmentReader.hidden) {
        if (event.key === "ArrowLeft" || event.key === "PageUp") {
          event.preventDefault();
          navigateFragmentEcho(-1);
        }
        if (event.key === "ArrowRight" || event.key === "PageDown") {
          event.preventDefault();
          navigateFragmentEcho(1);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeFragmentReader();
        }
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        navigateReaderPage(-1);
      }

      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        navigateReaderPage(1);
      }

      if (event.key === "Home") {
        event.preventDefault();
        selectPage(1);
      }

      if (event.key === "End") {
        event.preventDefault();
        const book = getCurrentBook();
        selectPage(book.pageCount || state.activePage);
      }

      if (event.key === "Escape") {
        closeReader();
      }
    });

    document.addEventListener("click", (event) => {
      const observerButton = event.target.closest("[data-observer-book-index][data-observer-page]");
      if (observerButton) {
        const index = Number(observerButton.dataset.observerBookIndex);
        const page = Number(observerButton.dataset.observerPage);
        const book = books[index];
        if (!book || !isBookReadable(book)) return;
        selectBook(index, { open: false, trackHistory: true });
        selectPage(page);
        openReader();
        return;
      }

      const bookButton = event.target.closest("[data-book-index]");
      if (bookButton) {
        if (bookButton.closest(".preportal, .preportal-page")) {
          const book = books[Number(bookButton.dataset.bookIndex)];
          if (book?.id === FRAGMENT_BOOK_ID) {
            rememberFragmentRead(book);
            openFragmentReader({ track: false });
          }
          return;
        }
        if (bookButton.getAttribute("aria-disabled") === "true") return;
        selectBook(Number(bookButton.dataset.bookIndex));
        return;
      }

      const chapterButton = event.target.closest("[data-chapter-index]");
      if (chapterButton) {
        selectChapter(Number(chapterButton.dataset.chapterIndex));
        return;
      }

      const stopButton = event.target.closest("[data-stop-page]");
      if (stopButton) {
        selectPage(Number(stopButton.dataset.stopPage));
        return;
      }

      const navTarget = event.target.closest("[data-nav]");
      if (navTarget) {
        if (isProtectedPortalRoute() && isExternalFunnelTarget(navTarget.dataset.nav)) {
          openProtectedPortalEntry();
          return;
        }
        navigateToSection(navTarget.dataset.nav, { navTarget });
        return;
      }

      const action = event.target.closest("[data-action]");
      if (!action) return;

      if (action.dataset.action === "open") openReader();
      if (action.dataset.action === "continue") {
        openContinueReading();
      }
      if (action.dataset.action === "unlock-portal") {
        navigateToSection("portal-interno", {
          beforeReveal: () => unlockPortal({ scroll: false }),
          remember: false,
        });
      }
      if (action.dataset.action === "checkout-gumroad") {
        handleFinalCheckout().catch((error) => {
          console.warn("[PSEU CHECKOUT] Falha ao preparar checkout.", error);
          showCheckoutNotice("Checkout Gumroad ainda nao configurado. Tente novamente em instantes.");
        });
      }
      if (action.dataset.action === "logout") {
        handlePortalLogout(action).catch((error) => {
          console.warn("[PSEU AUTH] Falha ao encerrar sessao.", error);
          action.disabled = false;
          action.removeAttribute("aria-busy");
          window.alert?.("Nao foi possivel encerrar a sessao agora. Tente novamente.");
        });
      }
    });
  }

  function selectBook(index, options = {}) {
    const book = books[index];
    if (!book) return;

    if (options.readerScope === "fragment" && book.id === FRAGMENT_BOOK_ID) {
      state.readerScope = createFragmentReaderScope();
    } else {
      state.readerScope = null;
    }

    state.activeIndex = index;
    state.activePage = options.preservePage ? normalizeReaderPage(state.activePage, book) : 1;
    state.activeChapterIndex = chapterIndexForPage(book, state.activePage);
    state.resumePage = options.preservePage ? state.activePage : clamp(book.lastPage || 1, 1, book.pageCount || 999);
    const fragmentScope = isFragmentReaderScope(book);
    state.readerMode = readerModeFor(book, state.activePage);
    if (!fragmentScope) {
      state.lastBookId = book.id;
    }
    const storedBookState = state.bookStates[book.id] || {};
    if (!fragmentScope && (options.preservePage || !Number.isFinite(Number(storedBookState.page)))) {
      state.bookStates[book.id] = {
        ...storedBookState,
        page: state.activePage,
        chapterIndex: state.activeChapterIndex,
        progress: getBookProgress(book, state.activePage),
      };
    }
    state.readerError = "";
    delete els.body.dataset.readerError;
    els.readerDebug?.classList.remove("is-visible");

    document.body.dataset.theme = book.stage || "awakening";
    updateHero(book);
    renderChapterList(book);
    renderImageRail(book);
    renderPageStrip(book);
    updateLibrarySelection();
    updateActPills(book.act);
    updateProgressBadge(book);
    window.PSEU_BOOK_DIAGNOSTICS?.setActiveBook?.(book);
    if (!fragmentScope && options.trackHistory !== false) {
      touchLastOpenedBook(book, state.activePage);
    }
    if (!fragmentScope && isTraversalNotebookOpen()) {
      state.traversalNotebook.activeBookId = book.id;
      renderTraversalNotebook();
    }
    if (!fragmentScope) saveState();
    renderOperations();
    updateContinuityUi();
    const readerAlreadyOpen = Boolean(els.readerLayout?.classList.contains("is-open"));
    if (readerAlreadyOpen) {
      updateReader(book);
    }
    if (options.open !== false) openReader();
  }

  function selectChapter(index) {
    const book = getCurrentBook();
    if (!book?.chapters?.length) return;
    state.activeChapterIndex = wrap(index, book.chapters.length);
    selectPage(book.chapters[state.activeChapterIndex].page);
  }

  function selectPage(pageNumber) {
    const book = getCurrentBook();
    if (!book) return;

    const previousPage = state.activePage;
    const targetPage = normalizeReaderPage(pageNumber, book);
    syncFragmentEchoForPage(targetPage, book);
    state.turnDirection = targetPage >= state.activePage ? "forward" : "backward";
    state.activePage = targetPage;
    state.resumePage = targetPage;
    book.lastPage = targetPage;
    state.activeChapterIndex = chapterIndexForPage(book, state.activePage);
    const fragmentScope = isFragmentReaderScope(book);
    state.readerMode = readerModeFor(book, state.activePage);
    if (!fragmentScope) {
      state.lastBookId = book.id;
      state.bookStates[book.id] = {
        ...(state.bookStates[book.id] || {}),
        page: state.activePage,
        chapterIndex: state.activeChapterIndex,
        progress: getBookProgress(book, state.activePage),
      };
    }
    updateReader(book);
    updateChapterSelection();
    updatePageSelection();
    window.PSEU_BOOK_DIAGNOSTICS?.markNavigation?.(book, state.activePage, state.turnDirection);
    if (!fragmentScope) {
      touchLastOpenedBook(book, state.activePage);
      saveState();
    }
    renderOperations();
    updateContinuityUi();
    if (targetPage !== previousPage) {
      trackAnalytics(targetPage > previousPage ? "reader_page_advanced" : "reader_page_returned", {
        section: "reader",
        page: `reader-page-${targetPage}`,
        bookId: book.id,
        progress: getBookProgress(book, targetPage),
        details: {
          fromPage: previousPage,
          toPage: targetPage,
          direction: state.turnDirection,
        },
      });
    }
  }

  function navigateReaderPage(direction) {
    const book = getCurrentBook();
    if (!book) return;

    if (isFragmentReaderScope(book)) {
      navigateFragmentReaderPage(direction);
      return;
    }

    if (isCompactReader()) {
      selectPage(state.activePage + direction);
      return;
    }

    if (direction < 0) {
      if (state.activePage <= 2) {
        selectPage(1);
        return;
      }
      selectPage(state.activePage - 2);
      return;
    }

    if (state.activePage <= 1) {
      selectPage(2);
      return;
    }

    selectPage(state.activePage + 2);
  }

  function updateHero(book) {
    els.heroTitle.textContent = book.title;
    els.heroCopy.textContent = book.summary;
    els.heroPhrase.textContent = book.phrase;
    setProvisionedImage(els.heroCover, getProvisionedCoverSource(book), `Capa de ${book.title}`);
    els.bookProgress.style.width = `${getStoredBookProgress(book)}%`;
    updateReaderPulse(book, state.activePage);
  }

  function updateReader(book) {
    const maxPage = book.pageCount || Math.max(book.chapters?.at(-1)?.page || state.activePage, state.activePage);
    const fragmentScope = isFragmentReaderScope(book);
    state.readerMode = readerModeFor(book, state.activePage);
    const compact = state.readerMode === "single";
    const normalizedPage = normalizeReaderPage(state.activePage, book);
    if (normalizedPage !== state.activePage) state.activePage = normalizedPage;

    const chapter = chapterForPage(book, state.activePage);
    const pageMood = pageMoodFor(book, state.activePage);
    const spread = buildReaderSpread(book, state.activePage, compact, maxPage);
    const progress = getBookProgress(book, state.activePage);
    const captionText = spread.leftMood.copy || chapter?.note || book.caption || "Uma leitura íntima, sem ruído técnico.";

    pdfDebug("CHECK", `updateReader`, `${book.id} | page ${state.activePage} | mode ${spread.mode} | source=${readerSourceModeFor(book)}`);

    els.body.dataset.readerBook = book.id || "";
    els.body.dataset.pageMood = spread.leftMood.key;
    els.body.dataset.loading = "true";
    state.readerError = "";
    delete els.body.dataset.readerError;
    els.readerDebug?.classList.remove("is-visible");

    if (els.readerLayout) {
      els.readerLayout.dataset.mood = spread.leftMood.key;
      els.readerLayout.dataset.book = book.id || "";
      els.readerLayout.dataset.mode = spread.mode;
      els.readerLayout.style.setProperty("--reader-ambient-left-a", spread.leftAtmosphere.a);
      els.readerLayout.style.setProperty("--reader-ambient-left-b", spread.leftAtmosphere.b);
      els.readerLayout.style.setProperty("--reader-ambient-left-c", spread.leftAtmosphere.c);
      els.readerLayout.style.setProperty("--reader-ambient-left-image", spread.leftAtmosphere.image);
      els.readerLayout.style.setProperty("--reader-ambient-right-a", spread.rightAtmosphere.a);
      els.readerLayout.style.setProperty("--reader-ambient-right-b", spread.rightAtmosphere.b);
      els.readerLayout.style.setProperty("--reader-ambient-right-c", spread.rightAtmosphere.c);
      els.readerLayout.style.setProperty("--reader-ambient-right-image", spread.rightAtmosphere.image);
      els.readerLayout.style.setProperty("--reader-ambient-center-a", spread.centerAtmosphere.a);
      els.readerLayout.style.setProperty("--reader-ambient-center-b", spread.centerAtmosphere.b);
      els.readerLayout.style.setProperty("--reader-ambient-center-c", spread.centerAtmosphere.c);
      els.readerLayout.style.setProperty("--reader-ambient-center-image", spread.centerAtmosphere.image);
    }

    if (els.readerContent) {
      const usePdfAtmosphere = book.readerRenderMode === "pdf";
      els.readerContent.style.setProperty("--reader-shell-left-image", usePdfAtmosphere ? "none" : spread.leftAtmosphere.image);
      els.readerContent.style.setProperty("--reader-shell-right-image", usePdfAtmosphere ? "none" : spread.rightAtmosphere.image);
      els.readerContent.style.setProperty("--reader-shell-center-image", usePdfAtmosphere ? "none" : spread.centerAtmosphere.image);
    }

    const coverShell = els.pdfFrameCover?.closest(".reader-page-shell");
    const leftShell = els.pdfFrameLeft?.closest(".reader-page-shell");
    const rightShell = els.pdfFrameRight?.closest(".reader-page-shell");
    const usePdfAtmosphere = book.readerRenderMode === "pdf";
    coverShell?.style.setProperty("--reader-page-image", usePdfAtmosphere ? "none" : spread.centerAtmosphere.image);
    leftShell?.style.setProperty("--reader-page-image", usePdfAtmosphere ? "none" : spread.leftAtmosphere.image);
    rightShell?.style.setProperty("--reader-page-image", usePdfAtmosphere ? "none" : spread.rightAtmosphere.image);

    if (els.readerBookStage) {
      els.readerBookStage.dataset.mode = spread.mode;
      els.readerBookStage.dataset.turn = state.turnDirection;
      els.readerBookStage.dataset.spread = spread.mode === "spread" || spread.mode === "fragment-spread" ? "double" : "single";
      els.readerBookStage.classList.add("is-turning");
    }

    const fragmentEcho = fragmentScope ? getCurrentFragmentEcho() : null;
    if (els.readerBookTitle) els.readerBookTitle.textContent = fragmentScope ? `${book.title} · fragmento` : book.title;
    if (els.readerPageLabel) els.readerPageLabel.textContent = spread.pageLabel;
    if (els.readerProgressLabel) {
      els.readerProgressLabel.textContent = fragmentEcho
        ? spread.fragmentProgressLabel || `${String(activeFragmentEcho + 1).padStart(2, "0")} / ${String(FRAGMENT_ECHOS.length).padStart(2, "0")}`
        : `${progress}%`;
    }
    if (els.readerSpreadLabel) els.readerSpreadLabel.textContent = spread.spreadLabel;
    if (els.readerSubtitle) els.readerSubtitle.textContent = book.readerSubtitle || "Leitura interna";
    if (els.bookProgress) els.bookProgress.style.width = `${progress}%`;

    if (els.readerClose) {
      els.readerClose.title = spread.mode === "cover" ? "Fechar leitura" : "Fechar leitor imersivo";
    }
    if (els.readerControls) {
      els.readerControls.dataset.visible = state.controlsVisible ? "true" : "false";
    }
    updateReaderDebugPanel(book, spread, null);
    updateProgressBadge(book);
    updateReaderActions(book);
    refreshLibraryTiles();

    void queueReaderFrames(book, spread, compact);
    document.title = `Portal PSEU | ${book.title}`;
    if (els.readerLayout) {
      els.readerLayout.dataset.caption = captionText;
      els.readerLayout.dataset.mood = spread.leftMood.key;
      els.readerLayout.dataset.page = String(state.activePage);
    }
    updateReaderPulse(book, state.activePage, progress);
  }

  function updateReaderPulse(book, page, progress = null) {
    if (!els.body || !els.readerLayout) return;
    const currentProgress = progress ?? getBookProgress(book, page);
    if (els.body.dataset.readerBook && els.body.dataset.readerBook !== book.id) return;

    const pulse = readerPulseFor(book, page, currentProgress);
    const pulseNode = document.querySelector("[data-reader-pulse]");
    if (pulseNode) {
      const titleNode = pulseNode.querySelector("span");
      const bodyNode = pulseNode.querySelector("strong");
      if (titleNode) titleNode.textContent = pulse.title;
      if (bodyNode) bodyNode.textContent = pulse.body;
    }
  }

  function getBookProgress(book, page) {
    const maxPage = Number(book?.pageCount || 1);
    const currentPage = Number(page || 1);
    if (maxPage <= 1 || maxPage >= 900 || currentPage <= 1) return 0;
    return Math.max(0, Math.min(100, Math.round(((currentPage - 1) / (maxPage - 1)) * 100)));
  }

  function getStoredBookProgress(book) {
    const stored = state.bookStates?.[book?.id];
    if (stored && Number.isFinite(Number(stored.page))) {
      return getBookProgress(book, stored.page);
    }
    if (book?.lastPage) {
      return getBookProgress(book, book.lastPage);
    }
    return 0;
  }

  function getBookTileProgress(book) {
    if (!book?.available) return 0;
    return getStoredBookProgress(book);
  }

  function getLibraryProgress() {
    const availableBooks = books.filter((book) => book.available !== false);
    if (!availableBooks.length) return 0;
    const total = availableBooks.reduce((sum, book) => sum + getStoredBookProgress(book), 0);
    return Math.round(total / availableBooks.length);
  }

  function getLibraryMicrocopy(book, overallProgress) {
    const hasHistory = Boolean(
      (state.lastOpenedBooks || []).length
      || Object.values(state.bookStates || {}).some((item) => Number(item?.page || 0) > 1)
    );
    if (!hasHistory) {
      return "STATUS · Aguardando primeira travessia.";
    }
    if (overallProgress <= 5) {
      if (state.continuity.maxFunnelStage >= 3) {
        return "O Centro reconheceu os primeiros sinais da sua passagem.";
      }
      return "O primeiro fragmento deixou uma marca no Centro.";
    }
    if (overallProgress <= 25) {
      return `O Centro preserva ecos de ${book?.title || "um dos arquivos"}.`;
    }
    if (overallProgress <= 60) {
      return "O Centro reconhece o seu retorno sem interromper o silêncio.";
    }
    return "A travessia avançou. O Centro mantém os sinais sob observação.";
  }

  function touchLastOpenedBook(book, page) {
    if (!book?.id) return;
    const entry = {
      bookId: book.id,
      page: Number(page || 1),
      progress: getBookProgress(book, page),
      timestamp: Date.now(),
    };
    state.lastOpenedAt = entry.timestamp;
    state.lastOpenedBooks = [entry, ...(state.lastOpenedBooks || []).filter((item) => item?.bookId !== book.id)].slice(0, 8);
    renderPortalMemory();
  }

  function renderPortalMemory() {
    const recent = (state.lastOpenedBooks || [])
      .map((entry) => ({
        ...entry,
        book: books.find((book) => book.id === entry.bookId),
      }))
      .filter((entry) => entry.book?.available !== false)
      .slice(0, 3);
    const hasHistory = recent.length > 0;

    els.body.classList.toggle("has-reading-history", hasHistory);
    if (els.portalMemoryCount) els.portalMemoryCount.textContent = hasHistory ? `${recent.length} sinais` : "Em silêncio";
    if (els.portalMemoryCopy) {
      els.portalMemoryCopy.textContent = hasHistory
        ? "arquivos próximos preservados"
        : "o primeiro sinal nascerá durante a leitura";
    }
    if (!els.recentAccesses || !els.recentAccessList) return;

    els.recentAccesses.hidden = !hasHistory;
    els.recentAccessList.innerHTML = "";
    recent.forEach((entry) => {
      const index = books.indexOf(entry.book);
      const progress = getBookProgress(entry.book, entry.page);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recent-access";
      button.dataset.bookIndex = String(index);
      button.dataset.bookId = entry.book.id;
      button.setAttribute("aria-label", `Retomar ${entry.book.title}`);

      const number = document.createElement("span");
      number.className = "recent-access__number";
      number.textContent = String(entry.book.number).padStart(2, "0");

      const copy = document.createElement("span");
      copy.className = "recent-access__copy";
      const title = document.createElement("strong");
      title.textContent = entry.book.title;
      const meta = document.createElement("small");
      meta.textContent = progress > 0 ? `${progress}% preservado` : "entrada registrada";
      copy.append(title, meta);

      const mark = document.createElement("span");
      mark.className = "recent-access__mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "⌁";
      button.append(number, copy, mark);
      els.recentAccessList.appendChild(button);
    });
  }

  function getMissionBook() {
    const lastBook = books.find((book) => book.id === state.lastBookId && isBookReadable(book));
    if (lastBook) return lastBook;
    if (isBookReadable(books[state.activeIndex])) return books[state.activeIndex];
    return books.find(isBookReadable) || null;
  }

  function getBookSavedPage(book) {
    const storedPage = Number(state.bookStates?.[book?.id]?.page || book?.lastPage || 1);
    return clamp(Number.isFinite(storedPage) ? storedPage : 1, 1, book?.pageCount || 999);
  }

  function getMissionState(book) {
    if (!book) {
      return {
        progress: 0,
        title: "Centro em silêncio",
        copy: "A primeira missão aguarda uma passagem ativa.",
      };
    }

    const page = getBookSavedPage(book);
    const progress = getStoredBookProgress(book);
    if (progress <= 0) {
      return {
        progress,
        title: `Abrir ${book.title}`,
        copy: "A primeira missão aguarda sua decisão. A travessia ainda não começou.",
      };
    }
    if (progress < 100) {
      return {
        progress,
        title: `Avançar em ${book.title}`,
        copy: `Registro atual preservado na página ${padPage(page)}. A missão segue aberta.`,
      };
    }
    return {
      progress,
      title: `Fechar registro de ${book.title}`,
      copy: "A leitura alcançou o limiar final. O próximo arquivo disponível pode assumir a travessia.",
    };
  }

  function getPersonalArchiveEntries() {
    const entries = [];
    const seen = new Set();
    const addBook = (book, source, page = null, timestamp = 0) => {
      if (!book?.id || seen.has(book.id) || !isBookReadable(book)) return;
      seen.add(book.id);
      entries.push({
        book,
        source,
        page: page || getBookSavedPage(book),
        timestamp,
      });
    };

    (state.favoriteBooks || []).forEach((bookId) => {
      addBook(books.find((book) => book.id === bookId), "Arquivo preservado", null, Number.MAX_SAFE_INTEGER);
    });

    (state.lastOpenedBooks || []).forEach((entry) => {
      addBook(books.find((book) => book.id === entry.bookId), "Retorno recente", entry.page, entry.timestamp);
    });

    const bookmarks = getObserverEntries();
    bookmarks.forEach((entry) => addBook(entry.book, "Observação de campo", entry.page, entry.timestamp));

    return entries
      .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
      .slice(0, 4);
  }

  function getObserverEntries() {
    return Object.entries(state.bookmarks || {})
      .flatMap(([bookId, items]) => {
        const book = books.find((candidate) => candidate.id === bookId);
        if (!book || !Array.isArray(items) || !isBookReadable(book)) return [];
        return items.map((item) => ({
          ...item,
          book,
          page: clamp(Number(item.page || 1), 1, book.pageCount || 999),
          timestamp: Number(item.timestamp || 0),
        }));
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
  }

  function getTraversalNotebookRecords() {
    const entries = state.traversalNotebook?.entries || {};
    return Object.entries(entries)
      .map(([bookId, entry]) => {
        const book = books.find((candidate) => candidate.id === bookId);
        const text = String(entry?.text || "").trim();
        if (!book || !text || !isBookReadable(book)) return null;
        const timestamp = Date.parse(entry.updatedAt || "") || 0;
        const page = clamp(Number(entry.page || getBookSavedPage(book) || 1), 1, book.pageCount || 999);
        return {
          book,
          page,
          timestamp,
          source: formatTraversalNotebookDate(entry.updatedAt) || "Registro de campo",
          label: text.length > 88 ? `${text.slice(0, 85).trim()}...` : text,
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  }

  function appendOperationEmpty(parent, copy) {
    const node = document.createElement("p");
    node.className = "operation-empty";
    node.textContent = copy;
    parent.appendChild(node);
  }

  function buildOperationButton(entry, className) {
    const index = books.indexOf(entry.book);
    const progress = getBookProgress(entry.book, entry.page);
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.observerBookIndex = String(index);
    button.dataset.observerPage = String(entry.page || 1);
    button.setAttribute("aria-label", `Retomar ${entry.book.title} na página ${padPage(entry.page || 1)}`);

    const number = document.createElement("span");
    number.className = `${className}__number`;
    number.textContent = String(entry.book.number || index + 1).padStart(2, "0");

    const copy = document.createElement("span");
    copy.className = `${className}__copy`;
    const title = document.createElement("strong");
    title.textContent = entry.title || entry.book.title;
    const meta = document.createElement("small");
    meta.textContent = entry.meta || `${entry.source || entry.label || "Registro"} · p. ${padPage(entry.page || 1)} · ${progress}%`;
    copy.append(title, meta);

    button.append(number, copy);
    return button;
  }

  function renderOperations() {
    const missionBook = getMissionBook();
    const mission = getMissionState(missionBook);

    if (els.missionTitle) els.missionTitle.textContent = mission.title;
    if (els.missionCopy) els.missionCopy.textContent = mission.copy;
    if (els.missionProgress) els.missionProgress.style.width = `${mission.progress}%`;

    if (els.personalArchiveList) {
      els.personalArchiveList.innerHTML = "";
      const entries = getPersonalArchiveEntries();
      if (!entries.length) {
        appendOperationEmpty(els.personalArchiveList, "Seu primeiro Arquivo Pessoal nascerá durante a leitura.");
      } else {
        entries.forEach((entry) => {
          els.personalArchiveList.appendChild(buildOperationButton(entry, "personal-archive"));
        });
      }
    }

    if (els.observerLog) {
      els.observerLog.innerHTML = "";
      const entries = getObserverEntries();
      if (!entries.length) {
        appendOperationEmpty(els.observerLog, "Nenhuma observação registrada nesta travessia.");
      } else {
        entries.forEach((entry) => {
          const button = buildOperationButton({
            ...entry,
            source: entry.label || "Observação de campo",
          }, "observer-entry");
          els.observerLog.appendChild(button);
        });
      }
    }

    if (els.myRecordsList) {
      els.myRecordsList.innerHTML = "";
      const entries = getTraversalNotebookRecords();
      if (!entries.length) {
        appendOperationEmpty(els.myRecordsList, "O Caderno ainda não preservou nenhum registro de campo.");
      } else {
        entries.forEach((entry) => {
          const button = buildOperationButton({
            ...entry,
            title: entry.label,
            meta: `${entry.book.title} · p. ${padPage(entry.page || 1)} · ${entry.source}`,
          }, "my-record");
          els.myRecordsList.appendChild(button);
        });
      }
    }
  }

  function hasCurrentPageBookmark(book) {
    if (!book?.id) return false;
    const bookmarks = state.bookmarks?.[book.id] || [];
    return bookmarks.some((item) => Number(item.page) === Number(state.activePage));
  }

  function updateReaderActions(book) {
    const canPersist = Boolean(book?.id && !isFragmentReaderScope(book) && isBookReadable(book));
    const isFavorite = canPersist && state.favoriteBooks.includes(book.id);
    const isMarked = canPersist && hasCurrentPageBookmark(book);

    if (els.readerFavorite) {
      els.readerFavorite.disabled = !canPersist;
      els.readerFavorite.textContent = isFavorite ? "★" : "☆";
      els.readerFavorite.classList.toggle("is-active", isFavorite);
      els.readerFavorite.setAttribute("aria-pressed", isFavorite ? "true" : "false");
      els.readerFavorite.title = isFavorite ? "Arquivo Pessoal preservado" : "Preservar nos Arquivos Pessoais";
      els.readerFavorite.setAttribute("aria-label", isFavorite ? "Arquivo Pessoal preservado" : "Preservar nos Arquivos Pessoais");
    }

    if (els.readerMark) {
      els.readerMark.disabled = !canPersist;
      els.readerMark.textContent = isMarked ? "◆" : "⌖";
      els.readerMark.classList.toggle("is-active", isMarked);
      els.readerMark.setAttribute("aria-pressed", isMarked ? "true" : "false");
      els.readerMark.title = isMarked ? "Observação registrada" : "Registrar no Observador";
      els.readerMark.setAttribute("aria-label", isMarked ? "Observação registrada" : "Registrar no Observador");
    }
  }

  function showReaderToast(message) {
    if (!els.readerToast) return;
    els.readerToast.textContent = message;
    els.readerToast.hidden = false;
    els.readerToast.classList.add("is-visible");
    window.clearTimeout(showReaderToast.timer);
    showReaderToast.timer = window.setTimeout(() => {
      els.readerToast.classList.remove("is-visible");
      els.readerToast.hidden = true;
    }, 2200);
  }

  function handleReaderFavorite(event) {
    event.preventDefault();
    event.stopPropagation();
    const book = getCurrentBook();
    if (!book || !isBookReadable(book) || isFragmentReaderScope(book)) return;
    const favorites = toggleFavoriteBook(book.id);
    const isFavorite = favorites.includes(book.id);
    updateReaderActions(book);
    renderOperations();
    showReaderToast(isFavorite ? "Arquivo Pessoal preservado." : "Arquivo devolvido ao silêncio.");
    trackAnalytics("reader_favorite_toggled", {
      section: "reader",
      page: `reader-page-${state.activePage}`,
      bookId: book.id,
      details: { active: isFavorite },
    });
  }

  function handleReaderBookmark(event) {
    event.preventDefault();
    event.stopPropagation();
    const book = getCurrentBook();
    if (!book || !isBookReadable(book) || isFragmentReaderScope(book)) return;
    const chapter = chapterForPage(book, state.activePage);
    const label = chapter?.title
      ? `${chapter.title} · página ${padPage(state.activePage)}`
      : `Página ${padPage(state.activePage)}`;
    setBookmark(book.id, state.activePage, label);
    updateReaderActions(book);
    renderOperations();
    showReaderToast("Observação registrada no campo.");
    trackAnalytics("reader_observer_marked", {
      section: "reader",
      page: `reader-page-${state.activePage}`,
      bookId: book.id,
      details: { page: state.activePage },
    });
  }

  function toggleFavoriteBook(bookId) {
    if (!bookId) return state.favoriteBooks;
    const hasBook = state.favoriteBooks.includes(bookId);
    state.favoriteBooks = hasBook
      ? state.favoriteBooks.filter((id) => id !== bookId)
      : [bookId, ...state.favoriteBooks].slice(0, 12);
    saveState();
    renderOperations();
    return state.favoriteBooks;
  }

  function setBookmark(bookId, page, label = "") {
    if (!bookId || !Number.isFinite(Number(page))) return null;
    const entry = {
      page: clamp(Number(page), 1, 999),
      label: String(label || "").trim(),
      timestamp: Date.now(),
    };
    state.bookmarks[bookId] = [...(state.bookmarks[bookId] || []).filter((item) => item.page !== entry.page), entry].slice(0, 24);
    saveState();
    renderOperations();
    return state.bookmarks[bookId];
  }

  window.PSEU_LIBRARY = {
    get state() {
      return state;
    },
    toggleFavoriteBook,
    setBookmark,
  };

  function readerPulseFor(book, page, progress) {
    const chapter = chapterForPage(book, page);
    const chapterTitle = chapter?.title || "a travessia";
    if (progress <= 5) {
      return {
        title: "Primeira entrada",
        body: "Você ainda está diante da porta. E a porta já está respondendo.",
      };
    }
    if (progress <= 20) {
      return {
        title: "Impacto inicial",
        body: `O livro já tocou em ${chapterTitle.toLowerCase()}. Agora ele quer a sua atenção inteira.`,
      };
    }
    if (progress <= 45) {
      return {
        title: "Retorno em curso",
        body: "Você não voltou por acaso. A leitura está puxando algo que ainda não foi dito em voz alta.",
      };
    }
    if (progress <= 75) {
      return {
        title: "Aprofundamento",
        body: "A travessia ficou mais funda. Agora a leitura começa a te ler de volta.",
      };
    }
    if (progress < 100) {
      return {
        title: "Quase no limiar final",
        body: "Você já foi longe demais para tratar isso como simples leitura. Continue.",
      };
    }
    return {
      title: "Fecho",
      body: "A história fechou o círculo. O que vem depois é o eco.",
    };
  }

  function buildReaderSpread(book, page, compact, maxPage) {
    if (isFragmentReaderScope(book) && !compact) {
      return buildFragmentReaderSpread(book, page);
    }

    if (page <= 1) {
      const mood = pageMoodFor(book, 1);
      const atmosphere = readerAtmosphereFor(book, mood, 1);
      return {
        mode: "cover",
        leftPage: 1,
        rightPage: null,
        leftMood: mood,
        rightMood: null,
        centerMood: mood,
        leftAtmosphere: atmosphere,
        rightAtmosphere: atmosphere,
        centerAtmosphere: atmosphere,
        pageLabel: "Capa",
        spreadLabel: "Capa",
      };
    }

    if (compact) {
      const mood = pageMoodFor(book, page);
      const atmosphere = readerAtmosphereFor(book, mood, page);
      return {
        mode: "single",
        leftPage: page,
        rightPage: null,
        leftMood: mood,
        rightMood: null,
        centerMood: mood,
        leftAtmosphere: atmosphere,
        rightAtmosphere: atmosphere,
        centerAtmosphere: atmosphere,
        pageLabel: `Página ${padPage(page)}`,
        spreadLabel: `Página ${padPage(page)}`,
      };
    }

    const leftPage = page;
    const rightPage = leftPage + 1 <= maxPage ? leftPage + 1 : null;
    const leftMood = pageMoodFor(book, leftPage);
    const rightMood = rightPage ? pageMoodFor(book, rightPage) : leftMood;
    const leftAtmosphere = readerAtmosphereFor(book, leftMood, leftPage);
    const rightAtmosphere = readerAtmosphereFor(book, rightMood, rightPage || leftPage + 1);
    const centerAtmosphere = blendAtmospheres(leftAtmosphere, rightAtmosphere);

    return {
      mode: "spread",
      leftPage,
      rightPage,
      leftMood,
      rightMood,
      centerMood: leftMood,
      leftAtmosphere,
      rightAtmosphere,
      centerAtmosphere,
      pageLabel: rightPage ? `Páginas ${padPage(leftPage)}-${padPage(rightPage)}` : `Página ${padPage(leftPage)}`,
      spreadLabel: rightPage ? `${leftMood.title} · ${rightMood.title}` : leftMood.title,
    };
  }

  function buildFragmentReaderSpread(book, page) {
    const allowedPages = getFragmentAllowedPages(book);
    const currentPage = normalizeFragmentPage(page, book) || allowedPages[0] || FRAGMENT_ALLOWED_PAGES[0];
    const currentIndex = Math.max(0, allowedPages.indexOf(currentPage));
    const groupStartIndex = currentIndex <= 0 ? 0 : currentIndex <= 2 ? 1 : 3;
    const groupEndIndex = groupStartIndex === 0 ? 0 : Math.min(groupStartIndex + 1, allowedPages.length - 1);
    const leftPage = allowedPages[groupStartIndex] || currentPage;
    const rightPage = groupEndIndex > groupStartIndex ? allowedPages[groupEndIndex] : null;
    const leftMood = pageMoodFor(book, leftPage);
    const rightMood = rightPage ? pageMoodFor(book, rightPage) : leftMood;
    const leftAtmosphere = readerAtmosphereFor(book, leftMood, leftPage);
    const rightAtmosphere = rightPage ? readerAtmosphereFor(book, rightMood, rightPage) : leftAtmosphere;
    const centerAtmosphere = blendAtmospheres(leftAtmosphere, rightAtmosphere);
    const leftEcho = FRAGMENT_ECHOS[groupStartIndex] || FRAGMENT_ECHOS[0];
    const rightEcho = rightPage ? FRAGMENT_ECHOS[groupEndIndex] : null;
    const leftNumber = groupStartIndex + 1;
    const rightNumber = groupEndIndex + 1;

    return {
      mode: groupStartIndex === 0 ? "fragment-cover-centered" : "fragment-spread",
      leftPage,
      rightPage,
      leftMood,
      rightMood,
      centerMood: leftMood,
      leftAtmosphere,
      rightAtmosphere,
      centerAtmosphere,
      pageLabel: rightEcho
        ? `Eco ${String(leftNumber).padStart(2, "0")}/${String(rightNumber).padStart(2, "0")} · ${leftMood.title} / ${rightMood.title}`
        : leftEcho?.label || "Eco 01 · Ruptura",
      spreadLabel: rightEcho
        ? `${leftEcho?.copy || ""} ${rightEcho?.copy || ""}`.trim()
        : leftEcho?.copy || "O primeiro eco rompe a superfície.",
      fragmentProgressLabel: rightEcho
        ? `${String(leftNumber).padStart(2, "0")}-${String(rightNumber).padStart(2, "0")} / ${String(FRAGMENT_ECHOS.length).padStart(2, "0")}`
        : `${String(leftNumber).padStart(2, "0")} / ${String(FRAGMENT_ECHOS.length).padStart(2, "0")}`,
    };
  }

  function readerModeFor(book, page = state.activePage) {
    if (page <= 1) return "cover";
    if (isFragmentReaderScope(book)) return isCompactFragmentReader() ? "single" : "fragment-spread";
    return isCompactReader() ? "single" : "spread";
  }

  function normalizeReaderPage(pageNumber, book) {
    const fragmentPage = normalizeFragmentPage(pageNumber, book);
    if (fragmentPage) return fragmentPage;

    const maxPage = book.pageCount || Math.max(book.chapters?.at(-1)?.page || 1, 1);
    const page = clamp(pageNumber, 1, maxPage);
    if (page <= 1) return 1;
    if (isCompactReader()) return page;
    if (page >= maxPage) {
      return maxPage % 2 === 0 ? maxPage : Math.max(2, maxPage - 1);
    }
    return page % 2 === 0 ? page : page - 1;
  }

  function isCompactReader() {
    return window.matchMedia("(max-width: 1023px)").matches;
  }

  function isCompactFragmentReader() {
    const narrowViewport = window.matchMedia("(max-width: 959px)").matches;
    const touchViewport = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    return narrowViewport || touchViewport;
  }

  function setupPdfJs() {
    if (setupPdfJs.initialized) return Boolean(window.pdfjsLib);
    if (!window.pdfjsLib) return false;
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_SRC;
    setupPdfJs.initialized = true;
    return true;
  }

  function padPage(page) {
    return String(page).padStart(2, "0");
  }

  async function queueReaderFrames(book, spread, compact) {
    const token = ++state.renderToken;
    const requests = [];
    const fragmentScope = isFragmentReaderScope(book);
    const useImagePages = book.readerRenderMode !== "pdf" && Boolean(book.pageAssets?.length);
    const hasPdf = hasReaderPdfSource(book);
    const usePdfJs = book.readerRenderMode === "pdf" && await waitForPdfJsReady();
    if (token !== state.renderToken) return;

    pdfDebug("CHECK", `queueReaderFrames`, `${book.id} | pdfjs=${usePdfJs} | hasPdf=${hasPdf} | token=${token}`);

    const coverShell = els.pdfFrameCover?.closest(".reader-page-shell");
    const leftShell = els.pdfFrameLeft?.closest(".reader-page-shell");
    const rightShell = els.pdfFrameRight?.closest(".reader-page-shell");

    if (spread.mode === "cover") {
      requests.push({ frame: els.pdfFrameCover, shell: coverShell, page: 1, visible: true, role: "cover" });
      requests.push({ frame: els.pdfFrameLeft, shell: leftShell, page: null, visible: false, role: "left" });
      requests.push({ frame: els.pdfFrameRight, shell: rightShell, page: null, visible: false, role: "right" });
    } else if (compact || spread.mode === "fragment-cover-centered") {
      requests.push({ frame: els.pdfFrameCover, shell: coverShell, page: null, visible: false, role: "cover" });
      requests.push({ frame: els.pdfFrameLeft, shell: leftShell, page: spread.leftPage, visible: true, role: spread.mode === "fragment-cover-centered" ? "cover-single" : "single" });
      requests.push({ frame: els.pdfFrameRight, shell: rightShell, page: null, visible: false, role: "right" });
    } else {
      requests.push({ frame: els.pdfFrameCover, shell: coverShell, page: null, visible: false, role: "cover" });
      requests.push({ frame: els.pdfFrameLeft, shell: leftShell, page: spread.leftPage, visible: true, role: "left" });
      requests.push({
        frame: els.pdfFrameRight,
        shell: rightShell,
        page: spread.rightPage,
        visible: true,
        role: fragmentScope && !spread.rightPage ? "ritual" : "right",
      });
    }

    state.pendingFrames = requests.filter((request) => request.visible && request.page).length;
    if (state.pendingFrames === 0) {
      els.body.dataset.loading = "false";
      els.readerBookStage?.classList.remove("is-turning");
      return;
    }

    requests.forEach(({ frame, shell, page, visible, role }) => {
      if (!frame) return;
      frame.dataset.renderToken = String(token);
      frame.dataset.loaded = visible && page ? "false" : "";
      frame.style.opacity = "0";
      if (shell) {
        shell.hidden = !visible;
        shell.classList.toggle("is-blank", visible && !page);
        shell.dataset.readerRole = role || "";
        const fragmentCoverFallback = fragmentScope
          && visible
          && role !== "ritual"
          && Number(page) === FRAGMENT_ALLOWED_PAGES[0]
          && Boolean(book.cover || coverAssets[book.number]);
        if (fragmentCoverFallback) {
          shell.dataset.fragmentFallback = "cover";
          shell.style.setProperty("--reader-page-image", `url("${toUrl(book.cover || coverAssets[book.number] || "")}")`);
        } else {
          delete shell.dataset.fragmentFallback;
        }
        const fallback = shell.querySelector?.("[data-reader-fallback]");
        if (fallback) {
          fallback.hidden = true;
          fallback.textContent = page ? `Carregando página ${page}...` : fallback.textContent;
        }
      }
      frame.style.display = "none";
      frame.removeAttribute("src");
      frame.removeAttribute("data");
      const canvas = shell?.querySelector?.(".reader-page-canvas");
      if (canvas) {
        const preserveFragmentCanvas = Boolean(
          fragmentScope
          && visible
          && page
          && canvas.dataset.loaded === "true"
          && canvas.width > 0
          && canvas.height > 0
        );
        canvas.dataset.renderToken = String(token);
        if (!preserveFragmentCanvas) {
          canvas.dataset.loaded = "";
          canvas.style.display = "none";
          canvas.style.opacity = "0";
        }
      }
    });

    if (useImagePages) {
      requests.forEach(({ frame, shell, page, visible }) => {
        if (!frame || !page || !visible) return;
        const pageUrl = toUrl(pageSourceFor(book, page));
        const renderTarget = shell?.querySelector?.(".reader-page-media");
        const pdfTarget = shell?.querySelector?.(".reader-page-pdf");
        if (shell) {
          shell.dataset.renderKind = "image";
          shell.style.backgroundImage = `url("${pageUrl}")`;
          shell.style.backgroundSize = "contain";
          shell.style.backgroundRepeat = "no-repeat";
          shell.style.backgroundPosition = "center center";
          shell.style.setProperty("--reader-page-image", `url("${pageUrl}")`);
          shell.classList.remove("is-blank");
        }
        if (renderTarget) {
          renderTarget.dataset.renderToken = String(token);
          renderTarget.dataset.loaded = "false";
          renderTarget.dataset.pageSource = pageUrl;
          renderTarget.dataset.visiblePage = String(page);
          renderTarget.style.display = "block";
          renderTarget.style.visibility = "visible";
          renderTarget.style.opacity = "1";
          renderTarget.src = pageUrl;
          window.setTimeout(() => {
            if (renderTarget.dataset.renderToken !== String(token)) return;
            if (renderTarget.dataset.loaded === "true") return;
            if (renderTarget.complete && renderTarget.naturalWidth > 0) {
              finalizeReaderFrameLoad(renderTarget);
            }
          }, 0);
        }
        if (pdfTarget) pdfTarget.style.display = "none";
      });
      preloadReaderPages(book, spread, compact);
      return;
    }

    if (usePdfJs) {
      const sourceUrl = await resolvePdfSource(book);
      if (token !== state.renderToken) return;
      if (!sourceUrl) {
        showReaderSourceFallback(requests, book, token, "source");
        return;
      }

      try {
        const pdfDoc = await loadPdfDocument(book, sourceUrl);
        if (token !== state.renderToken) return;
        if (!pdfDoc) {
          throw new Error("pdfjs_document_unavailable");
        }

        for (const request of requests) {
          if (token !== state.renderToken) return;
          await renderPdfRequest(request, pdfDoc, book, token);
        }
        if (token !== state.renderToken) return;
      } catch (error) {
        if (token !== state.renderToken) return;
        pdfDebug("WARNING", "PDF.js controlled fallback", `${book.id} | ${error?.message || error}`);
        if (shouldUseControlledPdfFallback(book)) {
          showReaderSourceFallback(requests, book, token, "source");
          return;
        }
        await renderNativePdfFrames(requests, book, token, sourceUrl);
      }
      return;
    }

    if (book.readerRenderMode === "pdf" && hasPdf) {
      await renderNativePdfFrames(requests, book, token);
      return;
    }

    const sourceUrl = hasPdf ? await resolvePdfSource(book) : "";
    if (token !== state.renderToken) return;

    await renderNativePdfFrames(requests, book, token, sourceUrl);
  }

  async function renderNativePdfFrames(requests, book, token, sourceUrl = "") {
    const resolvedSource = sourceUrl || (hasReaderPdfSource(book) ? await resolvePdfSource(book) : "");
    if (token !== state.renderToken) return false;

    if (!resolvedSource) {
      showReaderSourceFallback(requests, book, token, "source");
      return false;
    }

    requests.forEach((request) => {
      prepareNativePdfFrame(request, book, token, resolvedSource);
    });

    return true;
  }

  function prepareNativePdfFrame(request, book, token, sourceUrl) {
    const { frame, shell, page, visible } = request || {};
    if (!frame || !visible || !page || !sourceUrl) return false;

    const renderPage = pdfRenderPageFor(book, page);
    const pageUrl = `${sourceUrl}${pdfFragment(renderPage)}`;
    if (shell) {
      shell.dataset.renderKind = "pdf";
      shell.classList.remove("is-blank");
      const fallback = shell.querySelector?.("[data-reader-fallback]");
      if (fallback) {
        fallback.hidden = true;
        fallback.textContent = page ? `Carregando página ${page}...` : fallback.textContent;
      }
    }
    frame.dataset.pageSource = pageUrl;
    frame.dataset.visiblePage = String(page);
    frame.style.display = "block";
    frame.style.opacity = "0";
    frame.setAttribute("src", pageUrl);
    window.setTimeout(() => {
      if (token !== state.renderToken) return;
      if (frame.dataset.loaded === "true") return;
      finalizeReaderFrameLoad(frame);
    }, 900);
    scheduleReaderLoadFallback(frame, book, page, pageUrl);
    return true;
  }

  async function loadPdfDocument(book, sourceUrl) {
    const cacheKey = sourceUrl || "";
    if (pdfDocumentCache.has(cacheKey)) {
      const cached = await pdfDocumentCache.get(cacheKey);
      if (book && cached?.numPages && (!book.pageCount || book.pageCount === 999)) {
        book.pageCount = cached.numPages;
      }
      pdfDebug("CHECK", `PDF cache hit`, `${book.id} | pages=${cached?.numPages || "?"}`);
      return cached;
    }

    if (!setupPdfJs() || !window.pdfjsLib) return null;

    if (PDF_DEBUG) {
      try {
        const probe = await fetch(sourceUrl, { cache: "no-store" });
        pdfDebug(probe.ok ? "CHECK" : "WARNING", `fetch probe`, `${book.id} | status=${probe.status} | content-type=${probe.headers.get("content-type") || "desconhecido"}`);
      } catch (error) {
        pdfDebug("WARNING", `fetch probe failed`, `${book.id} | ${error?.message || error}`);
      }
    }

    pdfDebug("CHECK", `pdfjs getDocument`, `${book.id} | ${sourceUrl}`);

    const loadingTask = window.pdfjsLib.getDocument({
      url: sourceUrl,
      withCredentials: true,
      disableWorker: true,
    });
    const promise = loadingTask.promise.then((doc) => {
      pdfDocumentCache.set(cacheKey, doc);
      if (book && doc?.numPages && (!book.pageCount || book.pageCount === 999)) {
        book.pageCount = doc.numPages;
        if (books[state.activeIndex]?.id === book.id) {
          updateHero(book);
          updateProgressBadge(book);
          refreshLibraryTiles();
        }
      }
      pdfDebug("CHECK", `PDF loaded`, `${book.id} | pages=${doc?.numPages || 0}`);
      return doc;
    }).catch((error) => {
      pdfDocumentCache.delete(cacheKey);
      pdfDebug("ERROR", `PDF load failed`, `${book.id} | ${error?.message || error}`);
      throw error;
    });
    pdfDocumentCache.set(cacheKey, promise);
    return promise;
  }

  function waitForPdfJsReady(timeout = 2200) {
    if (setupPdfJs() && window.pdfjsLib) return Promise.resolve(true);

    const startedAt = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (setupPdfJs() && window.pdfjsLib) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt >= timeout) {
          resolve(false);
          return;
        }
        window.setTimeout(check, 50);
      };
      check();
    });
  }

  async function renderPdfRequest(request, pdfDoc, book, token) {
    const { shell, page, visible, role } = request || {};
    const canvas = shell?.querySelector?.(".reader-page-canvas");
    const frame = request?.frame;
    const fragmentScope = isFragmentReaderScope(book);

    if (!visible || !page || !canvas || !shell) return;
    if (token !== state.renderToken) return;

    try {
      pdfDebug("CHECK", `render request`, `${book.id} | role=${role || "?"} | page=${page}`);
      shell.dataset.renderKind = "pdfjs";
      shell.classList.remove("is-blank");
      if (frame) frame.style.display = "none";
      const renderPage = pdfRenderPageFor(book, page);
      const renderCanvas = fragmentScope ? document.createElement("canvas") : canvas;
      const pageRender = await renderPdfPageToCanvas(pdfDoc, renderPage, renderCanvas, shell);
      if (token !== state.renderToken) return;
      if (pageRender) {
        if (fragmentScope) {
          const context = canvas.getContext("2d", { alpha: false });
          if (!context || renderCanvas.width <= 0 || renderCanvas.height <= 0) {
            throw new Error("fragment_canvas_commit_failed");
          }
          canvas.width = renderCanvas.width;
          canvas.height = renderCanvas.height;
          canvas.style.width = renderCanvas.style.width;
          canvas.style.height = renderCanvas.style.height;
          context.drawImage(renderCanvas, 0, 0);
        }
        const resolvedSource = await resolvePdfSource(book);
        canvas.dataset.pageSource = `${resolvedSource}${pdfFragment(renderPage)}`;
        canvas.dataset.visiblePage = String(page);
        canvas.dataset.readerRole = request?.role || "";
        canvas.style.display = "block";
        canvas.style.visibility = "visible";
        canvas.style.opacity = "1";
        finalizeReaderFrameLoad(canvas, { force: fragmentScope });
        pdfDebug("CHECK", `render complete`, `${book.id} | role=${role || "?"} | page=${page}`);
      } else {
        throw new Error("pdf_canvas_render_empty");
      }
    } catch (error) {
      if (token !== state.renderToken) return;
      const label = page === 1 ? "capa" : `página ${page}`;
      const message = readerFallbackMessage(book, page, "render");
      setReaderError(message);
      window.PSEU_BOOK_DIAGNOSTICS?.markFrameError?.(book, page, request?.role || "", error?.message || "pdfjs");
      pdfDebug("WARNING", `render fallback for ${label}`, error?.message || "pdfjs");
      showReaderFallback(shell, book, page, { message, context: "render" });
      state.pendingFrames = Math.max(0, state.pendingFrames - 1);
      if (state.pendingFrames === 0) {
        els.body.dataset.loading = "false";
        els.readerBookStage?.classList.remove("is-turning");
      }
    }
  }

  async function renderPdfPageToCanvas(pdfDoc, pageNumber, canvas, shell) {
    if (!pdfDoc || !canvas || !shell) return null;
    const page = await pdfDoc.getPage(pageNumber);
    if (!page) return null;

    let bounds = shell.getBoundingClientRect();
    pdfDebug("CHECK", `canvas bounds`, `p.${pageNumber} | ${Math.round(bounds.width)}x${Math.round(bounds.height)}`);
    if (!bounds.width || !bounds.height) {
      pdfDebug("WARNING", `bounds zero`, `p.${pageNumber} | aguardando layout`);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const retryBounds = shell.getBoundingClientRect();
      pdfDebug("CHECK", `canvas bounds retry`, `p.${pageNumber} | ${Math.round(retryBounds.width)}x${Math.round(retryBounds.height)}`);
      if (retryBounds.width > 0 && retryBounds.height > 0) {
        bounds = retryBounds;
      } else {
        pdfDebug("ERROR", `bounds still zero`, `p.${pageNumber} | render abortado`);
        return null;
      }
    }
    const padding = pageNumber === 1 ? 24 : 20;
    const availableWidth = Math.max(1, bounds.width - padding * 2);
    const availableHeight = Math.max(1, bounds.height - padding * 2);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height);
    const viewport = page.getViewport({ scale });
    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(bounds.width * outputScale));
    canvas.height = Math.max(1, Math.floor(bounds.height * outputScale));
    canvas.style.width = `${Math.floor(bounds.width)}px`;
    canvas.style.height = `${Math.floor(bounds.height)}px`;
    pdfDebug("CHECK", `canvas size`, `p.${pageNumber} | ${canvas.width}x${canvas.height} | viewport=${Math.round(viewport.width)}x${Math.round(viewport.height)}`);

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      pdfDebug("ERROR", `canvas context missing`, `p.${pageNumber}`);
      return null;
    }
    context.fillStyle = "#050507";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const offsetX = Math.max(0, (bounds.width - viewport.width) / 2);
    const offsetY = Math.max(0, (bounds.height - viewport.height) / 2);
    pdfDebug("CHECK", `renderTask start`, `p.${pageNumber} | offset=${Math.round(offsetX)}x${Math.round(offsetY)}`);

    await page.render({
      canvasContext: context,
      viewport,
      transform: [outputScale, 0, 0, outputScale, offsetX * outputScale, offsetY * outputScale],
      background: "rgba(0,0,0,1)",
    }).promise;
    pdfDebug("CHECK", `renderTask end`, `p.${pageNumber}`);

    return true;
  }

  function blendAtmospheres(left, right) {
    return {
      a: left.a,
      b: right.b,
      c: left.c,
      image: left.image,
    };
  }

  async function resolvePdfSource(book) {
    const protectedEndpoint = getProtectedPdfEndpoint(book);
    const fragmentEndpoint = getFragmentPdfSource(book);
    const legacyEndpoint = getLegacyPdfSource(book);
    const cacheKey = protectedEndpoint || fragmentEndpoint || legacyEndpoint || book.id || "";
    if (pdfSourceCache.has(cacheKey)) {
      return pdfSourceCache.get(cacheKey);
    }

    const resolved = protectedEndpoint || fragmentEndpoint || legacyEndpoint;
    pdfSourceCache.set(cacheKey, resolved);
    return resolved;
  }

  function hasReaderPdfSource(book) {
    return Boolean(
      getProtectedPdfEndpoint(book)
      || getFragmentPdfSource(book)
      || getLegacyPdfSource(book)
    );
  }

  function getFragmentPdfSource(book) {
    if (!isFragmentReaderScope(book)) return "";
    return toUrl(FRAGMENT_PDF_SOURCE);
  }

  function getLegacyPdfSource(book) {
    if (!book?.pdf) return "";
    if (isProtectedPortalRoute()) return "";
    return toUrl(book.pdf);
  }

  function pdfRenderPageFor(book, page) {
    if (!isFragmentReaderScope(book)) return page;
    return FRAGMENT_PAGE_MAP[Number(page)] || 1;
  }

  function shouldUseControlledPdfFallback(book) {
    return Boolean(isFragmentReaderScope(book) || getProtectedPdfEndpoint(book));
  }

  function readerFallbackMessage(book, page, context = "load") {
    if (isFragmentReaderScope(book)) {
      return "O fragmento público ainda não respondeu. O Centro preservou este eco para quando o arquivo voltar ao ar.";
    }
    if (getProtectedPdfEndpoint(book) || (isProtectedPortalRoute() && book?.canRead)) {
      return "Arquivo protegido ainda não provisionado.";
    }
    if (context === "source") {
      return "O arquivo ainda não foi provisionado pelo Centro.";
    }
    return page === 1
      ? "A capa ainda não respondeu ao Centro."
      : "Esta página ainda não respondeu ao Centro.";
  }

  function showReaderFallback(shell, book, page, options = {}) {
    if (!shell) return;
    const message = options.message || readerFallbackMessage(book, page, options.context);
    shell.dataset.renderKind = "fallback";
    shell.classList.add("is-blank");
    shell.querySelectorAll(".reader-page-media, .reader-page-pdf, .reader-page-canvas").forEach((node) => {
      node.style.opacity = "0";
      node.style.display = "none";
    });
    const fallback = shell.querySelector?.("[data-reader-fallback]");
    if (fallback) {
      fallback.textContent = message;
      fallback.hidden = false;
    }
  }

  function completeReaderFallbackFrame(frame) {
    if (frame) {
      frame.dataset.loaded = "fallback";
      frame.style.opacity = "0";
      frame.style.display = "none";
    }
    state.pendingFrames = Math.max(0, state.pendingFrames - 1);
    if (state.pendingFrames === 0) {
      els.body.dataset.loading = "false";
      els.readerBookStage?.classList.remove("is-turning");
    }
  }

  function showReaderSourceFallback(requests, book, token, context = "source") {
    if (token !== state.renderToken) return false;
    const visibleRequests = (requests || []).filter((request) => request?.visible && request?.page && request?.shell);
    const message = readerFallbackMessage(book, visibleRequests[0]?.page, context);
    setReaderError(message);
    visibleRequests.forEach((request) => {
      if (request.frame) {
        request.frame.dataset.loaded = "fallback";
        request.frame.style.opacity = "0";
        request.frame.style.display = "none";
      }
      showReaderFallback(request.shell, book, request.page, { message, context });
    });
    state.pendingFrames = 0;
    els.body.dataset.loading = "false";
    els.readerBookStage?.classList.remove("is-turning");
    updateReaderDebugPanel(book, null, null);
    return true;
  }

  function nativePdfFrameHasFallbackResponse(frame) {
    if (!frame?.classList?.contains("reader-page-pdf")) return false;
    const source = frame.dataset.pageSource || "";
    const controlledSource = source.includes("/fragmentos/")
      || source.includes("/api/books/")
      || source.includes("/livros/o%20livro%20despertar/");
    if (!controlledSource) return false;
    try {
      const text = frame.contentDocument?.body?.textContent?.trim() || "";
      return /pdf_not_found|pdf_not_mapped|not_found|asset_forbidden|internal_error|Cannot GET|Fragmento em silêncio|fragmento público ainda não respondeu/i.test(text);
    } catch {
      return false;
    }
  }

  function showReaderFrameFallback(frame, book, page, context = "load") {
    if (!frame || frame.dataset.loaded === "fallback") return;
    const shell = frame.closest?.(".reader-page-shell");
    const message = readerFallbackMessage(book, page, context);
    setReaderError(message);
    window.PSEU_BOOK_DIAGNOSTICS?.markFrameError?.(book, page, frame?.dataset?.readerRole || "", message);
    updateReaderDebugPanel(book, null, frame);
    showReaderFallback(shell, book, page, { message, context });
    completeReaderFallbackFrame(frame);
  }

  function getProtectedPdfEndpoint(book) {
    if (!book || isFragmentReaderScope(book)) return "";
    if (!isProtectedPortalRoute()) return "";
    if (!state.protectedBooks.loaded || !book.canRead) return "";

    const backendBookId = book.backendBookId || LOCAL_BOOK_ID_TO_BACKEND[book.id];
    if (!backendBookId) return "";

    return book.pdfEndpoint || `/api/books/${encodeURIComponent(backendBookId)}/pdf`;
  }

  function scheduleReaderLoadFallback(frame, book, page, pageUrl) {
    const token = Number(frame?.dataset.renderToken || "0");
    window.setTimeout(() => {
      if (token !== state.renderToken) return;
      if (!frame || frame.dataset.loaded === "true" || frame.dataset.loaded === "fallback") return;
      const label = page === 1 ? "capa" : `página ${page}`;
      if (PDF_DEBUG) {
        setReaderError(`Página não confirmou carregamento para ${label}. URL: ${pageUrl}`);
      } else if (!state.readerError) {
        setReaderError(readerFallbackMessage(book, page, "load"));
      }
      window.PSEU_BOOK_DIAGNOSTICS?.markFrameError?.(book, page, frame?.dataset?.readerRole || "", `URL: ${pageUrl}`);
      updateReaderDebugPanel(book, null, frame);
      if (frame?.closest) {
        const shell = frame.closest(".reader-page-shell");
        const message = readerFallbackMessage(book, page, "load");
        showReaderFallback(shell, book, page, { message, context: "load" });
      }
      state.pendingFrames = Math.max(0, state.pendingFrames - 1);
      if (state.pendingFrames === 0) {
        els.body.dataset.loading = "false";
        els.readerBookStage?.classList.remove("is-turning");
      }
    }, 3200);
  }

  function finalizeReaderFrameLoad(frame, options = {}) {
    if (!frame || (frame.dataset.loaded === "true" && !options.force)) return;
    const token = Number(frame?.dataset.renderToken || "0");
    if (token !== state.renderToken) return;

    const book = getCurrentBook();
    const visiblePage = Number(frame?.dataset?.visiblePage || "0");
    if (nativePdfFrameHasFallbackResponse(frame)) {
      showReaderFrameFallback(frame, book, visiblePage, "source");
      return;
    }

    frame.dataset.loaded = "true";
    frame.style.opacity = "1";
    const shell = frame?.closest?.(".reader-page-shell");
    const isCanvas = frame.classList?.contains("reader-page-canvas");
    if (isCanvas) {
      frame.style.display = "block";
      frame.style.visibility = "visible";
    }
    const frameBounds = isCanvas ? frame.getBoundingClientRect() : null;
    const canvasIsVisible = Boolean(
      !isCanvas
      || (
        frame.width > 0
        && frame.height > 0
        && frameBounds.width > 0
        && frameBounds.height > 0
        && window.getComputedStyle(frame).display !== "none"
        && window.getComputedStyle(frame).visibility !== "hidden"
      )
    );
    if (isCanvas && canvasIsVisible && shell?.dataset.fragmentFallback) {
      delete shell.dataset.fragmentFallback;
      shell.style.removeProperty("--reader-page-image");
    }
    const fallback = shell?.querySelector?.("[data-reader-fallback]");
    if (fallback) fallback.hidden = true;
    state.pendingFrames = Math.max(0, state.pendingFrames - 1);
    if (state.pendingFrames === 0) {
      els.body.dataset.loading = "false";
      els.readerBookStage?.classList.remove("is-turning");
      if (!state.readerError || !PDF_DEBUG) {
        delete els.body.dataset.readerError;
        els.readerDebug?.classList.remove("is-visible");
      }
    }
    window.PSEU_BOOK_DIAGNOSTICS?.markFrameLoaded?.(book, visiblePage, frame?.dataset?.readerRole || "");
    pdfDebug("CHECK", `frame visible`, `${frame?.dataset?.readerRole || "?"} | page=${frame?.dataset?.visiblePage || "?"}`);
  }

  function pageSourceFor(book, page) {
    if (!book) return "";
    if (page <= 1) return book.cover || coverAssets[book.number] || "";
    const assets = book.pageAssets || [];
    if (assets.length) {
      return assets[page - 2] || assets[assets.length - 1] || book.cover || coverAssets[book.number] || "";
    }

    const visuals = book.visuals || [];
    if (visuals.length) {
      const index = Math.abs(page - 2) % visuals.length;
      return visuals[index]?.src || book.cover || coverAssets[book.number] || "";
    }

    return book.cover || coverAssets[book.number] || "";
  }

  function preloadReaderPages(book, spread, compact) {
    if (!book?.pageAssets?.length) return;
    const targets = [];
    if (spread.mode === "cover") {
      targets.push(2, 3);
    } else if (compact) {
      targets.push(spread.leftPage + 1, spread.leftPage + 2);
    } else {
      targets.push(spread.leftPage + 2, spread.leftPage + 3);
    }

    targets.forEach((page) => {
      const source = pageSourceFor(book, page);
      if (!source) return;
      const image = new Image();
      image.decoding = "async";
      image.src = toUrl(source);
    });
  }

  function showReaderControls(autoHide = true) {
    if (!els.readerLayout || !els.readerControls) return;
    state.controlsVisible = true;
    els.readerLayout.classList.add("is-controls-visible");
    els.readerControls.dataset.visible = "true";
    els.readerControls.toggleAttribute("inert", false);
    clearTimeout(state.controlsTimer);
    if (autoHide && !isTouchReaderControls()) {
      scheduleHideReaderControls(1800);
    }
  }

  function scheduleHideReaderControls(delay = 1200) {
    if (isTouchReaderControls()) return;
    clearTimeout(state.controlsTimer);
    state.controlsTimer = window.setTimeout(() => hideReaderControls(), delay);
  }

  function hideReaderControls() {
    if (!els.readerLayout || !els.readerControls) return;
    if (isTouchReaderControls()) {
      return;
    }
    if (isReaderControlInteractionActive()) {
      scheduleHideReaderControls(900);
      return;
    }
    state.controlsVisible = false;
    els.readerLayout.classList.remove("is-controls-visible");
    els.readerControls.dataset.visible = "false";
    els.readerControls.toggleAttribute("inert", true);
  }

  function isTouchReaderControls() {
    return window.matchMedia("(hover: none), (pointer: coarse)").matches;
  }

  function isReaderControlInteractionActive() {
    const active = document.activeElement;
    const keyboardFocus = Boolean(
      active
      && els.readerControls?.contains?.(active)
      && active.matches?.(":focus-visible")
    );

    return Boolean(
      els.readerControls?.matches?.(":hover")
      || keyboardFocus
    );
  }

  function handleReaderFrameError(event) {
    const frame = event.currentTarget;
    const page = Number(frame?.dataset.visiblePage || "0");
    const book = getCurrentBook();
    const message = readerFallbackMessage(book, page, "load");
    setReaderError(message);
    window.PSEU_BOOK_DIAGNOSTICS?.markFrameError?.(getCurrentBook(), page, frame?.dataset?.readerRole || "", frame?.dataset?.pageSource || "");
    updateReaderDebugPanel(getCurrentBook(), null, frame);
    const shell = frame?.closest?.(".reader-page-shell");
    showReaderFallback(shell, book, page, { message, context: "load" });
    completeReaderFallbackFrame(frame);
  }

  function setReaderError(message) {
    state.readerError = message;
    els.body.dataset.readerError = message;
    if (PDF_DEBUG && els.readerDebug) {
      els.readerDebug.textContent = message;
      els.readerDebug.classList.add("is-visible");
    }
  }

  function mountReaderDebugPanel() {
    if (!els.readerLayout) return;
    if (!PDF_DEBUG) return;
    els.readerDebug.className = "reader-debug";
    els.readerLayout.querySelector(".reader-shell")?.appendChild(els.readerDebug);
  }

  function updateReaderDebugPanel(book, spread, frame) {
    if (!PDF_DEBUG || !els.readerDebug) return;
    const current = frame?.dataset?.visiblePage || state.activePage;
    const source = frame?.dataset?.pageSource || readerDebugSourceFor(book, current);
    const lines = [
      `Livro: ${book?.title || "?"}`,
      `Página ativa: ${state.activePage}`,
      `Render mode: ${state.readerMode}`,
      `Fonte: ${source}`,
      `Erro: ${state.readerError || "nenhum"}`,
    ];
    els.readerDebug.textContent = lines.join(" | ");
    els.readerDebug.classList.toggle("is-visible", Boolean(state.readerError));
  }

  function readerDebugSourceFor(book, page) {
    const protectedEndpoint = getProtectedPdfEndpoint(book);
    const fragmentEndpoint = getFragmentPdfSource(book);
    const legacyEndpoint = getLegacyPdfSource(book);
    const source = protectedEndpoint || fragmentEndpoint || legacyEndpoint;
    return source ? `${source}${pdfFragment(pdfRenderPageFor(book, page))}` : "sem fonte";
  }

  function readerSourceModeFor(book) {
    if (getProtectedPdfEndpoint(book)) return "protected-endpoint";
    if (getFragmentPdfSource(book)) return "fragment-partial";
    if (getLegacyPdfSource(book)) return "legacy-external";
    return "none";
  }

  function handleReaderPointerMove(event) {
    if (event.pointerType === "mouse" || event.pointerType === "pen" || event.pointerType === "touch") {
      showReaderControls(true);
    }
  }

  function createDefaultContinuityState() {
    return {
      version: 1,
      lastFunnelStage: 1,
      maxFunnelStage: 1,
      fragmentsRead: [],
      lastVideoId: "",
      videos: {},
      updatedAt: null,
    };
  }

  function readContinuityState() {
    const fallback = createDefaultContinuityState();
    try {
      const parsed = JSON.parse(localStorage.getItem(CONTINUITY_STORAGE_KEY) || "{}");
      return {
        ...fallback,
        ...parsed,
        lastFunnelStage: clamp(Number(parsed.lastFunnelStage || 1), 1, 10),
        maxFunnelStage: clamp(Number(parsed.maxFunnelStage || parsed.lastFunnelStage || 1), 1, 10),
        fragmentsRead: Array.isArray(parsed.fragmentsRead) ? parsed.fragmentsRead.filter(Boolean).slice(0, 18) : [],
        videos: parsed.videos && typeof parsed.videos === "object" ? parsed.videos : {},
      };
    } catch {
      return fallback;
    }
  }

  function saveContinuityState() {
    try {
      state.continuity.updatedAt = Date.now();
      localStorage.setItem(CONTINUITY_STORAGE_KEY, JSON.stringify(state.continuity));
    } catch {}
  }

  function rememberFunnelStage(stageId) {
    const nextStage = clamp(Number(stageId || 1), 1, 10);
    if (isProtectedPortalRoute() && nextStage < 10) return;
    const changed = state.continuity.lastFunnelStage !== nextStage
      || nextStage > Number(state.continuity.maxFunnelStage || 1);
    state.continuity.lastFunnelStage = nextStage;
    state.continuity.maxFunnelStage = Math.max(Number(state.continuity.maxFunnelStage || 1), nextStage);
    if (changed) {
      saveContinuityState();
      updateContinuityUi();
    }
  }

  function rememberFunnelSection(sectionId) {
    if (isProtectedPortalRoute() && isExternalFunnelTarget(sectionId)) return;
    const stages = {
      "funil-chamado": 1,
      "funil-biblioteca": 2,
      "funil-travessia": 3,
      "portal-interno": 10,
    };
    if (stages[sectionId]) rememberFunnelStage(stages[sectionId]);
  }

  function setupContinuityObservers() {
    const targets = [
      ["funil-chamado", 1],
      ["funil-biblioteca", 2],
      ["funil-travessia", 3],
      ["portal-interno", 10],
    ];
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.36) return;
        const match = targets.find(([id]) => id === entry.target.id);
        if (match) rememberFunnelStage(match[1]);
      });
    }, { threshold: [0.36, 0.62] });
    targets.forEach(([id]) => {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
    });
  }

  function rememberFragmentRead(book) {
    if (!book?.id || state.continuity.fragmentsRead.includes(book.id)) return;
    state.continuity.fragmentsRead = [book.id, ...state.continuity.fragmentsRead].slice(0, 18);
    saveContinuityState();
    renderFunnelSection();
    updateContinuityUi();
  }

  function createFragmentReaderScope() {
    return {
      type: "fragment",
      bookId: FRAGMENT_BOOK_ID,
      allowedPages: [...FRAGMENT_ALLOWED_PAGES],
    };
  }

  function isFragmentReaderScope(book = getCurrentBook()) {
    return Boolean(state.readerScope?.type === "fragment" && book?.id === state.readerScope.bookId);
  }

  function getFragmentAllowedPages(book = getCurrentBook()) {
    if (!isFragmentReaderScope(book)) return [];
    const allowedPages = (state.readerScope.allowedPages || FRAGMENT_ALLOWED_PAGES)
      .map((page) => Number(page))
      .sort((a, b) => a - b);
    const maxPage = Number(book?.pageCount || 0);
    const maxAllowedPage = Math.max(...allowedPages, 0);
    const hasRealPageCount = Number.isFinite(maxPage) && maxPage >= maxAllowedPage;
    return allowedPages
      .filter((page) => Number.isFinite(page) && page >= 1)
      .filter((page) => !hasRealPageCount || page <= maxPage);
  }

  function normalizeFragmentPage(pageNumber, book) {
    const allowedPages = getFragmentAllowedPages(book);
    if (!allowedPages.length) return null;

    const page = Number(pageNumber);
    if (!Number.isFinite(page)) return allowedPages[0];
    if (allowedPages.includes(page)) return page;
    if (page <= allowedPages[0]) return allowedPages[0];
    if (page >= allowedPages[allowedPages.length - 1]) return allowedPages[allowedPages.length - 1];

    return allowedPages.reduce((closest, candidate) => (
      Math.abs(candidate - page) < Math.abs(closest - page) ? candidate : closest
    ), allowedPages[0]);
  }

  function syncFragmentEchoForPage(page, book = getCurrentBook()) {
    const allowedPages = getFragmentAllowedPages(book);
    const index = allowedPages.indexOf(Number(page));
    if (index >= 0) activeFragmentEcho = index;
  }

  function getCurrentFragmentEcho() {
    return FRAGMENT_ECHOS[activeFragmentEcho] || FRAGMENT_ECHOS[0] || null;
  }

  function navigateFragmentReaderPage(direction) {
    const book = getCurrentBook();
    const allowedPages = getFragmentAllowedPages(book);
    if (!allowedPages.length) return;

    const currentPage = normalizeFragmentPage(state.activePage, book);
    const currentIndex = Math.max(0, allowedPages.indexOf(currentPage));
    if (readerModeFor(book, currentPage) === "fragment-spread") {
      const groupStarts = [0, 1, 3].filter((index) => index < allowedPages.length);
      const currentGroupIndex = currentIndex <= 0 ? 0 : currentIndex <= 2 ? 1 : 2;
      const nextGroupIndex = currentGroupIndex + (direction < 0 ? -1 : 1);
      if (nextGroupIndex < 0 || nextGroupIndex >= groupStarts.length) {
        selectPage(allowedPages[groupStarts[currentGroupIndex]]);
        return;
      }

      activeFragmentEcho = groupStarts[nextGroupIndex];
      selectPage(allowedPages[groupStarts[nextGroupIndex]]);
      return;
    }

    const nextIndex = currentIndex + (direction < 0 ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= allowedPages.length) {
      selectPage(allowedPages[currentIndex]);
      return;
    }

    activeFragmentEcho = nextIndex;
    selectPage(allowedPages[nextIndex]);
  }

  function openFragmentReader(options = {}) {
    const book = books.find((candidate) => candidate.id === FRAGMENT_BOOK_ID);
    const bookIndex = books.findIndex((candidate) => candidate.id === FRAGMENT_BOOK_ID);
    if (!book || bookIndex < 0 || !els.readerLayout) return;

    rememberFragmentRead(book);
    activeFragmentEcho = 0;
    if (els.fragmentReader) {
      els.fragmentReader.hidden = true;
      els.fragmentReader.setAttribute("aria-hidden", "true");
      els.fragmentFrame?.removeAttribute("src");
    }
    els.body.classList.remove("is-fragment-open");

    selectBook(bookIndex, {
      readerScope: "fragment",
      open: false,
      preservePage: false,
      trackHistory: false,
    });

    const fragmentBook = books[bookIndex];
    const firstPage = getFragmentAllowedPages(fragmentBook)[0] || FRAGMENT_ALLOWED_PAGES[0];
    state.activePage = firstPage;
    state.resumePage = firstPage;
    state.activeChapterIndex = chapterIndexForPage(fragmentBook, firstPage);
    state.readerMode = readerModeFor(fragmentBook, firstPage);
    syncFragmentEchoForPage(firstPage, fragmentBook);
    updateChapterSelection();
    updatePageSelection();

    if (options.track !== false) {
      trackAnalytics("fragment_read_clicked", {
        section: "library",
        page: "page-2-fragment",
        bookId: book.id,
      });
    }

    openReader();
  }

  function closeFragmentReader() {
    if (isFragmentReaderScope(getCurrentBook()) && els.readerLayout?.classList.contains("is-open")) {
      closeReader();
      return;
    }
    if (!els.fragmentReader || els.fragmentReader.hidden) return;
    els.fragmentReader.hidden = true;
    els.fragmentReader.setAttribute("aria-hidden", "true");
    els.body.classList.remove("is-fragment-open");
    els.fragmentFrame?.removeAttribute("src");
    window.requestAnimationFrame(() => {
      const target = document.getElementById("fragmento-despertar") || els.fragmentOpen;
      target?.scrollIntoView({ behavior: "auto", block: "center" });
      els.fragmentOpen?.focus();
    });
  }

  function navigateFragmentEcho(direction) {
    const nextEcho = clamp(activeFragmentEcho + direction, 0, FRAGMENT_ECHOS.length - 1);
    if (nextEcho === activeFragmentEcho) return;
    activeFragmentEcho = nextEcho;
    renderFragmentEcho();
    const echo = FRAGMENT_ECHOS[activeFragmentEcho];
    trackAnalytics("fragment_page_advanced", {
      section: "library",
      page: `fragment-page-${echo.page}`,
      bookId: FRAGMENT_BOOK_ID,
      progress: Math.round(((activeFragmentEcho + 1) / FRAGMENT_ECHOS.length) * 100),
    });
  }

  function renderFragmentEcho() {
    const book = books.find((candidate) => candidate.id === FRAGMENT_BOOK_ID);
    const echo = FRAGMENT_ECHOS[activeFragmentEcho];
    if (!book || !echo) return;
    if (els.fragmentLabel) els.fragmentLabel.textContent = echo.label;
    if (els.fragmentCopy) els.fragmentCopy.textContent = echo.copy;
    if (els.fragmentProgress) {
      els.fragmentProgress.textContent = `${String(activeFragmentEcho + 1).padStart(2, "0")} / ${String(FRAGMENT_ECHOS.length).padStart(2, "0")}`;
    }
    els.fragmentFrame?.removeAttribute("src");
    if (els.fragmentPrev) els.fragmentPrev.disabled = activeFragmentEcho === 0;
    if (els.fragmentNext) els.fragmentNext.disabled = activeFragmentEcho === FRAGMENT_ECHOS.length - 1;
    if (els.fragmentEnding) els.fragmentEnding.hidden = activeFragmentEcho !== FRAGMENT_ECHOS.length - 1;
  }

  function hasFragmentRead(book) {
    return Boolean(book?.id && state.continuity.fragmentsRead.includes(book.id));
  }

  function hasVisitedBook(book) {
    const stored = state.bookStates?.[book?.id];
    return Boolean(stored && Number.isFinite(Number(stored.page)));
  }

  function isPrivatePdfMissing(book) {
    const provision = book?.privatePdfProvisioning || book?.provisioning?.privatePdf;
    return Boolean(book?.canRead && provision?.configured && provision.available === false);
  }

  function getBookPresenceLabel(book, context = "portal") {
    if (context === "preportal" && book?.id !== FRAGMENT_BOOK_ID) return "Arquivo selado";
    if (context === "preportal" && book?.id === FRAGMENT_BOOK_ID) {
      return hasFragmentRead(book) ? "Fragmento lido" : "Fragmento liberado";
    }
    if (isPrivatePdfMissing(book)) return "Arquivo protegido ainda não provisionado";
    if (!book?.available) return state.protectedBooks.loaded ? "Em desenvolvimento" : "Em breve";
    if (context === "preportal" && hasFragmentRead(book)) return "Fragmento lido";
    if (getStoredBookProgress(book) > 0) return "Em leitura";
    if (hasVisitedBook(book)) return "Visitado";
    return "Disponível";
  }

  function getFunnelVideoMemory(key) {
    if (!state.continuity.videos[key]) {
      state.continuity.videos[key] = {
        seconds: 0,
        progress: 0,
        completed: false,
        updatedAt: null,
      };
    }
    return state.continuity.videos[key];
  }

  function getFunnelVideoProgress(video) {
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return 0;
    return Math.max(0, Math.min(100, (video.currentTime / video.duration) * 100));
  }

  function rememberFunnelVideo(video, force = false) {
    if (isProtectedPortalRoute()) return;
    const key = video?.dataset?.funnelVideo;
    if (!key) return;
    const now = Date.now();
    const lastSavedAt = Number(funnelProgressSavedAt.get(key) || 0);
    const progress = getFunnelVideoProgress(video);
    const memory = getFunnelVideoMemory(key);
    state.continuity.lastVideoId = key;

    if (key === "main") rememberFunnelStage(progress >= 99 ? 6 : progress >= 50 ? 5 : 4);
    if (key === "offer") rememberFunnelStage(progress >= 99 ? 8 : 7);
    if (!force && now - lastSavedAt < FUNNEL_PROGRESS_SAVE_MS) return;

    memory.seconds = Number.isFinite(video.currentTime) ? Math.max(0, Math.round(video.currentTime)) : 0;
    memory.progress = Math.max(0, Math.min(100, Math.round(progress)));
    memory.completed = Boolean(video.ended || memory.progress >= 99);
    memory.updatedAt = now;
    funnelProgressSavedAt.set(key, now);
    saveContinuityState();
    updateContinuityUi();
  }

  function restoreFunnelVideoPoint(video) {
    const key = video?.dataset?.funnelVideo;
    const memory = key ? getFunnelVideoMemory(key) : null;
    if (!memory || memory.completed || Number(memory.seconds || 0) <= 2) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime > 1) return;
    video.currentTime = Math.min(Number(memory.seconds), Math.max(0, video.duration - 1));
  }

  function hasResumableFunnelVideo(key) {
    const memory = getFunnelVideoMemory(key);
    return !memory.completed && Number(memory.seconds || 0) > 2 && Number(memory.progress || 0) < 99;
  }

  function updateFunnelResumeUi() {
    els.funnelResumeStates.forEach((node) => {
      const key = node.dataset.vslResumeState;
      const resumable = hasResumableFunnelVideo(key);
      node.hidden = !resumable;
      const copy = node.querySelector("[data-vsl-resume-copy]");
      if (copy) {
        copy.textContent = key === "offer"
          ? "A decisão permanece aberta."
          : "A travessia continua.";
      }
    });
  }

  function getContinuityPrompt() {
    if (isProtectedPortalRoute()) return null;

    if (state.continuity.maxFunnelStage >= 2 || state.continuity.fragmentsRead.length || state.continuity.lastVideoId) {
      return {
        eyebrow: "Arquivo vivo",
        copy: "A biblioteca guardou o seu primeiro sinal.",
        label: "Retomar",
        action: "section",
        target: "funil-biblioteca",
      };
    }
    return null;
  }

  function updateContinuityUi() {
    updateFunnelResumeUi();
    const prompt = getContinuityPrompt();
    if (!els.continuityWhisper || !els.continuityAction) return;
    els.continuityWhisper.hidden = !prompt;
    if (!prompt) return;
    if (els.continuityEyebrow) els.continuityEyebrow.textContent = prompt.eyebrow;
    if (els.continuityCopy) els.continuityCopy.textContent = prompt.copy;
    els.continuityAction.textContent = prompt.label;
    els.continuityAction.dataset.continuityAction = prompt.action;
    els.continuityAction.dataset.continuityTarget = prompt.target || "";
  }

  function handleContinuityAction() {
    const action = els.continuityAction?.dataset?.continuityAction;
    const target = els.continuityAction?.dataset?.continuityTarget;
    if (action === "reader") {
      if (!isProtectedPortalRoute()) {
        navigateToSection("funil-biblioteca");
        return;
      }
      openContinueReading();
      return;
    }
    if (action === "video") {
      resumeFunnelVideo(target);
      return;
    }
    navigateToSection(target || "funil-biblioteca", {
      allowFunnelUnlock: true,
      instant: true,
    });
  }

  function showFunnelControls(key, autoHide = true) {
    const card = document.querySelector(`[data-funnel-video="${key}"]`)?.closest(".funnel-vsl-card");
    const video = document.querySelector(`[data-funnel-video="${key}"]`);
    if (!card) return;
    card.classList.add("is-vsl-controls-visible");
    clearTimeout(funnelControlsTimers.get(key));
    if (autoHide && video && !video.paused && !video.ended) {
      funnelControlsTimers.set(key, window.setTimeout(() => hideFunnelControls(key), 1800));
    }
  }

  function scheduleHideFunnelControls(key, delay = 1300) {
    const video = document.querySelector(`[data-funnel-video="${key}"]`);
    if (!video || video.paused || video.ended) {
      showFunnelControls(key, false);
      return;
    }
    clearTimeout(funnelControlsTimers.get(key));
    funnelControlsTimers.set(key, window.setTimeout(() => hideFunnelControls(key), delay));
  }

  function hideFunnelControls(key) {
    const card = document.querySelector(`[data-funnel-video="${key}"]`)?.closest(".funnel-vsl-card");
    const video = document.querySelector(`[data-funnel-video="${key}"]`);
    if (!card || !video || video.paused || video.ended) return;
    card.classList.remove("is-vsl-controls-visible");
  }

  function resumeFunnelVideo(key) {
    const video = document.querySelector(`[data-funnel-video="${key}"]`);
    if (!video) return;
    video.closest(".funnel-vsl-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (video.dataset.available === "false" || video.closest(".funnel-vsl-card")?.classList.contains("is-video-unavailable")) {
      markFunnelVideoUnavailable(video);
      return;
    }
    restoreFunnelVideoPoint(video);
    showFunnelControls(key);
    if (video.paused) toggleFunnelVideo(key);
  }

  function isDesktopOperationsSidebar() {
    return window.matchMedia("(min-width: 1181px)").matches;
  }

  function expandOperationsSidebar() {
    if (!isDesktopOperationsSidebar()) return;
    els.appShell?.classList.add("is-sidebar-expanded");
  }

  function collapseOperationsSidebar() {
    if (!isDesktopOperationsSidebar()) return;
    els.appShell?.classList.remove("is-sidebar-expanded");
  }

  function openMobileDrawer() {
    els.appShell?.classList.remove("is-sidebar-expanded");
    els.body.classList.add("is-sidebar-open");
    els.mobileDrawerBackdrop?.removeAttribute("hidden");
  }

  function closeMobileDrawer() {
    els.body.classList.remove("is-sidebar-open");
    els.mobileDrawerBackdrop?.setAttribute("hidden", "");
  }

  function navigateToSection(targetId, options = {}) {
    const resolvedTargetId = resolveFunnelTarget(targetId, options);
    const redirectedByGate = resolvedTargetId !== targetId;
    if (redirectedByGate) {
      options = { ...options, instant: true, remember: false, syncHash: false };
    }

    const section = document.getElementById(resolvedTargetId);
    if (!section && !options.beforeReveal) return;
    closeMobileDrawer();
    if (options.remember !== false) rememberFunnelSection(resolvedTargetId);
    if (options.syncHash !== false) syncSectionHash(resolvedTargetId);
    if (options.navTarget?.classList.contains("nav-item")) {
      els.navItems.forEach((nav) => nav.classList.toggle("is-active", nav === options.navTarget));
    }

    const context = TRAVERSAL_CONTEXTS[resolvedTargetId];
    const shouldTraverse = Boolean(context && els.traversalVeil && !options.instant && !els.body.classList.contains("is-reader-open"));
    const reveal = () => {
      options.beforeReveal?.();
      if (!isProtectedPortalRoute()) setUnlockedFunnelPages(resolvedTargetId);
      if (context) window.PSEU_ATMOSPHERE?.applyTheme?.(context);
      document.getElementById(resolvedTargetId)?.scrollIntoView({
        behavior: options.instant ? "auto" : "smooth",
        block: "start",
      });
    };

    if (!shouldTraverse) {
      reveal();
      return;
    }
    if (els.body.classList.contains("is-traversing")) return;

    const quality = els.body.dataset.atmosphereQuality || "full";
    const compact = quality !== "full" || window.matchMedia("(max-width: 800px)").matches;
    const closeDelay = compact ? 150 : resolvedTargetId === "portal-interno" ? 430 : 320;
    const finishDelay = compact ? 430 : resolvedTargetId === "portal-interno" ? 1180 : 880;

    els.body.dataset.traversalTarget = context;
    els.body.classList.add("is-traversing", "is-traversal-closing");
    window.setTimeout(() => {
      reveal();
      els.body.classList.remove("is-traversal-closing");
      els.body.classList.add("is-traversal-revealing");
    }, closeDelay);
    window.setTimeout(() => {
      els.body.classList.remove("is-traversing", "is-traversal-revealing");
      delete els.body.dataset.traversalTarget;
    }, finishDelay);
  }

  function setupHashRoutes() {
    window.addEventListener("hashchange", () => handleHashRoute());
    if (isProtectedPortalEntryRoute()) {
      openProtectedPortalEntry();
      return;
    }
  }

  function isProtectedPortalEntryRoute() {
    return isProtectedPortalPath();
  }

  function isProtectedPortalPath() {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    return path === "/portal" || window.PSEU_FORCE_INTERNAL_PORTAL === true;
  }

  function isolateExternalFunnelForProtectedPortal() {
    if (!isProtectedPortalPath()) return;
    els.body.classList.add("is-protected-portal", "is-portal-unlocked");

    if (els.preportal) {
      els.preportal.remove();
    }

    document.querySelectorAll(".preportal, .preportal-page, [data-fragment-reader], .traversal-veil").forEach((node) => {
      if (node === els.appShell || els.appShell?.contains(node)) return;
      node.hidden = true;
      node.toggleAttribute("inert", true);
      node.setAttribute("aria-hidden", "true");
      node.remove();
    });

    ["funil-chamado", "funil-biblioteca", "funil-travessia", "funil-oferta", "fragmento-despertar"].forEach((id) => {
      const page = document.getElementById(id);
      if (!page) return;
      page.hidden = true;
      page.toggleAttribute("inert", true);
      page.setAttribute("aria-hidden", "true");
      page.remove();
    });

    if (els.fragmentReader) {
      els.fragmentReader.hidden = true;
      els.fragmentReader.setAttribute("aria-hidden", "true");
      els.fragmentFrame?.removeAttribute("src");
    }

    els.body.dataset.funnelPage = "portal-interno";
    if (els.appShell) {
      els.appShell.hidden = false;
      els.appShell.removeAttribute("inert");
      els.appShell.setAttribute("aria-hidden", "false");
    }
  }

  function isExternalFunnelTarget(targetId = "") {
    const target = String(targetId || "");
    return target.startsWith("funil-") || target === "fragmento-despertar";
  }

  function getFunnelPageForTarget(targetId = "") {
    const target = String(targetId || "");
    if (target === "fragmento-despertar") return "funil-biblioteca";
    if (target === "funil-oferta") return "funil-travessia";
    if (target === "funil-chamado" || target === "funil-biblioteca" || target === "funil-travessia") {
      return target;
    }
    return "";
  }

  function getFunnelStageForTarget(targetId = "") {
    const target = getFunnelPageForTarget(targetId) || String(targetId || "");
    const stages = {
      "funil-chamado": 1,
      "funil-biblioteca": 2,
      "funil-travessia": 3,
    };
    return stages[target] || 1;
  }

  function getUnlockedFunnelStage() {
    return clamp(Number(state.funnelUnlockedStage || 1), 1, 3);
  }

  function resolveFunnelTarget(targetId, options = {}) {
    if (isProtectedPortalRoute() || !isExternalFunnelTarget(targetId)) return targetId;
    const requiredStage = getFunnelStageForTarget(targetId);
    const currentStage = getUnlockedFunnelStage();
    const openedByCurrentButton = options.navTarget?.dataset?.nav === targetId || options.allowFunnelUnlock === true;

    if (requiredStage <= 1 || currentStage >= requiredStage || openedByCurrentButton) {
      return targetId;
    }

    return currentStage >= 2 ? "funil-biblioteca" : "funil-chamado";
  }

  function setUnlockedFunnelPages(targetId = "funil-chamado", options = {}) {
    if (isProtectedPortalRoute() || !els.preportalPages?.length) return;
    const targetPageId = getFunnelPageForTarget(targetId) || "funil-chamado";
    const targetStage = getFunnelStageForTarget(targetPageId);
    const unlockedStage = options.reset
      ? targetStage
      : Math.max(getUnlockedFunnelStage(), targetStage);

    state.funnelUnlockedStage = clamp(unlockedStage, 1, 3);
    els.preportalPages.forEach((page) => {
      const visible = getFunnelStageForTarget(page.id) <= state.funnelUnlockedStage;
      page.hidden = !visible;
      page.toggleAttribute("inert", !visible);
      page.setAttribute("aria-hidden", visible ? "false" : "true");
    });
    els.body.dataset.funnelPage = targetPageId;
    els.body.dataset.funnelUnlockedStage = String(state.funnelUnlockedStage);
  }

  function applyInitialFunnelPage() {
    if (isProtectedPortalRoute()) return;
    state.funnelUnlockedStage = 1;
    setUnlockedFunnelPages("funil-chamado", { reset: true });
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search || ""}`);
    }
  }

  function clearProtectedPortalHash() {
    if (!isProtectedPortalPath() || !window.location.hash) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search || ""}`);
  }

  function openProtectedPortalEntry() {
    const forceScroll = () => {
      els.appShell?.scrollIntoView?.({ behavior: "auto", block: "start" });
    };
    const navigate = () => {
      try {
        if ("scrollRestoration" in window.history) {
          window.history.scrollRestoration = "manual";
        }
      } catch (error) {}
      clearProtectedPortalHash();
      isolateExternalFunnelForProtectedPortal();
      if (!state.portalUnlocked) unlockPortal({ scroll: false });
      navigateToSection("portal-interno", {
        remember: false,
        syncHash: false,
        instant: true,
      });
      forceScroll();
      window.requestAnimationFrame(forceScroll);
      window.setTimeout(forceScroll, 80);
      window.setTimeout(forceScroll, 320);
    };

    window.requestAnimationFrame(() => window.requestAnimationFrame(navigate));
  }

  function handleHashRoute(options = {}) {
    const hash = decodeURIComponent(window.location.hash || "").toLowerCase();
    if (!hash) return;
    if (hash === "#admin-pseu") {
      window.location.replace("admin-local.html");
      return;
    }
    if (isProtectedPortalPath()) {
      openProtectedPortalEntry();
      return;
    }

    const targetId = PSEU_HASH_ROUTES[hash];
    if (targetId && isExternalFunnelTarget(targetId)) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search || ""}`);
      return;
    }

    if (!targetId) return;

    const navigate = () => navigateToSection(targetId, {
      remember: false,
      syncHash: false,
      instant: true,
      beforeReveal: targetId === "portal-interno" && !state.portalUnlocked
        ? () => unlockPortal({ scroll: false })
        : undefined,
    });

    if (options.initial) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(navigate));
      return;
    }
    navigate();
  }

  function syncSectionHash(targetId) {
    if (!isProtectedPortalRoute() && isExternalFunnelTarget(targetId)) return;
    const hash = PSEU_SECTION_HASHES[targetId];
    if (!hash || window.location.hash === hash) return;
    window.history.replaceState(null, "", hash);
  }

  function normalizeCheckoutUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (!/^https?:\/\//i.test(url)) return "";

    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return "";
      return parsed.href;
    } catch {
      return "";
    }
  }

  function isLocalDevelopmentHost() {
    const host = window.location.hostname;
    return window.location.protocol === "file:"
      || host === "localhost"
      || host === "127.0.0.1"
      || host === "::1";
  }

  function getInlineCheckoutUrl() {
    return normalizeCheckoutUrl(
      window.PSEU_GUMROAD_CHECKOUT_URL
      || window.PSEU_CHECKOUT_CONFIG?.checkoutUrl
      || window.PSEU_CHECKOUT_CONFIG?.gumroadCheckoutUrl
      || ""
    );
  }

  function readCheckoutConfig() {
    if (checkoutConfigPromise) return checkoutConfigPromise;

    checkoutConfigPromise = (async () => {
      const inlineCheckoutUrl = getInlineCheckoutUrl();
      if (inlineCheckoutUrl) {
        return {
          checkoutUrl: inlineCheckoutUrl,
          checkoutConfigured: true,
          devMode: isLocalDevelopmentHost(),
          source: "inline",
        };
      }

      try {
        const response = await fetch(CHECKOUT_CONFIG_ENDPOINT, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`checkout_config_${response.status}`);

        const payload = await response.json();
        const checkoutUrl = normalizeCheckoutUrl(payload.checkoutUrl || payload.gumroadCheckoutUrl || "");
        return {
          ...payload,
          checkoutUrl,
          checkoutConfigured: Boolean(checkoutUrl),
          devMode: Boolean(payload.devMode),
          source: "api",
        };
      } catch (error) {
        return {
          checkoutUrl: "",
          checkoutConfigured: false,
          devMode: isLocalDevelopmentHost(),
          source: "fallback",
          error: error?.message || "checkout_config_error",
        };
      }
    })();

    return checkoutConfigPromise;
  }

  function showCheckoutNotice(message) {
    if (typeof window.alert === "function") {
      window.alert(message);
      return;
    }
    console.warn(`[PSEU CHECKOUT] ${message}`);
  }

  function clearLocalPortalAuthState() {
    try {
      localStorage.removeItem("pseu.portal.unlocked");
      const raw = localStorage.getItem("pseu.reader.state");
      if (!raw) return;

      const payload = JSON.parse(raw);
      if (!payload || typeof payload !== "object") return;

      payload.portalUnlocked = false;
      localStorage.setItem("pseu.reader.state", JSON.stringify(payload));
    } catch {}
  }

  async function handlePortalLogout(button) {
    if (button?.disabled) return;

    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "Saindo";
    }

    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (!response.ok && response.status !== 401) {
      throw new Error(`logout_${response.status}`);
    }

    clearLocalPortalAuthState();
    window.location.assign("/acesso");
  }

  function openPortalDevFallback() {
    navigateToSection("portal-interno", {
      beforeReveal: () => unlockPortal({ scroll: false }),
      remember: false,
    });
  }

  async function handleFinalCheckout() {
    const config = await readCheckoutConfig();

    if (config.checkoutUrl) {
      trackAnalytics("final_cta_checkout_redirect", {
        section: "travessia",
        page: "page-3",
        funnelStage: 9,
      });
      window.location.assign(config.checkoutUrl);
      return;
    }

    const canUseDevFallback = Boolean(config.devMode && isLocalDevelopmentHost());
    const message = canUseDevFallback
      ? "Checkout Gumroad ainda nao configurado. Em desenvolvimento, use /acesso para entrar com uma sessao valida. Compra real depende de Gumroad, webhook, banco, sessao e acesso em /acesso."
      : "Checkout Gumroad ainda nao configurado. A compra real ainda nao esta disponivel.";

    showCheckoutNotice(message);
    trackAnalytics("final_cta_checkout_missing_config", {
      section: "travessia",
      page: "page-3",
      funnelStage: 9,
      devFallback: canUseDevFallback,
    });

    if (canUseDevFallback) return;
  }

  function setupContentProvisioning() {
    if (!contentProvisioning) return;

    contentProvisioning.registerBooks(books, {
      coverAssets,
      backendBookIds: LOCAL_BOOK_ID_TO_BACKEND,
      fragmentBookId: FRAGMENT_BOOK_ID,
      fragmentSource: FRAGMENT_PDF_SOURCE,
    });
    contentProvisioning.registerVideos(FUNNEL_MEDIA);
    syncContentProvisioningIntoBooks();

    window.addEventListener(contentProvisioning.eventName || "pseu:content-provisioning-updated", handleContentProvisioningUpdate);
    void contentProvisioning.verifyAll()
      .then(() => {
        syncContentProvisioningIntoBooks();
        scheduleContentProvisioningRefresh();
      })
      .catch((error) => {
        console.warn("[PSEU] Provisionamento de conteudo indisponivel.", error);
      });
  }

  function handleContentProvisioningUpdate() {
    syncContentProvisioningIntoBooks();
    scheduleContentProvisioningRefresh();
  }

  function scheduleContentProvisioningRefresh() {
    window.clearTimeout(contentProvisioningRefreshTimer);
    contentProvisioningRefreshTimer = window.setTimeout(() => {
      renderLibrary();
      renderFunnelSection();
      syncFunnelMedia();
      const currentBook = getCurrentBook();
      if (currentBook) {
        updateHero(currentBook);
        renderImageRail(currentBook);
      }
      refreshLibraryTiles();
    }, 60);
  }

  function syncContentProvisioningIntoBooks() {
    if (!contentProvisioning) return;

    books.forEach((book) => {
      const provision = getBookProvisioning(book);
      if (!provision) return;

      book.provisioning = {
        ...(book.provisioning || {}),
        ...provision,
      };
      book.provisionedCover = provision.cover?.source || book.provisionedCover || "";
      book.fragmentProvisioning = provision.fragment || book.fragmentProvisioning || null;
      book.privatePdfProvisioning = provision.privatePdf || book.privatePdfProvisioning || null;
    });
  }

  function getBookProvisioning(book) {
    if (!book?.id || !contentProvisioning) return null;
    return contentProvisioning.book(book.id);
  }

  function getProvisionedCoverSource(book) {
    if (!book) return "";
    const provision = getBookProvisioning(book)?.cover || book.provisioning?.cover || null;
    const fallback = coverAssets[book.number] || "";

    if (provision?.available === true && provision.source) return provision.source;
    if (provision?.available === false) return fallback && fallback !== provision.source ? fallback : "";
    return provision?.source || book.provisionedCover || book.cover || fallback || "";
  }

  function setProvisionedImage(image, source, alt) {
    if (!image) return;
    image.alt = alt || "";

    if (!source) {
      image.removeAttribute("src");
      image.hidden = true;
      return;
    }

    image.hidden = false;
    image.src = toUrl(source);
  }

  function getProvisionedVideoAsset(key, assetKey) {
    const provision = contentProvisioning?.video(key);
    return provision?.[assetKey] || null;
  }

  function setupProtectedBooksBridge() {
    window.addEventListener("pseu:books-ready", (event) => {
      applyProtectedBooksPayload(event.detail);
    });

    if (window.PSEU_PORTAL_BOOKS) {
      applyProtectedBooksPayload(window.PSEU_PORTAL_BOOKS);
    }

    if (isProtectedPortalRoute()) {
      void loadProtectedBooksFromApi();
    }
  }

  function isProtectedPortalRoute() {
    return isProtectedPortalPath() || Boolean(window.PSEU_AUTH_USER);
  }

  async function loadProtectedBooksFromApi() {
    if (state.protectedBooks.loading) return;
    state.protectedBooks.loading = true;
    state.protectedBooks.error = "";

    try {
      const response = await fetch("/api/books", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (response.status === 401 && isProtectedPortalRoute()) {
        window.location.replace("/acesso?returnTo=/portal");
        return;
      }

      if (!response.ok) {
        throw new Error(`books_api_${response.status}`);
      }

      const payload = await response.json();
      applyProtectedBooksPayload(payload);
    } catch (error) {
      state.protectedBooks.error = error?.message || "books_api_error";
      console.warn("[PSEU AUTH] Permissoes reais indisponiveis. Mantendo compatibilidade local.", error);
    } finally {
      state.protectedBooks.loading = false;
    }
  }

  function applyProtectedBooksPayload(payload = {}) {
    const entries = Array.isArray(payload?.books)
      ? payload.books
      : Array.isArray(payload)
        ? payload
        : [];

    if (!entries.length) return;
    contentProvisioning?.applyProtectedBooksPayload?.(entries);

    const byId = {};
    entries.forEach((entry) => {
      const backendBookId = String(entry.bookId || "").trim();
      if (!backendBookId) return;
      const localBookId = BACKEND_BOOK_ID_ALIASES[backendBookId] || backendBookId;
      byId[localBookId] = {
        bookId: backendBookId,
        localBookId,
        title: entry.title || "",
        status: entry.status || (entry.canRead ? "unlocked" : "locked"),
        source: entry.source || null,
        canRead: Boolean(entry.canRead),
        pdfEndpoint: entry.pdfEndpoint || null,
        provisioning: entry.provisioning || {},
      };
    });

    state.protectedBooks.loaded = true;
    state.protectedBooks.byId = byId;

    books.forEach(applyProtectedBookAccess);
    syncContentProvisioningIntoBooks();
    syncActiveBookWithEntitlements();
    renderLibrary();
    updateProgressBadge(getCurrentBook());
    renderPortalMemory();
    renderOperations();
    updateContinuityUi();
    if (els.readerLayout?.classList.contains("is-open")) {
      updateReader(getCurrentBook());
    }
  }

  function applyProtectedBookAccess(book) {
    if (!book?.id || !state.protectedBooks.loaded) return book;

    const backendBookId = LOCAL_BOOK_ID_TO_BACKEND[book.id] || book.backendBookId || book.id;
    const entitlement = state.protectedBooks.byId[book.id] || null;
    const canRead = Boolean(entitlement?.canRead && entitlement?.pdfEndpoint);

    book.backendBookId = entitlement?.bookId || backendBookId;
    book.entitlementStatus = entitlement?.status || "locked";
    book.entitlementSource = entitlement?.source || null;
    book.canRead = canRead;
    book.pdfEndpoint = canRead ? entitlement?.pdfEndpoint || `/api/books/${encodeURIComponent(backendBookId)}/pdf` : "";
    book.privatePdfProvisioning = entitlement?.provisioning?.privatePdf || book.privatePdfProvisioning || null;
    book.provisioning = {
      ...(book.provisioning || {}),
      ...(getBookProvisioning(book) || {}),
      ...(entitlement?.provisioning || {}),
    };
    book.available = canRead;
    book.status = canRead ? "available" : "locked";

    return book;
  }

  function syncActiveBookWithEntitlements() {
    if (!state.protectedBooks.loaded || isBookReadable(books[state.activeIndex])) return;

    const nextReadableIndex = books.findIndex(isBookReadable);
    if (nextReadableIndex < 0) return;

    selectBook(nextReadableIndex, {
      open: false,
      preservePage: false,
      trackHistory: false,
    });
  }

  function isBookReadable(book) {
    return Boolean(book && book.available !== false);
  }

  function getBookCardDescription(book) {
    if (!book) return "";
    const proposal = book.summary || book.shortDescription || book.category || "Um arquivo da travessia PSEU.";
    if (isPrivatePdfMissing(book)) {
      return `Proposta: ${proposal} Estado: Arquivo protegido ainda não provisionado.`;
    }
    if (book.available === false || book.status === "em breve" || book.status === "locked") {
      const stateCopy = book.number === 18
        ? "Arquivo final selado. A ultima peca permanece preservada ate a hora certa."
        : "Biblioteca em expansao. A capa permanece visivel; a leitura segue em desenvolvimento.";
      return `Proposta: ${proposal} Estado: ${stateCopy}`;
    }
    const transformation = book.phrase || book.readerSubtitle || book.subtitle || "Uma passagem interna preparada para mudar a forma de leitura.";
    const benefit = book.caption || book.longDescription || book.mood || "Clareza, presença e continuidade dentro do Portal.";
    return `Proposta: ${proposal} Transformação: ${transformation} Benefício: ${benefit}`;
  }

  function renderLibrary() {
    const template = document.getElementById("library-tile-template");
    els.libraryGrid.innerHTML = "";

    books
      .filter((book) => !state.search || `${book.title} ${book.mood} ${book.act}`.toLowerCase().includes(state.search))
      .forEach((book) => {
        const node = template.content.firstElementChild.cloneNode(true);
        node.dataset.bookIndex = String(books.indexOf(book));
        node.dataset.bookId = book.id || "";
        node.dataset.bookNumber = String(book.number || "");
        node.dataset.backendBookId = book.backendBookId || LOCAL_BOOK_ID_TO_BACKEND[book.id] || book.id || "";
        node.classList.toggle("is-active", books[state.activeIndex]?.id === book.id);
        node.classList.toggle("library-tile--featured", book.number <= 2);
        node.classList.toggle("library-tile--key-final", book.number === 18);
        node.classList.toggle("library-tile--locked", !book.available);
        node.classList.toggle("library-tile--visited", hasVisitedBook(book));
        node.classList.toggle("library-tile--fragment-read", hasFragmentRead(book));
        node.disabled = false;
        node.setAttribute("aria-disabled", book.available ? "false" : "true");
        node.title = book.available ? `Abrir ${book.title}` : `${book.title} · Em desenvolvimento`;
        const cover = node.querySelector(".library-tile__cover");
        setProvisionedImage(cover, getProvisionedCoverSource(book), book.title);
        node.querySelector(".library-tile__number").textContent = String(book.number).padStart(2, "0");
        node.querySelector(".library-tile__title").textContent = book.title;
        node.querySelector(".library-tile__mood").textContent = book.mood;
        const descriptionNode = node.querySelector(".library-tile__description");
        if (descriptionNode) descriptionNode.textContent = getBookCardDescription(book);
        const statusNode = node.querySelector(".library-tile__status");
        if (statusNode) statusNode.textContent = getBookPresenceLabel(book);
        const progressNode = node.querySelector(".library-tile__progress i");
        if (progressNode) progressNode.style.width = `${getBookTileProgress(book)}%`;
        const lockNode = node.querySelector(".library-tile__lock");
        if (lockNode) lockNode.hidden = Boolean(book.available);
        els.libraryGrid.appendChild(node);
      });
    updateLibrarySelection();
  }

  function renderChapterList(book) {
    const template = document.getElementById("chapter-template");
    els.chapterList.innerHTML = "";

    if (!book.chapters?.length) {
      const empty = document.createElement("div");
      empty.className = "chapter-item";
      empty.innerHTML = `
        <span class="chapter-item__index">EM BREVE</span>
        <span class="chapter-item__title">${book.title}</span>
        <small class="chapter-item__meta">Leitura interna preparada para expansão futura.</small>
      `;
      els.chapterList.appendChild(empty);
      return;
    }

    book.chapters.forEach((chapter, index) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.chapterIndex = String(index);
      node.classList.toggle("is-active", index === state.activeChapterIndex);
      node.querySelector(".chapter-item__index").textContent = chapter.range;
      node.querySelector(".chapter-item__title").textContent = chapter.title;
      node.querySelector(".chapter-item__meta").textContent = `${chapter.state} · página ${chapter.page}`;
      els.chapterList.appendChild(node);
    });
  }

  function renderImageRail(book) {
    const template = document.getElementById("image-template");
    els.imageStack.innerHTML = "";

    const visuals = book.visuals?.length ? book.visuals : [{ src: getProvisionedCoverSource(book), title: book.title, label: "Fragmento visual" }];
    visuals.forEach((item) => {
      const node = template.content.firstElementChild.cloneNode(true);
      setProvisionedImage(node.querySelector("img"), item.src, item.title || book.title);
      node.querySelector(".image-card__copy span").textContent = item.label || book.title;
      node.querySelector(".image-card__copy strong").textContent = item.title || book.title;
      els.imageStack.appendChild(node);
    });
  }

  function renderPageStrip(book) {
    if (!els.pageStrip) return;
    els.pageStrip.innerHTML = "";
    const stops = book.pageStops || [{ page: 1, label: "01", title: book.title }];
    stops.forEach((stop) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-strip__item";
      button.dataset.stopPage = String(stop.page);
      button.dataset.pageIndex = String(stop.page);
      button.innerHTML = `
        <span class="page-strip__label">${stop.label}</span>
        <strong class="page-strip__title">${stop.title}</strong>
        <small class="page-strip__meta">p. ${stop.page}</small>
      `;
      button.classList.toggle("is-active", stop.page === state.activePage);
      els.pageStrip.appendChild(button);
    });
  }

  function updateLibrarySelection() {
    document.querySelectorAll(".library-tile").forEach((tile) => {
      tile.classList.toggle("is-active", Number(tile.dataset.bookIndex) === state.activeIndex);
    });
  }

  function refreshLibraryTiles() {
    document.querySelectorAll(".library-tile").forEach((tile) => {
      const index = Number(tile.dataset.bookIndex);
      const book = books[index];
      if (!book) return;
      const preportal = Boolean(tile.closest(".preportal, .preportal-page"));
      const available = preportal ? book.id === FRAGMENT_BOOK_ID : book.available;
      tile.dataset.backendBookId = book.backendBookId || LOCAL_BOOK_ID_TO_BACKEND[book.id] || book.id || "";
      tile.classList.toggle("library-tile--locked", !available);
      tile.classList.toggle("library-tile--visited", hasVisitedBook(book));
      tile.classList.toggle("library-tile--fragment-read", hasFragmentRead(book));
      tile.disabled = false;
      tile.setAttribute("aria-disabled", available ? "false" : "true");
      tile.title = available ? `Abrir ${book.title}` : `${book.title} · Em desenvolvimento`;
      const statusNode = tile.querySelector(".library-tile__status");
      if (statusNode) statusNode.textContent = getBookPresenceLabel(book, tile.closest(".preportal, .preportal-page") ? "preportal" : "portal");
      const progressNode = tile.querySelector(".library-tile__progress i");
      if (progressNode) progressNode.style.width = `${getBookTileProgress(book)}%`;
      const lockNode = tile.querySelector(".library-tile__lock");
      if (lockNode) lockNode.hidden = available;
    });
    updateLibrarySelection();
  }

  function renderFunnelSection() {
    if (!els.funnelBooks) return;
    const template = document.getElementById("library-tile-template");
    els.funnelBooks.innerHTML = "";
    if (els.libraryKeyFinal) els.libraryKeyFinal.innerHTML = "";
    let keyThresholdFrameSource = "livros/capas do livros difinitivo/ChatGPT Image 8 de dez. de 2025, 02_46_53.png";
    const editorialInterludes = new Map([
      [3, {
        variant: "threshold",
        eyebrow: "Primeira ruptura",
        title: "Alguns livros informam.",
        copy: "Estes observam onde a sua mente tenta escapar.",
      }],
      [8, {
        variant: "silence",
        eyebrow: "Pausa",
        title: "A travessia também acontece no intervalo.",
        copy: "Continue sem pressa. O arquivo seguinte não precisa gritar para atravessar.",
      }],
      [13, {
        variant: "mirror",
        eyebrow: "Segundo limiar",
        title: "Você já não está diante de uma coleção.",
        copy: "Está cercado pelos reflexos que antecedem a chave.",
      }],
    ]);

    books.forEach((book, index) => {
      const node = template.content.firstElementChild.cloneNode(true);
      const externalFragmentAvailable = book.id === FRAGMENT_BOOK_ID;
      node.dataset.bookIndex = String(index);
      node.dataset.bookNumber = String(book.number);
      node.classList.toggle("library-tile--key-final", book.number === 18);
      node.classList.toggle("is-active", books[state.activeIndex]?.id === book.id);
      node.classList.toggle("library-tile--featured", book.number <= 2 || book.number === 18);
      node.classList.toggle("library-tile--locked", !externalFragmentAvailable);
      node.classList.toggle("library-tile--visited", hasVisitedBook(book));
      node.classList.toggle("library-tile--fragment-read", hasFragmentRead(book));
      node.disabled = false;
      node.setAttribute("aria-disabled", externalFragmentAvailable ? "false" : "true");
      node.title = externalFragmentAvailable ? `Ler fragmento de ${book.title}` : `${book.title} · Arquivo selado`;
      const cover = node.querySelector(".library-tile__cover");
      setProvisionedImage(cover, getProvisionedCoverSource(book), book.title);
      cover.loading = "eager";
      cover.decoding = "async";
      node.querySelector(".library-tile__number").textContent = String(book.number).padStart(2, "0");
      node.querySelector(".library-tile__title").textContent = book.title;
      node.querySelector(".library-tile__mood").textContent = book.number === 18 ? "A Chave" : book.mood;
      const descriptionNode = node.querySelector(".library-tile__description");
      if (descriptionNode) descriptionNode.textContent = getBookCardDescription(book);
      const statusNode = node.querySelector(".library-tile__status");
      if (statusNode) statusNode.textContent = getBookPresenceLabel(book, "preportal");
      const progressNode = node.querySelector(".library-tile__progress i");
      if (progressNode) progressNode.style.width = `${getBookTileProgress(book)}%`;
      const lockNode = node.querySelector(".library-tile__lock");
      if (lockNode) {
        lockNode.hidden = externalFragmentAvailable;
      }
      const destination = book.number === 18 && els.libraryKeyFinal
        ? els.libraryKeyFinal
        : els.funnelBooks;
      destination.appendChild(node);

      const interlude = editorialInterludes.get(book.number);
      if (interlude) {
        const marker = document.createElement("article");
        marker.className = `library-official__interlude library-official__interlude--${interlude.variant}`;
        marker.innerHTML = `
          <span>${interlude.eyebrow}</span>
          <h4>${interlude.title}</h4>
          <p>${interlude.copy}</p>
        `;
        els.funnelBooks.appendChild(marker);
      }
    });

    if (els.libraryKeyFinal && keyThresholdFrameSource) {
      const thresholdFrame = document.createElement("img");
      thresholdFrame.className = "library-key-final__threshold-frame";
      thresholdFrame.src = toUrl(keyThresholdFrameSource);
      thresholdFrame.alt = "Moldura de transição para a chave";
      thresholdFrame.loading = "eager";
      thresholdFrame.decoding = "async";
      els.libraryKeyFinal.prepend(thresholdFrame);
    }
  }

  function enhanceSensoryLettering() {
    const targetGroups = [
      [".call-official__identity h1", "hero"],
      [".call-official__identity p", "portal-mark"],
      [".call-official__manifesto h2", "hero"],
      [".call-official__scene--revelation h2", "hero"],
      [".preportal-page--library .editorial-threshold h2", "threshold"],
      [".library-key-final__copy h3", "threshold"],
      [".editorial-threshold--travessia h2", "threshold"],
      [".travessia-official__prologue h3", "travessia"],
      [".travessia-official__flow .funnel-vsl-copy h3", "travessia"],
      [".travessia-official__chapter h3", "travessia"],
      [".travessia-official__pillars h3", "travessia"],
      [".travessia-official__quote strong", "travessia"],
      [".travessia-official__offer-threshold h3", "travessia"],
      [".travessia-official__access h3", "travessia"],
      [".travessia-white-threshold strong", "travessia"],
      [".recovered-archives__gate h3", "travessia"],
      [".travessia-official__offer-prologue h3", "travessia"],
      [".preportal-page--travessia .preportal-final-cta h2", "threshold"],
    ];
    const targets = new Map();

    targetGroups.forEach(([selector, tone]) => {
      document.querySelectorAll(selector).forEach((target) => targets.set(target, tone));
    });

    let targetIndex = 0;
    targets.forEach((tone, target) => {
      target.classList.add("sensory-type", `sensory-type--${tone}`);
      target.style.setProperty("--sensory-cycle", `${11.2 + (targetIndex % 4) * 0.8}s`);
      target.style.setProperty("--sensory-delay", `${(targetIndex % 5) * -1.1}s`);
      targetIndex += 1;

      if (target.dataset.sensoryLettering === "true") return;
      const label = target.textContent.replace(/\s+/g, " ").trim();
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let letterIndex = 0;

      while (walker.nextNode()) {
        if (walker.currentNode.textContent) textNodes.push(walker.currentNode);
      }

      textNodes.forEach((textNode) => {
        const fragment = document.createDocumentFragment();
        textNode.textContent.split(/(\s+)/).forEach((segment) => {
          if (!segment) return;
          if (/\s/.test(segment)) {
            fragment.appendChild(document.createTextNode(segment));
            return;
          }

          const word = document.createElement("span");
          word.className = "sensory-word";
            Array.from(segment).forEach((character) => {
              const letter = document.createElement("span");
              letter.className = "sensory-letter";
              letter.setAttribute("aria-hidden", "true");
              letter.style.setProperty("--letter-tilt", `${((letterIndex % 5) - 2) * 0.36}deg`);
              letter.style.setProperty("--letter-yaw", `${((letterIndex % 7) - 3) * 0.48}deg`);
              letter.style.setProperty("--letter-turn", `${((letterIndex % 3) - 1) * 0.28}deg`);
              letter.textContent = character;
              word.appendChild(letter);
              letterIndex += 1;
          });
          fragment.appendChild(word);
        });
        textNode.replaceWith(fragment);
      });

      if (label) target.setAttribute("aria-label", label);
      target.dataset.sensoryLettering = "true";
    });
  }

  function updateRecoveredArchiveUi() {
    if (!els.recoveredArchives) return;
    els.recoveredArchiveButtons.forEach((button) => {
      const index = Number(button.dataset.recoveredOpen);
      const isComplete = state.recoveredArchives.completed.includes(index);
      const isUnlocked = index <= state.recoveredArchives.unlocked;
      const label = button.querySelector(`[data-recovered-file-state="${index}"]`);

      button.disabled = !isUnlocked;
      button.setAttribute("aria-disabled", String(!isUnlocked));
      button.classList.toggle("recovered-archives__file--locked", !isUnlocked);
      button.classList.toggle("recovered-archives__file--complete", isComplete);
      if (label) label.textContent = isComplete ? "Concluído" : isUnlocked ? "Disponível" : "Bloqueado";
    });
  }

  function getRecoveredArchiveWatch(index) {
    if (!state.recoveredArchives.watch[index]) {
      state.recoveredArchives.watch[index] = {
        watched: 0,
        lastTime: 0,
        lastTick: 0,
      };
    }
    return state.recoveredArchives.watch[index];
  }

  function mountRecoveredArchiveScreen() {
    if (!els.recoveredArchiveScreen || els.recoveredArchiveScreen.parentElement === document.body) return;
    document.body.appendChild(els.recoveredArchiveScreen);
  }

  function getNextRecoveredArchiveIndex() {
    const next = RECOVERED_ARCHIVE_FILES.find((file) => {
      return file.index <= state.recoveredArchives.unlocked && !state.recoveredArchives.completed.includes(file.index);
    });
    return next?.index || Math.min(state.recoveredArchives.unlocked, RECOVERED_ARCHIVE_FILES.length);
  }

  function openRecoveredArchive(index) {
    const config = RECOVERED_ARCHIVE_FILES.find((file) => file.index === index);
    if (!config || index > state.recoveredArchives.unlocked || !els.recoveredArchiveScreen || !els.recoveredArchiveVideo) return;

    rememberRecoveredArchiveProgress();
    hideRecoveredArchiveNotice();
    els.funnelVideos.forEach((video) => video.pause());
    state.recoveredArchives.activeIndex = index;
    if (els.recoveredArchiveTitle) els.recoveredArchiveTitle.textContent = config.title;
    if (els.recoveredArchiveStatus) els.recoveredArchiveStatus.textContent = config.status;

    els.recoveredArchiveVideo.pause();
    if (els.recoveredArchiveVideo.dataset.archiveIndex !== String(index)) {
      els.recoveredArchiveVideo.src = toUrl(config.video);
      els.recoveredArchiveVideo.dataset.archiveIndex = String(index);
      els.recoveredArchiveVideo.load();
      els.recoveredArchiveVideo.addEventListener("loadedmetadata", () => {
        restoreRecoveredArchiveProgress(index);
        resetRecoveredArchiveWatchAnchor();
      }, { once: true });
    } else {
      restoreRecoveredArchiveProgress(index);
      resetRecoveredArchiveWatchAnchor();
    }
    els.recoveredArchiveVideo.controls = true;

    els.recoveredArchiveScreen.hidden = false;
    els.recoveredArchiveScreen.setAttribute("aria-hidden", "false");
    els.body.classList.add("is-recovered-archive-open");
    els.recoveredArchiveClose?.focus?.();

    const playPromise = els.recoveredArchiveVideo.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  }

  function rememberRecoveredArchiveProgress() {
    const video = els.recoveredArchiveVideo;
    const index = Number(video?.dataset.archiveIndex || state.recoveredArchives.activeIndex);
    if (!video || !index || !Number.isFinite(video.currentTime)) return;
    if (video.ended) return;
    state.recoveredArchives.progress[index] = Math.max(0, video.currentTime);
  }

  function restoreRecoveredArchiveProgress(index) {
    const video = els.recoveredArchiveVideo;
    const seconds = Number(state.recoveredArchives.progress[index] || 0);
    if (!video || !Number.isFinite(seconds) || seconds <= 1) return;
    if (Number.isFinite(video.duration) && video.duration > 0 && seconds >= video.duration - 1) return;
    try {
      video.currentTime = seconds;
    } catch {}
  }

  function handleRecoveredArchiveTimeUpdate() {
    rememberRecoveredArchiveProgress();
    recordRecoveredArchiveWatchTime();
  }

  function markRecoveredArchiveSeeking() {
    rememberRecoveredArchiveProgress();
    state.recoveredArchives.seeking = true;
  }

  function resetRecoveredArchiveWatchAnchor() {
    const video = els.recoveredArchiveVideo;
    const index = Number(video?.dataset.archiveIndex || state.recoveredArchives.activeIndex);
    if (!video || !index) return;
    const watch = getRecoveredArchiveWatch(index);
    watch.lastTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    watch.lastTick = recoveredArchiveNow();
    state.recoveredArchives.seeking = false;
  }

  function recordRecoveredArchiveWatchTime(options = {}) {
    const video = els.recoveredArchiveVideo;
    const index = Number(video?.dataset.archiveIndex || state.recoveredArchives.activeIndex);
    if (!video || !index || !Number.isFinite(video.currentTime)) return;
    if (!options.allowPaused && video.paused) {
      resetRecoveredArchiveWatchAnchor();
      return;
    }

    const duration = Number(video.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      resetRecoveredArchiveWatchAnchor();
      return;
    }

    const watch = getRecoveredArchiveWatch(index);
    const now = recoveredArchiveNow();
    const elapsed = Math.max(0, (now - Number(watch.lastTick || now)) / 1000);
    const current = video.currentTime;
    const delta = current - Number(watch.lastTime || 0);
    const rate = Math.max(0.25, Math.abs(Number(video.playbackRate || 1)));
    const maxNaturalDelta = Math.max(1.25, elapsed * rate * 1.75 + 0.35);

    if (!state.recoveredArchives.seeking && delta > 0 && delta <= maxNaturalDelta) {
      watch.watched = Math.min(duration, Number(watch.watched || 0) + delta);
    }

    watch.lastTime = current;
    watch.lastTick = now;
    state.recoveredArchives.seeking = false;
  }

  function getRecoveredArchiveWatchedRatio(index) {
    const duration = Number(els.recoveredArchiveVideo?.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    const watch = getRecoveredArchiveWatch(index);
    return Math.min(1, Number(watch.watched || 0) / duration);
  }

  function recoveredArchiveNow() {
    return window.performance?.now?.() || Date.now();
  }

  function showRecoveredArchiveNotice() {
    if (!els.recoveredArchiveNotice) return;
    window.clearTimeout(recoveredArchiveNoticeTimer);
    els.recoveredArchiveNotice.hidden = false;
    recoveredArchiveNoticeTimer = window.setTimeout(hideRecoveredArchiveNotice, 5200);
  }

  function hideRecoveredArchiveNotice() {
    window.clearTimeout(recoveredArchiveNoticeTimer);
    if (els.recoveredArchiveNotice) els.recoveredArchiveNotice.hidden = true;
  }

  function handleRecoveredArchiveEnded() {
    const index = Number(state.recoveredArchives.activeIndex);
    if (!index) return;

    recordRecoveredArchiveWatchTime({ allowPaused: true });
    if (getRecoveredArchiveWatchedRatio(index) < RECOVERED_ARCHIVE_UNLOCK_RATIO) {
      showRecoveredArchiveNotice();
      resetRecoveredArchiveWatchAnchor();
      return;
    }

    completeRecoveredArchive(index);
    const isFinalArchive = index >= RECOVERED_ARCHIVE_FILES.length;
    window.setTimeout(() => {
      if (isFinalArchive) {
        closeRecoveredArchive({ returnTarget: "offer" });
      } else {
        openRecoveredArchive(index + 1);
      }
    }, 650);
  }

  function completeRecoveredArchive(index) {
    if (!state.recoveredArchives.completed.includes(index)) {
      state.recoveredArchives.completed.push(index);
    }
    state.recoveredArchives.progress[index] = 0;
    state.recoveredArchives.unlocked = Math.min(
      RECOVERED_ARCHIVE_FILES.length,
      Math.max(state.recoveredArchives.unlocked, index + 1)
    );
    updateRecoveredArchiveUi();
  }

  function closeRecoveredArchive(options = {}) {
    if (!els.recoveredArchiveScreen || els.recoveredArchiveScreen.hidden) return;

    rememberRecoveredArchiveProgress();
    hideRecoveredArchiveNotice();
    els.recoveredArchiveVideo?.pause();
    els.recoveredArchiveScreen.hidden = true;
    els.recoveredArchiveScreen.setAttribute("aria-hidden", "true");
    els.body.classList.remove("is-recovered-archive-open");

    const target = options.returnTarget === "offer" ? els.recoveredArchiveOfferPoint : els.recoveredArchives;
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }

  function setFunnelVideoUnavailable(video, unavailable = true) {
    if (!video) return;
    const key = video.dataset.funnelVideo;
    const config = FUNNEL_MEDIA[key];
    const stage = video.closest(".funnel-vsl-stage");
    const card = video.closest(".funnel-vsl-card");
    video.dataset.available = unavailable ? "false" : "true";
    stage?.classList.toggle("is-video-unavailable", unavailable);
    card?.classList.toggle("is-video-unavailable", unavailable);
    if (card && unavailable) card.classList.remove("is-playing");

    const playButton = document.querySelector(`[data-funnel-play="${key}"]`);
    if (playButton) {
      playButton.disabled = unavailable;
      playButton.setAttribute("aria-disabled", unavailable ? "true" : "false");
      playButton.setAttribute(
        "aria-label",
        unavailable ? "Transmissão ainda não provisionada" : `Reproduzir ${config?.title || "VSL"}`
      );
    }

    document.querySelectorAll(`[data-funnel-command][data-funnel-target="${key}"]`).forEach((button) => {
      button.disabled = unavailable;
      button.setAttribute("aria-disabled", unavailable ? "true" : "false");
    });

    const volumeInput = document.querySelector(`[data-funnel-volume="${key}"]`);
    if (volumeInput) volumeInput.disabled = unavailable;
  }

  function markFunnelVideoUnavailable(video) {
    if (!video) return;
    video.pause?.();
    setFunnelVideoUnavailable(video, true);
    updateFunnelControls(video.dataset.funnelVideo);
  }

  function markPassiveVideoUnavailable(video) {
    if (!video) return;
    video.pause?.();
    video.classList.add("is-video-unavailable");
  }

  function syncFunnelMedia() {
    const compact = window.matchMedia("(max-width: 800px)").matches;
    const posterAssetKey = compact ? "posterMobile" : "posterDesktop";
    const media = {
      main: compact ? FUNNEL_MEDIA.main.posterMobile : FUNNEL_MEDIA.main.posterDesktop,
      offer: compact ? FUNNEL_MEDIA.offer.posterMobile : FUNNEL_MEDIA.offer.posterDesktop,
    };

    els.funnelVideos.forEach((video) => {
      const key = video.dataset.funnelVideo;
      const config = FUNNEL_MEDIA[key];
      if (!config) return;
      const videoAsset = getProvisionedVideoAsset(key, "video");
      const posterAsset = getProvisionedVideoAsset(key, posterAssetKey);
      const posterSource = posterAsset?.available === true ? posterAsset.source : media[key];
      const videoUnavailable = videoAsset?.available === false || (videoAsset?.available == null && Boolean(video.error));
      const posterUrl = toUrl(posterSource);
      video.poster = posterUrl;
      video.closest(".funnel-vsl-stage")?.style.setProperty("--funnel-poster", `url("${posterUrl}")`);
      setFunnelVideoUnavailable(video, videoUnavailable);
      if (videoUnavailable) {
        video.removeAttribute("src");
        video.load?.();
      } else if (!video.src) {
        video.src = toUrl(config.video);
      }
      video.setAttribute("aria-label", `${config.title} - VSL PSEU`);
      video.dataset.mode = compact ? "mobile" : "desktop";
      video.controls = false;
      video.volume = Number(document.querySelector(`[data-funnel-volume="${key}"]`)?.value || 0.85);
      updateFunnelControls(key);
    });
    updateContinuityUi();
  }

  function toggleFunnelVideo(key) {
    const config = FUNNEL_MEDIA[key];
    const video = document.querySelector(`[data-funnel-video="${key}"]`);
    if (!config || !video) return;
    if (video.dataset.available === "false" || video.closest(".funnel-vsl-card")?.classList.contains("is-video-unavailable")) {
      markFunnelVideoUnavailable(video);
      return;
    }

    els.funnelVideos.forEach((other) => {
      if (other !== video) {
        other.pause();
      }
    });

    if (video.paused) {
      restoreFunnelVideoPoint(video);
      video.muted = false;
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {
          video.muted = true;
          const mutedPlayPromise = video.play();
          if (mutedPlayPromise?.catch) mutedPlayPromise.catch(() => {});
        });
      }
    } else {
      video.pause();
    }
    updateFunnelControls(key);
  }

  function handleFunnelCommand(command, key) {
    const video = document.querySelector(`[data-funnel-video="${key}"]`);
    if (!video) return;
    if (video.dataset.available === "false" || video.closest(".funnel-vsl-card")?.classList.contains("is-video-unavailable")) {
      markFunnelVideoUnavailable(video);
      return;
    }

    if (command === "toggle") {
      toggleFunnelVideo(key);
      return;
    }

    if (command === "fullscreen") {
      showFunnelControls(key);
      const target = video.closest(".funnel-vsl-stage") || video;
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        target.requestFullscreen?.();
      }
    }
  }

  function setFunnelVolume(key, value) {
    const video = document.querySelector(`[data-funnel-video="${key}"]`);
    if (!video) return;
    video.volume = clamp(value, 0, 1);
    video.muted = video.volume === 0;
  }

  function updateFunnelControls(key) {
    const video = document.querySelector(`[data-funnel-video="${key}"]`);
    if (!video) return;
    const toggleButton = document.querySelector(`[data-funnel-command="toggle"][data-funnel-target="${key}"]`);
    if (toggleButton) {
      const unavailable = video.dataset.available === "false" || video.closest(".funnel-vsl-card")?.classList.contains("is-video-unavailable");
      toggleButton.textContent = unavailable ? "Indisponível" : video.paused ? "Reproduzir" : "Pausar";
      toggleButton.disabled = unavailable;
      toggleButton.setAttribute("aria-disabled", unavailable ? "true" : "false");
    }
  }

  function updateChapterSelection() {
    document.querySelectorAll(".chapter-item").forEach((chapter) => {
      chapter.classList.toggle("is-active", Number(chapter.dataset.chapterIndex) === state.activeChapterIndex);
    });
  }

  function updatePageSelection() {
    document.querySelectorAll(".page-strip__item").forEach((page) => {
      page.classList.toggle("is-active", Number(page.dataset.stopPage) === state.activePage);
    });
  }

  function updateActPills(act) {
    els.actPills.forEach((pill) => pill.classList.toggle("is-active", pill.textContent === act));
  }

  function updateProgressBadge(book) {
    const overall = getLibraryProgress();
    els.totalProgress.textContent = `${overall}%`;
    els.currentPhase.textContent = getLibraryMicrocopy(book, overall);
    els.libraryNotes.forEach((note) => {
      note.textContent = getLibraryMicrocopy(book, overall);
    });
  }

  function readTraversalNotebook() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TRAVERSAL_NOTEBOOK_STORAGE_KEY) || "{}");
      return {
        version: 1,
        entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {},
        activeBookId: typeof parsed.activeBookId === "string" ? parsed.activeBookId : "",
      };
    } catch {
      return {
        version: 1,
        entries: {},
        activeBookId: "",
      };
    }
  }

  function saveTraversalNotebook() {
    try {
      localStorage.setItem(TRAVERSAL_NOTEBOOK_STORAGE_KEY, JSON.stringify(state.traversalNotebook));
    } catch (error) {
      console.warn("[PSEU] Nao foi possivel preservar o Caderno de Travessia.", error);
    }
  }

  function isTraversalNotebookOpen() {
    return Boolean(els.notebookDrawer && !els.notebookDrawer.hidden);
  }

  function getTraversalNotebookBook() {
    const activeBookId = state.traversalNotebook.activeBookId || getCurrentBook()?.id || "";
    return books.find((book) => book.id === activeBookId) || getCurrentBook() || books[0] || null;
  }

  function getTraversalNotebookEntry(book) {
    if (!book?.id) return null;
    state.traversalNotebook.entries = state.traversalNotebook.entries || {};
    state.traversalNotebook.entries[book.id] = state.traversalNotebook.entries[book.id] || {
      text: "",
      page: null,
      updatedAt: null,
    };
    return state.traversalNotebook.entries[book.id];
  }

  function formatTraversalNotebookDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function updateTraversalNotebookStatus(entry) {
    if (!els.notebookStatus) return;
    const text = String(entry?.text || "").trim();
    if (!text) {
      els.notebookStatus.textContent = "O Caderno permanece em silêncio.";
      return;
    }

    const words = text.split(/\s+/).filter(Boolean).length;
    const updatedAt = formatTraversalNotebookDate(entry.updatedAt);
    els.notebookStatus.textContent = updatedAt
      ? `${words} sinais preservados · ${updatedAt}`
      : `${words} sinais preservados`;
  }

  function renderTraversalNotebook() {
    if (!els.notebookDrawer) return;
    const book = getTraversalNotebookBook();
    if (!book) return;

    state.traversalNotebook.activeBookId = book.id;
    const entry = getTraversalNotebookEntry(book);
    const savedPage = Number(entry?.page || 0);
    const currentPage = clamp(state.activePage || getBookSavedPage(book) || 1, 1, book.pageCount || 999);

    if (els.notebookBookTitle) els.notebookBookTitle.textContent = book.title;
    if (els.notebookMeta) {
      els.notebookMeta.textContent = savedPage
        ? `Sinal marcado na página ${savedPage}. Página ativa: ${currentPage}.`
        : `Página ativa: ${currentPage}. Nenhum ponto fixado neste arquivo.`;
    }
    if (els.notebookText && els.notebookText.value !== (entry?.text || "")) {
      els.notebookText.value = entry?.text || "";
    }
    updateTraversalNotebookStatus(entry);
  }

  function openTraversalNotebook() {
    if (!els.notebookDrawer) return;
    const book = getCurrentBook();
    if (book?.id && !isFragmentReaderScope(book)) {
      state.traversalNotebook.activeBookId = book.id;
    }

    closeMobileDrawer();
    renderTraversalNotebook();
    els.notebookDrawer.hidden = false;
    els.notebookDrawer.setAttribute("aria-hidden", "false");
    els.body.classList.add("is-notebook-open");
    window.requestAnimationFrame(() => {
      els.notebookDrawer?.classList.add("is-open");
      els.notebookText?.focus?.({ preventScroll: true });
    });
  }

  function closeTraversalNotebook() {
    if (!els.notebookDrawer) return;
    els.notebookDrawer.classList.remove("is-open");
    els.notebookDrawer.setAttribute("aria-hidden", "true");
    els.body.classList.remove("is-notebook-open");
    window.setTimeout(() => {
      if (!els.notebookDrawer?.classList.contains("is-open")) {
        els.notebookDrawer.hidden = true;
      }
    }, 280);
  }

  function trapTraversalNotebookFocus(event) {
    const focusable = Array.from(els.notebookDrawer?.querySelectorAll("button, textarea, [href], input, select, [tabindex]:not([tabindex='-1'])") || [])
      .filter((node) => !node.disabled && !node.hidden && node.tabIndex >= 0);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleTraversalNotebookInput() {
    const book = getTraversalNotebookBook();
    const entry = getTraversalNotebookEntry(book);
    if (!entry || !els.notebookText) return;

    entry.text = els.notebookText.value;
    if (!entry.page) {
      entry.page = clamp(state.activePage || getBookSavedPage(book) || 1, 1, book.pageCount || 999);
    }
    entry.updatedAt = new Date().toISOString();
    saveTraversalNotebook();
    updateTraversalNotebookStatus(entry);
    renderOperations();
  }

  function markTraversalNotebookPage() {
    const book = getTraversalNotebookBook();
    const entry = getTraversalNotebookEntry(book);
    if (!entry) return;

    entry.page = clamp(state.activePage || getBookSavedPage(book) || 1, 1, book.pageCount || 999);
    entry.updatedAt = new Date().toISOString();
    saveTraversalNotebook();
    renderTraversalNotebook();
    renderOperations();
  }

  function openReader() {
    if (!els.readerLayout) return;
    const book = getCurrentBook();
    const fragmentScope = isFragmentReaderScope(book);
    if (!fragmentScope && !isBookReadable(book)) {
      syncActiveBookWithEntitlements();
      return;
    }

    const wasOpen = els.readerLayout.classList.contains("is-open");
    if (!wasOpen) {
      state.readerReturnScrollY = window.scrollY || window.pageYOffset || 0;
    }
    closeMobileDrawer();
    setExternalFragmentReaderShell(fragmentScope);
    els.readerLayout.classList.add("is-open");
    els.readerLayout.setAttribute("aria-hidden", "false");
    els.body.classList.add("is-reader-open");
    els.readerLayout.dataset.readerScope = fragmentScope ? "fragment" : "portal";
    const touchMode = window.matchMedia("(hover: none)").matches;
    clearTimeout(state.controlsTimer);
    if (fragmentScope) {
      showReaderControls(!touchMode);
    } else if (touchMode) {
      showReaderControls(false);
    } else {
      hideReaderControls();
    }
    if (touchMode) {
      els.readerClose?.focus?.();
    }
    if (book) {
      if (!wasOpen) {
        trackAnalytics("book_opened", {
          section: "reader",
          page: `reader-page-${state.activePage}`,
          bookId: book.id,
          progress: getBookProgress(book, state.activePage),
        });
      }
      const rerender = () => updateReader(book);
      window.requestAnimationFrame(() => window.requestAnimationFrame(rerender));
    }
  }

  function openContinueReading() {
    if (!isProtectedPortalRoute()) {
      navigateToSection("funil-biblioteca");
      return;
    }
    state.readerScope = null;
    trackAnalytics("reader_continue_clicked", {
      section: "portal",
      page: "portal-interno",
      bookId: getCurrentBook()?.id,
    });
    const hasHistory = Boolean(
      (state.lastOpenedBooks || []).length
      || Object.values(state.bookStates || {}).some((item) => Number(item?.page || 0) > 1)
    );
    if (!hasHistory) {
      const firstReadableIndex = books.findIndex(isBookReadable);
      selectBook(firstReadableIndex >= 0 ? firstReadableIndex : 0, { open: true });
      return;
    }

    const resumeBook = books.find((book) => book.id === state.lastBookId && isBookReadable(book))
      || (isBookReadable(books[state.activeIndex]) ? books[state.activeIndex] : null)
      || books.find(isBookReadable)
      || books[0];
    if (!resumeBook) return;

    const resumeIndex = Math.max(0, books.findIndex((book) => book.id === resumeBook.id));
    const savedBookState = state.bookStates?.[resumeBook.id];
    const targetPage = clamp(savedBookState?.page || state.resumePage || state.activePage || 1, 1, resumeBook.pageCount || 999);

    selectBook(resumeIndex >= 0 ? resumeIndex : 0, { open: false, preservePage: false, trackHistory: false });
    state.activePage = targetPage;
    state.resumePage = targetPage;
    state.activeChapterIndex = chapterIndexForPage(resumeBook, targetPage);
    state.readerMode = targetPage === 1 ? "cover" : isCompactReader() ? "single" : "spread";
    state.bookStates[resumeBook.id] = {
      ...(state.bookStates[resumeBook.id] || {}),
      page: targetPage,
      chapterIndex: state.activeChapterIndex,
      progress: getBookProgress(resumeBook, targetPage),
    };
    touchLastOpenedBook(resumeBook, targetPage);
    updateChapterSelection();
    updatePageSelection();
    saveState();
    openReader();
  }

  function closeReader() {
    if (!els.readerLayout) return;
    const wasOpen = els.readerLayout.classList.contains("is-open");
    const book = getCurrentBook();
    const fragmentScope = isFragmentReaderScope(book);
    els.readerLayout.classList.remove("is-open");
    els.readerLayout.setAttribute("aria-hidden", "true");
    delete els.readerLayout.dataset.readerScope;
    els.body.classList.remove("is-reader-open");
    setExternalFragmentReaderShell(false);
    if (fragmentScope) {
      state.readerScope = null;
    }
    hideReaderControls();
    clearTimeout(state.controlsTimer);
    if (wasOpen) {
      trackAnalytics("reader_returned_to_portal", {
        section: "reader",
        page: `reader-page-${state.activePage}`,
        bookId: book?.id,
        progress: book ? getBookProgress(book, state.activePage) : 0,
      });
    }
    updateContinuityUi();
    if (isProtectedPortalRoute()) {
      state.readerScope = null;
      openProtectedPortalEntry();
      return;
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: state.readerReturnScrollY || 0, behavior: "auto" });
    });
  }

  function setExternalFragmentReaderShell(isOpen) {
    if (isProtectedPortalRoute() || !els.appShell) return;
    els.body.classList.toggle("is-external-fragment-reader", Boolean(isOpen));
    if (isOpen) {
      els.appShell.hidden = false;
      els.appShell.removeAttribute("inert");
      els.appShell.setAttribute("aria-hidden", "false");
      els.appShell.style.display = "grid";
      return;
    }
    els.appShell.style.removeProperty("display");
    els.appShell.removeAttribute("aria-hidden");
  }

  function unlockPortal(options = {}) {
    rememberFunnelStage(9);
    state.portalUnlocked = true;
    els.body.classList.add("is-portal-unlocked");
    saveState();
    localStorage.setItem("pseu.portal.unlocked", "1");
    updateContinuityUi();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        rememberFunnelStage(10);
        if (options.scroll !== false) {
          els.appShell?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  function handleBookSwipeStart(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    state.swipeActive = true;
    state.swipeStartX = event.clientX;
    state.swipeStartY = event.clientY;
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function handleBookSwipeEnd(event) {
    if (!state.swipeActive) return;

    const dx = event.clientX - state.swipeStartX;
    const dy = event.clientY - state.swipeStartY;
    state.swipeActive = false;
    event.currentTarget?.releasePointerCapture?.(event.pointerId);

    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    navigateReaderPage(dx < 0 ? 1 : -1);
  }

  function resetBookSwipe() {
    state.swipeActive = false;
  }

  function chapterForPage(book, page) {
    if (!book?.chapters?.length) return null;
    let current = book.chapters[0];
    for (const chapter of book.chapters) {
      if (page >= chapter.page) current = chapter;
    }
    return current;
  }

  function chapterIndexForPage(book, page) {
    if (!book?.chapters?.length) return 0;
    let index = 0;
    for (let i = 0; i < book.chapters.length; i += 1) {
      if (page >= book.chapters[i].page) index = i;
    }
    return index;
  }

  function pageMoodFor(book, page) {
    if (book.id === "despertar") {
      if (page <= 12) return { key: "limiar", title: "Limiar", copy: "O ambiente se mantém denso e contido." };
      if (page <= 18) return { key: "confronto", title: "Confronto", copy: "A luz pesa mais. A tensão cresce." };
      if (page <= 30) return { key: "colapso", title: "Colapso", copy: "A leitura fica mais silenciosa e profunda." };
      if (page <= 50) return { key: "reconstrucao", title: "Reconstrução", copy: "A composição suaviza e se reorganiza." };
      return { key: "fecho", title: "Fecho", copy: "O clima abre espaço para a decisão final." };
    }
    if (book.id === "historico") {
      if (page <= 10) return { key: "arquivo", title: "Arquivo", copy: "Tudo respira como memória viva." };
      if (page <= 22) return { key: "sombra", title: "Sombra", copy: "A pressão psicológica aumenta." };
      if (page <= 34) return { key: "cidade", title: "Cidade", copy: "O sistema ganha presença visual." };
      if (page <= 48) return { key: "camada", title: "Camada", copy: "A leitura se aprofunda em silêncio." };
      return { key: "abertura", title: "Abertura", copy: "O olhar encontra espaço para avançar." };
    }
    if (book.stage === "fracture") return { key: "fractura", title: "Ferida", copy: "O ambiente fica mais intenso e nervoso." };
    if (book.stage === "structure") return { key: "estrutura", title: "Estrutura", copy: "A composição se organiza com precisão." };
    return { key: "revelacao", title: "Revelação", copy: "A atmosfera se torna mais clara e simbólica." };
  }

  function readerAtmosphereFor(book, pageMood, pageNumber = 1) {
    const palette = {
      limiar: ["rgba(143, 92, 255, 0.34)", "rgba(211, 167, 90, 0.18)", "rgba(10, 10, 16, 0.88)"],
      confronto: ["rgba(217, 110, 168, 0.28)", "rgba(255, 186, 102, 0.18)", "rgba(8, 8, 12, 0.92)"],
      colapso: ["rgba(65, 215, 199, 0.26)", "rgba(14, 16, 22, 0.9)", "rgba(3, 3, 6, 0.96)"],
      reconstrucao: ["rgba(122, 216, 255, 0.22)", "rgba(141, 92, 255, 0.24)", "rgba(8, 10, 15, 0.9)"],
      fecho: ["rgba(211, 167, 90, 0.3)", "rgba(122, 216, 255, 0.16)", "rgba(9, 8, 10, 0.9)"],
      arquivo: ["rgba(65, 215, 199, 0.22)", "rgba(255, 255, 255, 0.08)", "rgba(5, 8, 10, 0.92)"],
      sombra: ["rgba(12, 12, 18, 0.88)", "rgba(217, 110, 168, 0.2)", "rgba(3, 3, 5, 0.96)"],
      cidade: ["rgba(67, 215, 199, 0.22)", "rgba(141, 92, 255, 0.18)", "rgba(7, 8, 12, 0.92)"],
      camada: ["rgba(122, 216, 255, 0.2)", "rgba(65, 215, 199, 0.14)", "rgba(7, 7, 10, 0.94)"],
      abertura: ["rgba(211, 167, 90, 0.26)", "rgba(141, 92, 255, 0.18)", "rgba(10, 8, 12, 0.92)"],
      fractura: ["rgba(217, 110, 168, 0.28)", "rgba(211, 167, 90, 0.16)", "rgba(5, 5, 8, 0.94)"],
      estrutura: ["rgba(65, 215, 199, 0.26)", "rgba(141, 92, 255, 0.16)", "rgba(6, 8, 12, 0.92)"],
      revelacao: ["rgba(211, 167, 90, 0.28)", "rgba(122, 216, 255, 0.18)", "rgba(8, 8, 12, 0.92)"],
    };

    const [a, b, c] = palette[pageMood.key] || palette.revelacao;
    const ambientSource = book.readerRenderMode === "pdf"
      ? ""
      : pageSourceFor(book, pageNumber) || book.visuals?.[Math.abs((pageNumber || 1) - 1) % (book.visuals?.length || 1)]?.src || book.cover || coverAssets[book.number] || "";
    return {
      a,
      b,
      c,
      image: ambientSource ? `url("${toUrl(ambientSource)}")` : "none",
    };
  }

  function getCurrentBook() {
    return books[state.activeIndex];
  }

  function revealBlocks() {
    const targets = document.querySelectorAll(".hero-stage, .section-block");
    targets.forEach((node) => node.setAttribute("data-reveal", ""));
    if (!("IntersectionObserver" in window)) {
      targets.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.04, rootMargin: "0px 0px -8% 0px" });
    targets.forEach((node) => observer.observe(node));
  }

  function startPortalEntrance() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    els.body.classList.add("is-portal-entering");

    const finishEntrance = () => {
      els.body.classList.add("is-portal-ready");
      if (reducedMotion) {
        els.body.classList.remove("is-portal-entering");
        return;
      }
      window.setTimeout(() => {
        els.body.classList.remove("is-portal-entering");
      }, 820);
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(finishEntrance);
    });
  }

  function handleTilt(event) {
    const bounds = els.focusFrame.getBoundingClientRect();
    const offsetX = (event.clientX - bounds.left) / bounds.width - 0.5;
    const offsetY = (event.clientY - bounds.top) / bounds.height - 0.5;
    els.focusFrame.style.transform = `perspective(1200px) rotateX(${offsetY * -4}deg) rotateY(${offsetX * 6}deg) translateY(-1px)`;
  }

  function resetTilt() {
    els.focusFrame.style.transform = "";
  }

  function saveState() {
    try {
      const currentBook = books[state.activeIndex];
      const payload = {
        activeIndex: state.activeIndex,
        activeChapterIndex: state.activeChapterIndex,
        activePage: state.activePage,
        resumePage: state.resumePage,
        lastBookId: state.lastBookId,
        bookStates: state.bookStates,
        favoriteBooks: state.favoriteBooks,
        bookmarks: state.bookmarks,
        lastOpenedBooks: state.lastOpenedBooks,
        lastOpenedAt: state.lastOpenedAt || null,
        portalUnlocked: state.portalUnlocked,
      };
      localStorage.setItem("pseu.reader.state", JSON.stringify(payload));
      window.PSEU_BOOK_DIAGNOSTICS?.markSave?.(currentBook, {
        activePage: state.activePage,
        progress: currentBook ? getBookProgress(currentBook, state.activePage) : 0,
      });
    } catch {}
  }

  function readSavedState() {
    try {
      const raw = localStorage.getItem("pseu.reader.state");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        favoriteBooks: Array.isArray(parsed.favoriteBooks) ? parsed.favoriteBooks : [],
        bookmarks: parsed.bookmarks && typeof parsed.bookmarks === "object" ? parsed.bookmarks : {},
        lastOpenedBooks: Array.isArray(parsed.lastOpenedBooks) ? parsed.lastOpenedBooks : [],
        lastOpenedAt: parsed.lastOpenedAt || null,
        portalUnlocked: Boolean(parsed.portalUnlocked),
      };
    } catch {
      return null;
    }
  }

  function toUrl(path) {
    try {
      return new URL(path, document.baseURI).href;
    } catch {
      return encodeURI(path);
    }
  }

  function pdfFragment(page) {
    return `#page=${page}&zoom=page-width&toolbar=0&navpanes=0&scrollbar=0`;
  }

  function wrap(index, total) {
    if (total <= 0) return 0;
    return ((index % total) + total) % total;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
});
