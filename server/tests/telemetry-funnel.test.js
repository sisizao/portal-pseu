require("dotenv").config();

const assert = require("node:assert/strict");
const { randomUUID, webcrypto } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { after, before, test } = require("node:test");
const portalApp = require("../app");
const { pool, query } = require("../db/pool");

const sessionId = randomUUID();
const anonymousId = randomUUID();
const eventId = randomUUID();
const clientSource = fs.readFileSync(path.resolve(__dirname, "../../js/telemetry.js"), "utf8");
let server;
let baseUrl;
let baselineBusinessCounts;

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function listen(app) {
  return new Promise((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => resolve(listeningServer));
  });
}

async function post(pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json() };
}

function createFetchRecorder() {
  const state = {
    attempts: [],
    failNextEvent: false,
  };

  state.fetch = async (pathname, options) => {
    const payload = JSON.parse(options.body);
    const attempt = { pathname, payload, failed: false };
    state.attempts.push(attempt);
    if (pathname === "/api/telemetry/events" && state.failNextEvent) {
      state.failNextEvent = false;
      attempt.failed = true;
      throw new Error("simulated offline state");
    }
    return {
      ok: true,
      status: pathname.endsWith("/sessions") ? 201 : 201,
      json: async () => ({ ok: true }),
    };
  };

  return state;
}

async function loadTelemetryClient(storage, recorder, location = {}) {
  const errors = [];
  const document = {
    readyState: "complete",
    getElementById: (id) => (id === "funil-chamado" ? {} : null),
    addEventListener: () => {},
  };
  const window = {
    crypto: webcrypto,
    document,
    fetch: recorder.fetch,
    localStorage: storage,
    location: {
      pathname: location.pathname || "/",
      search: location.search || "",
    },
    matchMedia: () => ({ matches: false }),
  };
  window.window = window;

  const context = vm.createContext({
    Array,
    Date,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    URLSearchParams,
    Uint8Array,
    clearTimeout,
    console: {
      error: (...args) => errors.push(args),
      log: () => {},
      warn: (...args) => errors.push(args),
    },
    document,
    setTimeout,
    window,
  });
  vm.runInContext(clientSource, context, { filename: "js/telemetry.js" });
  await window.PSEU_TELEMETRY.ready;
  return { api: window.PSEU_TELEMETRY, errors };
}

