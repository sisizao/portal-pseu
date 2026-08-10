(function () {
  const VERSION = 1;
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  const CTA_DEBOUNCE_MS = 1000;
  const CHECKOUT_WINDOW_MS = 5 * 60 * 1000;
  const MAX_COMPLETED_TOKENS = 240;
  const STORAGE = {
    anonymousId: "pseu.telemetry.anonymousId.v1",
    session: "pseu.telemetry.behavioralSession.v1",
    completed: "pseu.telemetry.completed.v1",
    checkout: "pseu.telemetry.checkout.v1",
  };
  const SECTION_INDEXES = {
    "funil-chamado": 1,
    "funil-biblioteca": 2,
    "funil-travessia": 3,
  };
  const ALLOWED_ENTRY_SOURCES = new Set([
    "bio",
    "instagram",
    "facebook",
    "youtube",
    "tiktok",
    "google",
    "organic",
    "referral",
  ]);
  const memory = {
    initialized: false,
    localSession: null,
    sessionPromise: null,
    completed: null,
    inFlight: new Map(),
    ctaActivity: new Map(),
  };

  function isFunnelPage() {
    return Boolean(document.getElementById("funil-chamado"));
  }

  function isTelemetryEntryPage() {
    return isFunnelPage() || window.location?.pathname === "/acesso";
  }

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function readText(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch (_error) {
      return "";
    }
  }

  function writeText(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || "")
    );
  }

  function createUuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    if (!window.crypto?.getRandomValues) return null;
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  function getAnonymousId() {
    const stored = readText(STORAGE.anonymousId).trim().toLowerCase();
    if (isUuid(stored)) return stored;
    const created = createUuid();
    if (!created) return null;
    writeText(STORAGE.anonymousId, created);
    return created;
  }

  function getEntryPath() {
    const path = String(window.location?.pathname || "/").split(/[?#]/, 1)[0];
    return path.startsWith("/") && !path.startsWith("//") ? path.slice(0, 512) : "/";
  }

  function normalizedEntrySource() {
    try {
      const params = new URLSearchParams(window.location?.search || "");
      const medium = String(params.get("utm_medium") || "").trim().toLowerCase();
      if (medium === "bio" || medium === "link_in_bio") return "bio";
      const source = String(params.get("utm_source") || "").trim().toLowerCase();
      if (ALLOWED_ENTRY_SOURCES.has(source)) return source;
      if (source) return "other";
    } catch (_error) {}
    return "direct";
  }

  function deviceClass() {
    if (window.matchMedia?.("(max-width: 767px)").matches) return "mobile";
    if (window.matchMedia?.("(max-width: 1024px)").matches) return "tablet";
    return "desktop";
  }

  function loadOrCreateLocalSession() {
    const anonymousId = getAnonymousId();
    if (!anonymousId) return null;

    const stored = memory.localSession || readJson(STORAGE.session, null);
    const now = Date.now();
    const reusable = Boolean(
      stored &&
      isUuid(stored.id) &&
      stored.anonymousId === anonymousId &&
      Number.isFinite(Number(stored.lastActivityAt)) &&
      now - Number(stored.lastActivityAt) >= 0 &&
      now - Number(stored.lastActivityAt) < SESSION_TIMEOUT_MS
    );

    if (reusable) {
      memory.localSession = { ...stored };
      return memory.localSession;
    }

    memory.localSession = {
      id: createUuid(),
      anonymousId,
      startedAt: now,
      lastActivityAt: now,
    };

    if (!memory.localSession.id) return null;
    memory.sessionPromise = null;
    writeJson(STORAGE.session, memory.localSession);
    memory.completed = { sessionId: memory.localSession.id, tokens: [] };
    writeJson(STORAGE.completed, memory.completed);
    try {
      window.localStorage.removeItem(STORAGE.checkout);
    } catch (_error) {}
    return memory.localSession;
  }

  function touchLocalSession(session) {
    if (!session) return;
    session.lastActivityAt = Date.now();
    writeJson(STORAGE.session, session);
  }

  function getCompletedState(sessionId) {
    if (memory.completed?.sessionId === sessionId) return memory.completed;
    const stored = readJson(STORAGE.completed, null);
    memory.completed = stored?.sessionId === sessionId && Array.isArray(stored.tokens)
      ? { sessionId, tokens: stored.tokens.slice(-MAX_COMPLETED_TOKENS) }
      : { sessionId, tokens: [] };
    return memory.completed;
  }

  function hasCompleted(sessionId, token) {
    return getCompletedState(sessionId).tokens.includes(token);
  }

  function markCompleted(sessionId, token) {
    const completed = getCompletedState(sessionId);
    if (!completed.tokens.includes(token)) completed.tokens.push(token);
    completed.tokens = completed.tokens.slice(-MAX_COMPLETED_TOKENS);
    writeJson(STORAGE.completed, completed);
  }

  async function postJson(path, payload) {
    const response = await window.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      keepalive: true,
    });
    if (!response.ok) throw new Error("telemetry_request_failed");
    return response.json();
  }

  function sessionPayload(session) {
    return {
      session_id: session.id,
      anonymous_id: session.anonymousId,
      entry_path: getEntryPath(),
      entry_source: normalizedEntrySource(),
      device_class: deviceClass(),
      consent_state: "not_configured",
    };
  }

  async function ensureSession() {
    if (!isTelemetryEntryPage()) return null;
    const session = loadOrCreateLocalSession();
    if (!session) return null;
    if (memory.sessionPromise) return memory.sessionPromise;

    memory.sessionPromise = postJson("/api/telemetry/sessions", sessionPayload(session))
      .then(() => {
        touchLocalSession(session);
        return session;
      })
      .catch(() => {
        memory.sessionPromise = null;
        return null;
      });

    return memory.sessionPromise;
  }

  function makeDedupeKey(sessionId, token) {
    return `pseu:${sessionId}:${token}`.slice(0, 255);
  }

  async function sendEvent(eventName, fields, token) {
    try {
      const localSession = loadOrCreateLocalSession();
      if (!localSession || !token) return { sent: false };
      if (hasCompleted(localSession.id, token)) return { sent: false, duplicate: true };
      if (memory.inFlight.has(token)) return memory.inFlight.get(token);

      const attempt = (async () => {
        const session = await ensureSession();
        if (!session) return { sent: false };
        if (eventName !== "funnel_started" && !hasCompleted(session.id, "funnel_started")) {
          await trackFunnelStarted();
        }
        const eventId = createUuid();
        if (!eventId) return { sent: false };
        touchLocalSession(session);

        const payload = {
          event_id: eventId,
          session_id: session.id,
          event_name: eventName,
          event_version: VERSION,
          occurred_at: new Date().toISOString(),
          dedupe_key: makeDedupeKey(session.id, token),
          properties: fields.properties || {},
        };
        if (fields.sectionId) payload.section_id = fields.sectionId;
        if (fields.correlationId) payload.correlation_id = fields.correlationId;

        try {
          const response = await postJson("/api/telemetry/events", payload);
          markCompleted(session.id, token);
          return { sent: true, response };
        } catch (_error) {
          return { sent: false };
        }
      })().finally(() => memory.inFlight.delete(token));

      memory.inFlight.set(token, attempt);
      return attempt;
    } catch (_error) {
      return { sent: false };
    }
  }

  function trackFunnelStarted() {
    return sendEvent(
      "funnel_started",
      { properties: { funnel_id: "portal_pseu", entry_point: "external_funnel" } },
      "funnel_started"
    );
  }

  function trackSectionViewed(sectionId) {
    const normalized = String(sectionId || "").trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(SECTION_INDEXES, normalized)) {
      return Promise.resolve({ sent: false });
    }
    return sendEvent(
      "section_viewed",
      {
        sectionId: normalized,
        properties: { section_index: SECTION_INDEXES[normalized] },
      },
      `section_viewed:${normalized}`
    );
  }

  function trackVslStarted(vslId) {
    const normalized = String(vslId || "").trim().toLowerCase();
    if (!normalized) return Promise.resolve({ sent: false });
    return sendEvent(
      "vsl_started",
      { properties: { vsl_id: normalized } },
      `vsl_started:${normalized}`
    );
  }

  function trackVslProgress(vslId, milestone) {
    const normalized = String(vslId || "").trim().toLowerCase();
    const normalizedMilestone = Number(milestone);
    if (!normalized || ![25, 50, 75, 100].includes(normalizedMilestone)) {
      return Promise.resolve({ sent: false });
    }
    return sendEvent(
      "vsl_progress",
      { properties: { vsl_id: normalized, milestone: normalizedMilestone } },
      `vsl_progress:${normalized}:${normalizedMilestone}`
    );
  }

  function trackCtaClicked(ctaId, destination) {
    const normalizedId = String(ctaId || "").trim().toLowerCase();
    const normalizedDestination = String(destination || "section").trim().toLowerCase();
    if (!normalizedId) return Promise.resolve({ sent: false });
    const now = Date.now();
    const lastActivity = memory.ctaActivity.get(normalizedId) || 0;
    if (now - lastActivity < CTA_DEBOUNCE_MS) {
      return Promise.resolve({ sent: false, duplicate: true });
    }
    memory.ctaActivity.set(normalizedId, now);
    return sendEvent(
      "cta_clicked",
      { properties: { cta_id: normalizedId, destination: normalizedDestination } },
      `cta_clicked:${normalizedId}:${now}`
    );
  }

  function getCheckoutCorrelation(session, offerId) {
    const stored = readJson(STORAGE.checkout, null);
    const now = Date.now();
    if (
      stored?.sessionId === session.id &&
      stored.offerId === offerId &&
      isUuid(stored.correlationId) &&
      now - Number(stored.createdAt || 0) >= 0 &&
      now - Number(stored.createdAt || 0) < CHECKOUT_WINDOW_MS
    ) {
      return stored.correlationId;
    }
    const correlationId = createUuid();
    if (!correlationId) return null;
    writeJson(STORAGE.checkout, {
      sessionId: session.id,
      offerId,
      correlationId,
      createdAt: now,
    });
    return correlationId;
  }

  async function trackCheckoutStarted({ offerId = "portal_pseu", provider = "gumroad" } = {}) {
    try {
      const session = loadOrCreateLocalSession();
      if (!session) return { sent: false };
      const normalizedOffer = String(offerId).trim().toLowerCase();
      const correlationId = getCheckoutCorrelation(session, normalizedOffer);
      if (!correlationId) return { sent: false };
      const result = await sendEvent(
        "checkout_started",
        { correlationId, properties: { offer_id: normalizedOffer, provider } },
        `checkout_started:${normalizedOffer}:${correlationId}`
      );
      return { ...result, correlation_id: correlationId };
    } catch (_error) {
      return { sent: false };
    }
  }

  async function init() {
    if (memory.initialized || !isTelemetryEntryPage()) return ensureSession();
    memory.initialized = true;
    return ensureSession();
  }

  function getBehavioralSessionId() {
    if (!isTelemetryEntryPage()) return null;
    return loadOrCreateLocalSession()?.id || null;
  }

  function rotateBehavioralSession() {
    memory.localSession = null;
    memory.sessionPromise = null;
    memory.completed = null;
    memory.inFlight.clear();
    memory.ctaActivity.clear();
    try {
      window.localStorage.removeItem(STORAGE.session);
      window.localStorage.removeItem(STORAGE.completed);
      window.localStorage.removeItem(STORAGE.checkout);
    } catch (_error) {}
  }

  const api = {
    VERSION,
    getBehavioralSessionId,
    init,
    rotateBehavioralSession,
    trackCheckoutStarted,
    trackCtaClicked,
    trackFunnelStarted,
    trackSectionViewed,
    trackVslProgress,
    trackVslStarted,
  };
  window.PSEU_TELEMETRY = api;

  if (document.readyState === "loading") {
    api.ready = new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(init()), { once: true });
    }).then((result) => result);
  } else {
    api.ready = init();
  }
})();
