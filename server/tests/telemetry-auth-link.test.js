require("dotenv").config();

const assert = require("node:assert/strict");
const { randomUUID, webcrypto } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const bcrypt = require("bcryptjs");
const express = require("express");
const portalApp = require("../app");
const { pool, query } = require("../db/pool");
const {
  associateBehavioralSessionAfterAuth,
  linkBehavioralSessionToUser,
} = require("../services/telemetry-link.service");

const clientSource = fs.readFileSync(path.resolve(__dirname, "../../js/telemetry.js"), "utf8");
const linkSource = fs.readFileSync(
  path.resolve(__dirname, "../services/telemetry-link.service.js"),
  "utf8"
);
const authSource = fs.readFileSync(path.resolve(__dirname, "../routes/auth.routes.js"), "utf8");
const mainSource = fs.readFileSync(path.resolve(__dirname, "../../js/main.js"), "utf8");

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
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function cookieFrom(response) {
  return String(response.headers.get("set-cookie") || "").split(";", 1)[0];
}

async function request(baseUrl, pathname, { method = "GET", body, cookie, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  const type = response.headers.get("content-type") || "";
  const responseBody = type.includes("application/json")
    ? await response.json()
    : await response.text();
  return { response, body: responseBody, cookie: cookieFrom(response) };
}

function createFetchRecorder() {
  const attempts = [];
  return {
    attempts,
    fetch: async (pathname, options) => {
      attempts.push({ pathname, payload: JSON.parse(options.body) });
      return { ok: true, status: 201, json: async () => ({ ok: true }) };
    },
  };
}

async function loadTelemetryClient(storage, recorder) {
  const document = {
    readyState: "complete",
    getElementById: () => null,
    addEventListener: () => {},
  };
  const window = {
    crypto: webcrypto,
    document,
    fetch: recorder.fetch,
    localStorage: storage,
    location: { pathname: "/acesso", search: "" },
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
    console,
    document,
    window,
  });
  vm.runInContext(clientSource, context, { filename: "js/telemetry.js" });
  await window.PSEU_TELEMETRY.ready;
  return window.PSEU_TELEMETRY;
}

function loadIsolatedClaimRouter({ trustedUser, onAssociation }) {
  const authPath = require.resolve("../routes/auth.routes");
  const poolModule = require("../db/pool");
  const userModule = require("../services/user.service");
  const entitlementModule = require("../services/entitlement.service");
  const linkModule = require("../services/telemetry-link.service");
  const cachedAuthModule = require.cache[authPath];
  const originals = {
    withTransaction: poolModule.withTransaction,
    hasActivePurchase: userModule.hasActivePurchase,
    createOrClaimUser: userModule.createOrClaimUser,
    touchLastLogin: userModule.touchLastLogin,
    ensureInitialEntitlements: entitlementModule.ensureInitialEntitlements,
    associateBehavioralSessionAfterAuth: linkModule.associateBehavioralSessionAfterAuth,
  };

  delete require.cache[authPath];
  poolModule.withTransaction = async (work) => work({ query: async () => ({ rows: [] }) });
  userModule.hasActivePurchase = async () => true;
  userModule.createOrClaimUser = async () => trustedUser;
  userModule.touchLastLogin = async () => {};
  entitlementModule.ensureInitialEntitlements = async () => ["manual-do-despertar"];
  linkModule.associateBehavioralSessionAfterAuth = async (req, userId) => {
    onAssociation({
      sessionId: req.get("x-pseu-behavioral-session"),
      userId: String(userId),
    });
    return { linked: true };
  };

  let isolatedRouter;
  try {
    isolatedRouter = require(authPath);
  } finally {
    poolModule.withTransaction = originals.withTransaction;
    userModule.hasActivePurchase = originals.hasActivePurchase;
    userModule.createOrClaimUser = originals.createOrClaimUser;
    userModule.touchLastLogin = originals.touchLastLogin;
    entitlementModule.ensureInitialEntitlements = originals.ensureInitialEntitlements;
    linkModule.associateBehavioralSessionAfterAuth = originals.associateBehavioralSessionAfterAuth;
    if (cachedAuthModule) require.cache[authPath] = cachedAuthModule;
    else delete require.cache[authPath];
  }

  return isolatedRouter;
}