before(async () => {
  baselineBusinessCounts = (
    await query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM gumroad_sales) AS gumroad_sales,
      (SELECT count(*)::int FROM entitlements) AS entitlements`)
  ).rows[0];
  server = await listen(portalApp);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  try {
    await query("DELETE FROM events WHERE session_id = $1::uuid", [sessionId]);
    await query("DELETE FROM behavioral_sessions WHERE id = $1::uuid", [sessionId]);
  } finally {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await pool.end();
  }
});

test("sessão anônima é criada de forma idempotente e sem user_id", async () => {
  const payload = {
    session_id: sessionId,
    anonymous_id: anonymousId,
    entry_path: "/?ignored=sensitive",
    entry_source: "bio",
    device_class: "desktop",
    consent_state: "not_configured",
  };

  const first = await post("/api/telemetry/sessions", payload);
  const refresh = await post("/api/telemetry/sessions", payload);
  assert.equal(first.response.status, 201);
  assert.equal(first.body.created, true);
  assert.equal(refresh.response.status, 200);
  assert.equal(refresh.body.created, false);

  const persisted = await query(
    `SELECT id, anonymous_id, user_id, entry_path, entry_source, device_class, consent_state
       FROM behavioral_sessions
      WHERE id = $1::uuid`,
    [sessionId]
  );
  assert.equal(persisted.rowCount, 1);
  assert.equal(String(persisted.rows[0].anonymous_id), anonymousId);
  assert.equal(persisted.rows[0].user_id, null);
  assert.equal(persisted.rows[0].entry_path, "/");
  assert.equal(persisted.rows[0].entry_source, "bio");
  assert.equal(persisted.rows[0].device_class, "desktop");
  assert.equal(persisted.rows[0].consent_state, "not_configured");
});

test("campos controlados pelo servidor são rejeitados na sessão", async () => {
  const result = await post("/api/telemetry/sessions", {
    session_id: randomUUID(),
    anonymous_id: randomUUID(),
    entry_path: "/",
    entry_source: "direct",
    device_class: "desktop",
    consent_state: "not_configured",
    user_id: 1,
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error, "server_owned_field_forbidden");
});

test("evento do funil usa a sessão criada e mantém user_id nulo", async () => {
  const result = await post("/api/telemetry/events", {
    event_id: eventId,
    session_id: sessionId,
    event_name: "funnel_started",
    event_version: 1,
    occurred_at: new Date().toISOString(),
    dedupe_key: `test:package3:${eventId}`,
    properties: { funnel_id: "portal_pseu", entry_point: "external_funnel" },
  });
  assert.equal(result.response.status, 201);

  const persisted = await query("SELECT user_id FROM events WHERE id = $1::uuid", [eventId]);
  assert.equal(persisted.rowCount, 1);
  assert.equal(persisted.rows[0].user_id, null);
});

test("cliente complementar deduplica funil, seções, VSL, CTA e checkout", async () => {
  const storage = new MemoryStorage();
  const recorder = createFetchRecorder();
  const firstLoad = await loadTelemetryClient(storage, recorder, {
    pathname: "/",
    search: "?utm_medium=bio&email=never-persist-this",
  });
  const firstSessionRequest = recorder.attempts.find((item) => item.pathname.endsWith("/sessions"));
  assert.ok(firstSessionRequest);
  assert.match(firstSessionRequest.payload.anonymous_id, /^[0-9a-f-]{36}$/);
  assert.match(firstSessionRequest.payload.session_id, /^[0-9a-f-]{36}$/);
  assert.equal(firstSessionRequest.payload.entry_path, "/");
  assert.equal(firstSessionRequest.payload.entry_source, "bio");
  assert.equal(JSON.stringify(firstSessionRequest.payload).includes("never-persist-this"), false);

  await firstLoad.api.trackFunnelStarted();
  await firstLoad.api.trackFunnelStarted();
  await firstLoad.api.trackSectionViewed("funil-chamado");
  await firstLoad.api.trackSectionViewed("funil-chamado");
  await firstLoad.api.trackSectionViewed("funil-biblioteca");
  await firstLoad.api.trackVslStarted("main");
  await firstLoad.api.trackVslStarted("main");
  for (const milestone of [25, 50, 75, 100]) {
    await firstLoad.api.trackVslProgress("main", milestone);
    await firstLoad.api.trackVslProgress("main", milestone);
  }
  await firstLoad.api.trackCtaClicked("cta_chamado_biblioteca", "section");
  await firstLoad.api.trackCtaClicked("cta_chamado_biblioteca", "section");
  const firstCheckout = await firstLoad.api.trackCheckoutStarted();
  const repeatedCheckout = await firstLoad.api.trackCheckoutStarted();
  assert.equal(firstCheckout.correlation_id, repeatedCheckout.correlation_id);

  recorder.failNextEvent = true;
  const failedAttempt = await firstLoad.api.trackSectionViewed("funil-travessia");
  const retriedAttempt = await firstLoad.api.trackSectionViewed("funil-travessia");
  assert.equal(failedAttempt.sent, false);
  assert.equal(retriedAttempt.sent, true);

  const successfulEvents = recorder.attempts.filter(
    (item) => item.pathname.endsWith("/events") && !item.failed
  );
  const count = (eventName) => successfulEvents.filter(
    (item) => item.payload.event_name === eventName
  ).length;
  assert.equal(count("funnel_started"), 1);
  assert.equal(count("section_viewed"), 3);
  assert.equal(count("vsl_started"), 1);
  assert.equal(count("vsl_progress"), 4);
  assert.equal(count("cta_clicked"), 1);
  assert.equal(count("checkout_started"), 1);
  assert.deepEqual(
    successfulEvents
      .filter((item) => item.payload.event_name === "vsl_progress")
      .map((item) => item.payload.properties.milestone),
    [25, 50, 75, 100]
  );
  assert.equal(successfulEvents.some((item) => "user_id" in item.payload), false);
  assert.equal(firstLoad.errors.length, 0);

  const eventCountBeforeRefresh = successfulEvents.length;
  const refreshLoad = await loadTelemetryClient(storage, recorder);
  await refreshLoad.api.trackFunnelStarted();
  const eventCountAfterRefresh = recorder.attempts.filter(
    (item) => item.pathname.endsWith("/events") && !item.failed
  ).length;
  assert.equal(eventCountAfterRefresh, eventCountBeforeRefresh);
  const sessionRequests = recorder.attempts.filter((item) => item.pathname.endsWith("/sessions"));
  assert.equal(sessionRequests[1].payload.session_id, sessionRequests[0].payload.session_id);

  const storedSession = JSON.parse(storage.getItem("pseu.telemetry.behavioralSession.v1"));
  storedSession.lastActivityAt = Date.now() - (31 * 60 * 1000);
  storage.setItem("pseu.telemetry.behavioralSession.v1", JSON.stringify(storedSession));
  const rotatedLoad = await loadTelemetryClient(storage, recorder);
  const latestSessionRequest = recorder.attempts.filter(
    (item) => item.pathname.endsWith("/sessions")
  ).at(-1);
  assert.notEqual(latestSessionRequest.payload.session_id, sessionRequests[0].payload.session_id);
  assert.equal(latestSessionRequest.payload.anonymous_id, sessionRequests[0].payload.anonymous_id);
  await rotatedLoad.api.trackSectionViewed("funil-chamado");
  const rotatedSessionEvents = recorder.attempts.filter(
    (item) => item.pathname.endsWith("/events") &&
      !item.failed &&
      item.payload.session_id === latestSessionRequest.payload.session_id
  );
  assert.deepEqual(
    rotatedSessionEvents.map((item) => item.payload.event_name),
    ["funnel_started", "section_viewed"]
  );
});

test("tabelas comerciais permanecem inalteradas", async () => {
  const currentCounts = (
    await query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM gumroad_sales) AS gumroad_sales,
      (SELECT count(*)::int FROM entitlements) AS entitlements`)
  ).rows[0];
  assert.deepEqual(currentCounts, baselineBusinessCounts);
});
