(function () {
  const VERSION = 1;
  const MAX_EVENTS = 2500;
  const MAX_SESSIONS = 400;
  const HEARTBEAT_MS = 15000;
  const STORAGE = {
    events: "pseu.analytics.events.v1",
    sessions: "pseu.analytics.sessions.v1",
    sessionId: "pseu.analytics.sessionId.v1",
    sessionOnce: "pseu.analytics.once.v1",
  };
  const FUNNEL_STAGES = [
    { id: 1, key: "call", label: "Chamado" },
    { id: 2, key: "library", label: "Biblioteca" },
    { id: 3, key: "travessia", label: "Travessia" },
    { id: 4, key: "main-started", label: "Transmissão principal iniciada" },
    { id: 5, key: "main-half", label: "Transmissão principal 50%" },
    { id: 6, key: "main-completed", label: "Transmissão principal concluída" },
    { id: 7, key: "offer-started", label: "Transmissão de decisão iniciada" },
    { id: 8, key: "offer-completed", label: "Transmissão de decisão concluída" },
    { id: 9, key: "final-cta", label: "Decisão final" },
    { id: 10, key: "portal", label: "Portal interno" },
  ];
  const MILESTONES = [25, 50, 75, 100];
  const PRIVATE_DETAIL_KEYS = new Set(["name", "nome", "email", "e-mail", "ip"]);
  const memory = {
    initialized: false,
    portalBound: false,
    session: null,
    once: new Set(),
    videoStates: new Map(),
    lockedAttempts: new Map(),
    heartbeat: 0,
  };

  function readJson(storage, key, fallback) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function getDevice() {
    return window.matchMedia("(max-width: 800px)").matches ? "mobile" : "desktop";
  }

  function makeId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function stageFor(id) {
    return FUNNEL_STAGES.find((stage) => stage.id === Number(id)) || FUNNEL_STAGES[0];
  }

  function isPortalPage() {
    return Boolean(document.getElementById("funil-chamado"));
  }

  function sanitizeDetails(details) {
    if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
    const clean = {};
    Object.entries(details).slice(0, 12).forEach(([key, value]) => {
      if (PRIVATE_DETAIL_KEYS.has(String(key).toLowerCase())) return;
      if (typeof value === "string") clean[key] = value.slice(0, 160);
      if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
      if (typeof value === "boolean") clean[key] = value;
    });
    return Object.keys(clean).length ? clean : undefined;
  }

  function getStoredSessions() {
    const sessions = readJson(localStorage, STORAGE.sessions, []);
    return Array.isArray(sessions) ? sessions : [];
  }

  function getStoredEvents() {
    const events = readJson(localStorage, STORAGE.events, []);
    return Array.isArray(events) ? events : [];
  }

  function persistOnce() {
    writeJson(sessionStorage, STORAGE.sessionOnce, [...memory.once]);
  }

  function createSession() {
    let sessionId = "";
    try {
      sessionId = sessionStorage.getItem(STORAGE.sessionId) || "";
    } catch {}
    if (!sessionId) {
      sessionId = makeId("session");
      try {
        sessionStorage.setItem(STORAGE.sessionId, sessionId);
      } catch {}
    }

    const sessions = getStoredSessions();
    const now = new Date().toISOString();
    const existing = sessions.find((session) => session.sessionId === sessionId);
    memory.session = existing || {
      sessionId,
      startedAt: now,
      lastActivityAt: now,
      durationMs: 0,
      device: getDevice(),
      maxFunnelStage: 0,
      maxFunnelStageLabel: "Ainda não iniciado",
      funnelProgressPercent: 0,
    };
    const once = readJson(sessionStorage, STORAGE.sessionOnce, []);
    memory.once = new Set(Array.isArray(once) ? once : []);
    touchSession();
    return memory.session;
  }

  function touchSession(stageId) {
    if (!memory.session) return null;
    const now = Date.now();
    const started = Date.parse(memory.session.startedAt) || now;
    const nextStage = Number(stageId || 0);
    if (nextStage > Number(memory.session.maxFunnelStage || 0)) {
      const stage = stageFor(nextStage);
      memory.session.maxFunnelStage = stage.id;
      memory.session.maxFunnelStageLabel = stage.label;
      memory.session.funnelProgressPercent = Math.round((stage.id / FUNNEL_STAGES.length) * 100);
    }
    memory.session.lastActivityAt = new Date(now).toISOString();
    memory.session.durationMs = Math.max(0, now - started);
    memory.session.device = getDevice();

    const sessions = getStoredSessions();
    const nextSessions = [
      memory.session,
      ...sessions.filter((session) => session.sessionId !== memory.session.sessionId),
    ].slice(0, MAX_SESSIONS);
    writeJson(localStorage, STORAGE.sessions, nextSessions);
    return memory.session;
  }

  function ensureSession() {
    if (!isPortalPage()) return null;
    return memory.session || createSession();
  }

  function track(eventName, options = {}) {
    const session = ensureSession();
    if (!session || !eventName) return null;
    const funnelStage = Number(options.funnelStage || 0);
    const section = String(options.section || "portal");
    const page = String(options.page || section);
    const progress = Number(options.progress);
    const event = {
      id: makeId("event"),
      eventName: String(eventName),
      timestamp: new Date().toISOString(),
      page,
      section,
      device: getDevice(),
      sessionId: session.sessionId,
    };
    if (options.bookId) event.bookId = String(options.bookId);
    if (options.videoId) event.videoId = String(options.videoId);
    if (Number.isFinite(progress)) event.progress = Math.max(0, Math.min(100, Math.round(progress)));
    const details = sanitizeDetails(options.details);
    if (details) event.details = details;

    const events = getStoredEvents();
    writeJson(localStorage, STORAGE.events, [event, ...events].slice(0, MAX_EVENTS));
    touchSession(funnelStage);
    return event;
  }

  function trackOnce(eventName, options = {}, token = eventName) {
    ensureSession();
    const onceToken = String(token || eventName);
    if (memory.once.has(onceToken)) return null;
    memory.once.add(onceToken);
    persistOnce();
    return track(eventName, options);
  }

  function advanceFunnel(stageId) {
    ensureSession();
    return touchSession(stageId);
  }

  function getVideoState(video) {
    const videoId = video?.dataset?.funnelVideo || "unknown";
    if (!memory.videoStates.has(videoId)) {
      memory.videoStates.set(videoId, {
        video,
        videoId,
        started: false,
        completed: false,
        abandoned: false,
        maxProgress: 0,
      });
    }
    return memory.videoStates.get(videoId);
  }

  function getVideoProgress(video) {
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return 0;
    return Math.max(0, Math.min(100, (video.currentTime / video.duration) * 100));
  }

  function videoEventName(videoId, suffix) {
    return `vsl_${videoId}_${suffix}`;
  }

  function videoPage(videoId) {
    return videoId === "offer" ? "page-3-offer" : "page-3-main";
  }

  function funnelStageForVideo(videoId, milestone) {
    if (videoId === "main" && milestone === "started") return 4;
    if (videoId === "main" && milestone === 50) return 5;
    if (videoId === "main" && milestone === 100) return 6;
    if (videoId === "offer" && milestone === "started") return 7;
    if (videoId === "offer" && milestone === 100) return 8;
    return 0;
  }

  function recordVideoProgress(video) {
    const state = getVideoState(video);
    const progress = getVideoProgress(video);
    state.maxProgress = Math.max(state.maxProgress, progress);
    MILESTONES.forEach((milestone) => {
      if (progress < milestone) return;
      trackOnce(
        videoEventName(state.videoId, milestone === 100 ? "completed" : `progress_${milestone}`),
        {
          section: "travessia",
          page: videoPage(state.videoId),
          videoId: state.videoId,
          progress: milestone,
          funnelStage: funnelStageForVideo(state.videoId, milestone),
        },
        `video:${state.videoId}:milestone:${milestone}`,
      );
      if (milestone === 100) state.completed = true;
    });
  }

  function markVideoAbandonments(reason = "exit", exceptVideoId = "") {
    memory.videoStates.forEach((state) => {
      if (!state.started || state.completed || state.abandoned || state.videoId === exceptVideoId) return;
      const progress = Math.max(state.maxProgress, getVideoProgress(state.video));
      if (progress <= 0 || progress >= 100) return;
      state.abandoned = true;
      track(videoEventName(state.videoId, "abandoned"), {
        section: "travessia",
        page: videoPage(state.videoId),
        videoId: state.videoId,
        progress,
        details: { reason },
      });
    });
  }

  function bindVideo(video) {
    if (!video || video.dataset.analyticsBound === "true") return;
    video.dataset.analyticsBound = "true";
    const state = getVideoState(video);

    video.addEventListener("play", () => {
      markVideoAbandonments("switched-video", state.videoId);
      state.started = true;
      state.abandoned = false;
      trackOnce(
        videoEventName(state.videoId, "started"),
        {
          section: "travessia",
          page: videoPage(state.videoId),
          videoId: state.videoId,
          progress: getVideoProgress(video),
          funnelStage: funnelStageForVideo(state.videoId, "started"),
        },
        `video:${state.videoId}:started`,
      );
    });

    video.addEventListener("timeupdate", () => recordVideoProgress(video));

    video.addEventListener("pause", () => {
      recordVideoProgress(video);
      if (!state.started || state.completed || video.ended || getVideoProgress(video) <= 0) return;
      track(videoEventName(state.videoId, "paused"), {
        section: "travessia",
        page: videoPage(state.videoId),
        videoId: state.videoId,
        progress: getVideoProgress(video),
      });
    });

    video.addEventListener("ended", () => {
      state.maxProgress = 100;
      state.completed = true;
      trackOnce(
        videoEventName(state.videoId, "completed"),
        {
          section: "travessia",
          page: videoPage(state.videoId),
          videoId: state.videoId,
          progress: 100,
          funnelStage: funnelStageForVideo(state.videoId, 100),
        },
        `video:${state.videoId}:milestone:100`,
      );
    });
  }

  function getBookFromTile(tile) {
    const index = Number(tile?.dataset?.bookIndex);
    if (!Number.isFinite(index)) return null;
    return window.PSEU_BOOK_REGISTRY?.books?.[index] || null;
  }

  function getTileContext(tile) {
    return tile?.closest?.(".preportal") ? "preportal-library" : "portal-library";
  }

  function handleLockedBookAttempt(event) {
    const tile = event.target?.closest?.("[data-book-index]");
    if (!tile || tile.getAttribute("aria-disabled") !== "true") return;
    const book = getBookFromTile(tile);
    if (!book) return;
    const key = `${book.id}:${getTileContext(tile)}`;
    const lastAttempt = memory.lockedAttempts.get(key) || 0;
    if (Date.now() - lastAttempt < 500) return;
    memory.lockedAttempts.set(key, Date.now());
    track("book_clicked", {
      section: getTileContext(tile),
      page: getTileContext(tile),
      bookId: book.id,
      details: { available: false },
    });
    track("locked_book_attempted", {
      section: getTileContext(tile),
      page: getTileContext(tile),
      bookId: book.id,
    });
  }

  function handleDocumentClick(event) {
    const tile = event.target?.closest?.("[data-book-index]");
    if (tile && tile.getAttribute("aria-disabled") !== "true") {
      const book = getBookFromTile(tile);
      const context = getTileContext(tile);
      if (book) {
        track("book_clicked", {
          section: context,
          page: context,
          bookId: book.id,
          details: { available: true },
        });
        if (context === "preportal-library" && !document.body.classList.contains("is-portal-unlocked")) {
          track("fragment_read_clicked", {
            section: context,
            page: "page-2",
            bookId: book.id,
          });
        }
      }
    }

    const nav = event.target?.closest?.("[data-nav]");
    if (nav?.dataset?.nav === "funil-biblioteca") {
      track("funnel_library_cta_clicked", {
        section: "chamado",
        page: "page-1",
      });
    }
    if (nav?.dataset?.nav === "funil-travessia") {
      track("funnel_travessia_cta_clicked", {
        section: nav.closest?.("#funil-biblioteca") ? "biblioteca" : "chamado",
        page: nav.closest?.("#funil-biblioteca") ? "page-2" : "page-1",
      });
    }

    const action = event.target?.closest?.("[data-action]");
    if (action?.dataset?.action === "unlock-portal" || action?.dataset?.action === "checkout-gumroad") {
      markVideoAbandonments("final-cta");
      track("final_cta_clicked", {
        section: "travessia",
        page: "page-3",
        funnelStage: 9,
        checkout: action.dataset.action === "checkout-gumroad",
      });
    }
  }

  function observeSection(elementId, eventName, page, section, funnelStage) {
    const target = document.getElementById(elementId);
    if (!target) return;
    if (!("IntersectionObserver" in window)) {
      trackOnce(eventName, { page, section, funnelStage });
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.32) return;
        trackOnce(eventName, { page, section, funnelStage });
      });
    }, { threshold: [0.32, 0.6] });
    observer.observe(target);
  }

  function bindPortalTracking() {
    if (memory.portalBound || !isPortalPage()) return;
    memory.portalBound = true;
    ensureSession();
    trackOnce("funnel_call_entered", {
      section: "chamado",
      page: "page-1",
      funnelStage: 1,
    });
    observeSection("funil-biblioteca", "funnel_library_entered", "page-2", "biblioteca", 2);
    observeSection("funil-travessia", "funnel_travessia_entered", "page-3", "travessia", 3);
    observeSection("portal-interno", "portal_internal_entered", "portal-interno", "portal", 10);
    document.querySelectorAll("[data-funnel-video]").forEach(bindVideo);
    document.addEventListener("pointerdown", handleLockedBookAttempt, true);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        markVideoAbandonments("visibility-hidden");
        touchSession();
      }
    });
    window.addEventListener("pagehide", () => {
      markVideoAbandonments("pagehide");
      touchSession();
    });
    memory.heartbeat = window.setInterval(() => touchSession(), HEARTBEAT_MS);
  }

  function summarize(events = getStoredEvents(), sessions = getStoredSessions()) {
    const eventCounts = {};
    const deviceCounts = {};
    const booksOpened = {};
    const videos = {
      main: { starts: 0, pauses: 0, abandons: 0, completed: 0, maxProgress: 0 },
      offer: { starts: 0, pauses: 0, abandons: 0, completed: 0, maxProgress: 0 },
    };
    events.forEach((event) => {
      eventCounts[event.eventName] = (eventCounts[event.eventName] || 0) + 1;
      if (event.eventName === "book_opened" && event.bookId) {
        booksOpened[event.bookId] = (booksOpened[event.bookId] || 0) + 1;
      }
      if (event.videoId && videos[event.videoId]) {
        videos[event.videoId].maxProgress = Math.max(videos[event.videoId].maxProgress, Number(event.progress || 0));
        if (event.eventName === `vsl_${event.videoId}_started`) videos[event.videoId].starts += 1;
        if (event.eventName === `vsl_${event.videoId}_paused`) videos[event.videoId].pauses += 1;
        if (event.eventName === `vsl_${event.videoId}_abandoned`) videos[event.videoId].abandons += 1;
        if (event.eventName === `vsl_${event.videoId}_completed`) videos[event.videoId].completed += 1;
      }
    });
    sessions.forEach((session) => {
      const device = session.device || "desktop";
      deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    });
    const durations = sessions.map((session) => Number(session.durationMs || 0)).filter((duration) => duration >= 0);
    const averageSessionDurationMs = durations.length
      ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
      : 0;
    const maxFunnelStage = sessions.reduce((max, session) => Math.max(max, Number(session.maxFunnelStage || 0)), 0);
    const latestSession = [...sessions].sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))[0] || null;

    return {
      generatedAt: new Date().toISOString(),
      totalSessions: sessions.length,
      totalEvents: events.length,
      latestSession,
      maxFunnelStage,
      maxFunnelStageLabel: maxFunnelStage ? stageFor(maxFunnelStage).label : "Ainda não iniciado",
      averageSessionDurationMs,
      deviceCounts,
      finalCtaClicks: eventCounts.final_cta_clicked || 0,
      lockedBookAttempts: eventCounts.locked_book_attempted || 0,
      booksOpened,
      videos,
      eventCounts,
    };
  }

  function flushSession() {
    return touchSession();
  }

  function getData() {
    flushSession();
    const sessions = getStoredSessions();
    const events = getStoredEvents();
    return {
      version: VERSION,
      privacy: {
        scope: "local-behavior-only",
        collectsPersonalData: false,
        fieldsExcluded: ["name", "email", "ip"],
      },
      generatedAt: new Date().toISOString(),
      sessions,
      events,
      summary: summarize(events, sessions),
    };
  }

  function downloadExport() {
    const payload = getData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `pseu-analytics-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function init() {
    if (memory.initialized) return;
    memory.initialized = true;
    if (isPortalPage()) bindPortalTracking();
  }

  window.PSEU_ANALYTICS = {
    VERSION,
    FUNNEL_STAGES,
    init,
    track,
    trackOnce,
    advanceFunnel,
    bindVideo,
    markVideoAbandonments,
    flushSession,
    getData,
    getSummary: summarize,
    downloadExport,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