test("Pacote 4 associa sessão anônima à identidade autenticada com segurança", async (t) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
  const userAEmail = `package4-a-${suffix}@example.invalid`;
  const userBEmail = `package4-b-${suffix}@example.invalid`;
  const password = `Local-${suffix}-9!`;
  const sessionA = randomUUID();
  const anonymousA = randomUUID();
  const sessionB = randomUUID();
  const anonymousB = randomUUID();
  const historicalEventId = randomUUID();
  const postLoginEventId = randomUUID();
  const createdSessionIds = new Set([sessionA, sessionB]);
  const serverErrors = [];
  const serverWarnings = [];
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  let server;
  let baseUrl;
  let userA;
  let userB;
  let loginACookie;
  let loginBCookie;
  let baseline;
  let baselineGumroad;
  let cleaned = false;

  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    const ids = [...createdSessionIds];
    await query("DELETE FROM events WHERE session_id = ANY($1::uuid[])", [ids]);
    await query("DELETE FROM behavioral_sessions WHERE id = ANY($1::uuid[])", [ids]);
    await query(
      `DELETE FROM "session"
        WHERE sess->>'email' = ANY($1::text[])`,
      [[userAEmail, userBEmail]]
    );
    await query("DELETE FROM access_tokens WHERE LOWER(email) = ANY($1::text[])", [
      [userAEmail, userBEmail],
    ]);
    await query("DELETE FROM users WHERE LOWER(email) = ANY($1::text[])", [
      [userAEmail, userBEmail],
    ]);
  }

  try {
    baseline = (
      await query(`SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM gumroad_sales) AS gumroad_sales,
        (SELECT count(*)::int FROM entitlements) AS entitlements`)
    ).rows[0];
    baselineGumroad = (
      await query(
        `SELECT sale_id, product_id, email, status, raw_payload, created_at, updated_at
           FROM gumroad_sales
          ORDER BY id`
      )
    ).rows;

    const passwordHash = await bcrypt.hash(password, 4);
    userA = (
      await query(
        `INSERT INTO users (email, password_hash, status)
         VALUES ($1, $2, 'active')
         RETURNING id, email`,
        [userAEmail, passwordHash]
      )
    ).rows[0];
    userB = (
      await query(
        `INSERT INTO users (email, password_hash, status)
         VALUES ($1, $2, 'active')
         RETURNING id, email`,
        [userBEmail, passwordHash]
      )
    ).rows[0];

    console.error = (...args) => serverErrors.push(args);
    console.warn = (...args) => serverWarnings.push(args);
    server = await listen(portalApp);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await t.test("1. visitante anônimo cria behavioral_session", async () => {
      const created = await request(baseUrl, "/api/telemetry/sessions", {
        method: "POST",
        body: {
          session_id: sessionA,
          anonymous_id: anonymousA,
          entry_path: "/",
          entry_source: "direct",
          device_class: "desktop",
          consent_state: "not_configured",
        },
      });
      assert.equal(created.response.status, 201);
      const row = await query("SELECT user_id FROM behavioral_sessions WHERE id = $1::uuid", [sessionA]);
      assert.equal(row.rows[0].user_id, null);
    });

    await t.test("2. eventos pré-login permanecem user_id NULL", async () => {
      const event = await request(baseUrl, "/api/telemetry/events", {
        method: "POST",
        body: {
          event_id: historicalEventId,
          session_id: sessionA,
          event_name: "funnel_started",
          event_version: 1,
          occurred_at: new Date().toISOString(),
          dedupe_key: `package4:historic:${historicalEventId}`,
          properties: { funnel_id: "portal_pseu" },
        },
      });
      assert.equal(event.response.status, 201);
      const row = await query("SELECT user_id FROM events WHERE id = $1::uuid", [historicalEventId]);
      assert.equal(row.rows[0].user_id, null);
    });

    await t.test("3. login válido associa a sessão ao users.id autenticado", async () => {
      const login = await request(baseUrl, "/api/auth/login", {
        method: "POST",
        headers: { "x-pseu-behavioral-session": sessionA },
        body: { email: userAEmail, password },
      });
      assert.equal(login.response.status, 200);
      loginACookie = login.cookie;
      assert.ok(loginACookie);
      const row = await query("SELECT user_id FROM behavioral_sessions WHERE id = $1::uuid", [sessionA]);
      assert.equal(String(row.rows[0].user_id), String(userA.id));
    });

    let firstLinkedAt;
    await t.test("4. linked_at é preenchido no primeiro vínculo", async () => {
      const row = await query("SELECT linked_at FROM behavioral_sessions WHERE id = $1::uuid", [sessionA]);
      firstLinkedAt = row.rows[0].linked_at;
      assert.ok(firstLinkedAt instanceof Date);
    });

    await t.test("5. repetir o mesmo vínculo é idempotente", async () => {
      const result = await linkBehavioralSessionToUser(sessionA, userA.id);
      assert.equal(result.linked, true);
      const row = await query("SELECT linked_at FROM behavioral_sessions WHERE id = $1::uuid", [sessionA]);
      assert.equal(row.rows[0].linked_at.toISOString(), firstLinkedAt.toISOString());
    });

    await t.test("6. navegador não consegue escolher user_id", async () => {
      const login = await request(baseUrl, "/api/auth/login", {
        method: "POST",
        headers: { "x-pseu-behavioral-session": sessionA },
        body: { email: userAEmail, password, user_id: userB.id },
      });
      assert.equal(login.response.status, 200);
      const row = await query("SELECT user_id FROM behavioral_sessions WHERE id = $1::uuid", [sessionA]);
      assert.equal(String(row.rows[0].user_id), String(userA.id));
    });

    await t.test("7. e-mail não é chave da associação", () => {
      assert.equal(/\bemail\b/i.test(linkSource), false);
      assert.match(authSource, /associateBehavioralSessionAfterAuth\(req, user\.id\)/);
      assert.match(authSource, /associateBehavioralSessionAfterAuth\(req, claim\.user\.id\)/);
    });

    await t.test("8. UUID inválido falha de forma segura", async () => {
      await assert.rejects(
        () => linkBehavioralSessionToUser("not-a-uuid", userA.id),
        (error) => error.code === "invalid_behavioral_session_id" && error.status === 400
      );
    });

    await t.test("9. sessão inexistente é tratada", async () => {
      await assert.rejects(
        () => linkBehavioralSessionToUser(randomUUID(), userA.id),
        (error) => error.code === "behavioral_session_not_found" && error.status === 404
      );

      const endedSessionId = randomUUID();
      const staleSessionId = randomUUID();
      createdSessionIds.add(endedSessionId);
      createdSessionIds.add(staleSessionId);
      await query(
        `INSERT INTO behavioral_sessions (
          id, anonymous_id, started_at, last_seen_at, ended_at, entry_source, consent_state
        ) VALUES
          ($1::uuid, $2::uuid, NOW() - INTERVAL '2 minutes', NOW() - INTERVAL '1 minute', NOW(), 'direct', 'not_configured'),
          ($3::uuid, $4::uuid, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', NULL, 'direct', 'not_configured')`,
        [endedSessionId, randomUUID(), staleSessionId, randomUUID()]
      );
      await assert.rejects(
        () => linkBehavioralSessionToUser(endedSessionId, userA.id),
        (error) => error.code === "behavioral_session_inactive" && error.status === 422
      );
      await assert.rejects(
        () => linkBehavioralSessionToUser(staleSessionId, userA.id),
        (error) => error.code === "behavioral_session_inactive" && error.status === 422
      );
    });

    await t.test("10. vínculo conflitante com outro usuário é bloqueado", async () => {
      await assert.rejects(
        () => linkBehavioralSessionToUser(sessionA, userB.id),
        (error) => error.code === "behavioral_session_link_conflict" && error.status === 409
      );
      const row = await query("SELECT user_id FROM behavioral_sessions WHERE id = $1::uuid", [sessionA]);
      assert.equal(String(row.rows[0].user_id), String(userA.id));
    });

    await t.test("11. falha de telemetria não bloqueia login", async () => {
      const isolated = await associateBehavioralSessionAfterAuth(
        { get: () => sessionA },
        userB.id,
        { linkBehavioralSessionToUser: async () => { throw new Error("simulated"); } }
      );
      assert.equal(isolated.linked, false);

      const login = await request(baseUrl, "/api/auth/login", {
        method: "POST",
        headers: { "x-pseu-behavioral-session": "invalid" },
        body: { email: userBEmail, password },
      });
      assert.equal(login.response.status, 200);
      loginBCookie = login.cookie;
      assert.ok(loginBCookie);
    });

    await t.test("12. falha de telemetria não bloqueia o Portal", async () => {
      const portal = await request(baseUrl, "/portal", { cookie: loginBCookie });
      assert.equal(portal.response.status, 200);
      assert.match(portal.body, /Portal PSEU/i);
    });

    await t.test("13. returnTo protegido continua funcional", async () => {
      const protectedPage = await request(baseUrl, "/portal?source=package4");
      assert.equal(protectedPage.response.status, 302);
      assert.equal(
        protectedPage.response.headers.get("location"),
        "/acesso?returnTo=%2Fportal%3Fsource%3Dpackage4"
      );
    });

    await t.test("14. Primeiro Acesso usa identidade server-side antes da associação", async () => {
      const association = [];
      const fakeUser = { id: "9000001", email: "claim-fixture@example.invalid", status: "active" };
      const isolatedRouter = loadIsolatedClaimRouter({
        trustedUser: fakeUser,
        onAssociation: (value) => association.push(value),
      });
      const isolatedApp = express();
      isolatedApp.use(express.json());
      isolatedApp.use((req, _res, next) => {
        req.session = {
          regenerate: (callback) => callback(),
          destroy: (callback) => callback(),
        };
        next();
      });
      isolatedApp.use("/api/auth", isolatedRouter);
      const isolatedServer = await listen(isolatedApp);
      try {
        const claimSessionId = randomUUID();
        const claim = await request(
          `http://127.0.0.1:${isolatedServer.address().port}`,
          "/api/auth/claim",
          {
            method: "POST",
            headers: { "x-pseu-behavioral-session": claimSessionId },
            body: { email: fakeUser.email, password: "synthetic-password" },
          }
        );
        assert.equal(claim.response.status, 200);
        assert.deepEqual(association, [{ sessionId: claimSessionId, userId: fakeUser.id }]);
      } finally {
        await close(isolatedServer);
      }
    });

    await t.test("15. Login continua funcional sem telemetria", async () => {
      const login = await request(baseUrl, "/api/auth/login", {
        method: "POST",
        body: { email: userAEmail, password },
      });
      assert.equal(login.response.status, 200);
      assert.ok(login.cookie);
      loginACookie = login.cookie;
    });

    await t.test("16. logout não corrompe o vínculo anterior", async () => {
      const logout = await request(baseUrl, "/api/auth/logout", {
        method: "POST",
        cookie: loginACookie,
      });
      assert.equal(logout.response.status, 200);
      const row = await query("SELECT user_id, linked_at FROM behavioral_sessions WHERE id = $1::uuid", [sessionA]);
      assert.equal(String(row.rows[0].user_id), String(userA.id));
      assert.equal(row.rows[0].linked_at.toISOString(), firstLinkedAt.toISOString());
    });

    await t.test("17. troca de conta recebe nova sessão e não herda a anterior", async () => {
      const storage = new MemoryStorage();
      storage.setItem("pseu.telemetry.anonymousId.v1", anonymousA);
      storage.setItem("pseu.telemetry.behavioralSession.v1", JSON.stringify({
        id: sessionA,
        anonymousId: anonymousA,
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
      }));
      const firstRecorder = createFetchRecorder();
      const firstClient = await loadTelemetryClient(storage, firstRecorder);
      assert.equal(firstClient.getBehavioralSessionId(), sessionA);
      firstClient.rotateBehavioralSession();
      const secondRecorder = createFetchRecorder();
      const secondClient = await loadTelemetryClient(storage, secondRecorder);
      const rotatedSessionId = secondClient.getBehavioralSessionId();
      const rotatedPayload = secondRecorder.attempts.find((attempt) => attempt.pathname === "/api/telemetry/sessions").payload;
      assert.notEqual(rotatedSessionId, sessionA);
      assert.equal(rotatedPayload.anonymous_id, anonymousA);
      createdSessionIds.add(rotatedSessionId);

      const created = await request(baseUrl, "/api/telemetry/sessions", {
        method: "POST",
        body: rotatedPayload,
      });
      assert.equal(created.response.status, 201);
      const login = await request(baseUrl, "/api/auth/login", {
        method: "POST",
        headers: { "x-pseu-behavioral-session": rotatedSessionId },
        body: { email: userBEmail, password },
      });
      assert.equal(login.response.status, 200);
      const rows = await query(
        "SELECT id, user_id FROM behavioral_sessions WHERE id = ANY($1::uuid[]) ORDER BY id",
        [[sessionA, rotatedSessionId]]
      );
      const ownership = new Map(rows.rows.map((row) => [String(row.id), String(row.user_id)]));
      assert.equal(ownership.get(sessionA), String(userA.id));
      assert.equal(ownership.get(rotatedSessionId), String(userB.id));
      assert.match(mainSource, /PSEU_TELEMETRY\?\.rotateBehavioralSession\?\.\(\)/);
    });

    await t.test("18. eventos históricos não são reescritos; novos resolvem por sessão", async () => {
      const historical = await query("SELECT user_id FROM events WHERE id = $1::uuid", [historicalEventId]);
      assert.equal(historical.rows[0].user_id, null);

      const created = await request(baseUrl, "/api/telemetry/events", {
        method: "POST",
        body: {
          event_id: postLoginEventId,
          session_id: sessionA,
          event_name: "section_viewed",
          event_version: 1,
          occurred_at: new Date().toISOString(),
          section_id: "funil-chamado",
          dedupe_key: `package4:post-login:${postLoginEventId}`,
          properties: { section_index: 1 },
        },
      });
      assert.equal(created.response.status, 201);
      const resolved = await query(
        `SELECT e.user_id AS event_user_id, s.user_id AS session_user_id
           FROM events e
           JOIN behavioral_sessions s ON s.id = e.session_id
          WHERE e.id = $1::uuid`,
        [postLoginEventId]
      );
      assert.equal(resolved.rows[0].event_user_id, null);
      assert.equal(String(resolved.rows[0].session_user_id), String(userA.id));
    });

    await t.test("19. Gumroad e tabelas comerciais não são alterados", async () => {
      const currentGumroad = (
        await query(
          `SELECT sale_id, product_id, email, status, raw_payload, created_at, updated_at
             FROM gumroad_sales
            ORDER BY id`
        )
      ).rows;
      assert.deepEqual(currentGumroad, baselineGumroad);
      const entitlements = await query(
        "SELECT count(*)::int AS count FROM entitlements WHERE user_id = ANY($1::bigint[])",
        [[userA.id, userB.id]]
      );
      assert.equal(entitlements.rows[0].count, 0);
    });

    await t.test("20. reader e Caderno permanecem fora do pacote", () => {
      assert.equal(linkSource.includes("reading_progress"), false);
      assert.equal(authSource.includes("reader_progress"), false);
      assert.equal(authSource.includes("caderno-de-travessia"), false);
    });

    await t.test("21. servidor permanece saudável e sem erros relevantes", async () => {
      const health = await request(baseUrl, "/api/health");
      assert.equal(health.response.status, 200);
      assert.equal(health.body.ok, true);
      assert.equal(serverErrors.length, 0);
      assert.ok(serverWarnings.every((entry) => String(entry[0]).includes("PSEU TELEMETRY")));
    });

    await cleanup();
    const afterCleanup = (
      await query(`SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM gumroad_sales) AS gumroad_sales,
        (SELECT count(*)::int FROM entitlements) AS entitlements`)
    ).rows[0];
    assert.deepEqual(afterCleanup, baseline);
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    if (server) await close(server);
    await cleanup();
    await pool.end();
  }
});
