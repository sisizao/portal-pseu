require("dotenv").config();

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { after, before, test } = require("node:test");
const express = require("express");
const portalApp = require("../app");
const { pool, query } = require("../db/pool");
const { createTelemetryRouter } = require("../routes/telemetry.routes");
const { createTelemetryIngestionService } = require("../services/telemetry-ingestion.service");

const behavioralSessionId = randomUUID();
const anonymousId = randomUUID();
let server;
let baseUrl;
let baselineBusinessCounts;

function eventPayload(overrides = {}) {
  const eventId = overrides.event_id || randomUUID();
  return {
    event_id: eventId,
    session_id: behavioralSessionId,
    event_name: "funnel_started",
    event_version: 1,
    occurred_at: new Date().toISOString(),
    dedupe_key: `test:${eventId}`,
    properties: { funnel_id: "portal_pseu" },
    ...overrides,
  };
}

async function postJson(payload, url = `${baseUrl}/api/telemetry/events`) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { response, body };
}

async function createHttpServer(router) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/telemetry", router);

  return new Promise((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => {
      resolve(listeningServer);
    });
  });
}

async function listen(app) {
  return new Promise((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => {
      resolve(listeningServer);
    });
  });
}

before(async () => {
  baselineBusinessCounts = (
    await query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM gumroad_sales) AS gumroad_sales,
      (SELECT count(*)::int FROM entitlements) AS entitlements`)
  ).rows[0];

  await query(
    `INSERT INTO behavioral_sessions (id, anonymous_id, entry_source, consent_state)
     VALUES ($1::uuid, $2::uuid, 'telemetry_contract_test', 'test')`,
    [behavioralSessionId, anonymousId]
  );

  server = await listen(portalApp);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  try {
    await query("DELETE FROM events WHERE session_id = $1::uuid", [behavioralSessionId]);
    await query("DELETE FROM behavioral_sessions WHERE id = $1::uuid", [behavioralSessionId]);
  } finally {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await pool.end();
  }
});

test("1. evento válido é persistido", async () => {
  const payload = eventPayload();
  const { response, body } = await postJson(payload);
  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.created, true);

  const persisted = await query("SELECT count(*)::int AS count FROM events WHERE id = $1::uuid", [
    payload.event_id,
  ]);
  assert.equal(persisted.rows[0].count, 1);
});

test("2. evento desconhecido é rejeitado", async () => {
  const { response, body } = await postJson(eventPayload({ event_name: "unknown_event" }));
  assert.equal(response.status, 400);
  assert.equal(body.error, "unknown_event");
});

test("3. versão incompatível é rejeitada", async () => {
  const { response, body } = await postJson(eventPayload({ event_version: 2 }));
  assert.equal(response.status, 400);
  assert.equal(body.error, "unsupported_event_version");
});

test("4. propriedade fora da allowlist é rejeitada", async () => {
  const { response, body } = await postJson(
    eventPayload({ properties: { funnel_id: "portal_pseu", arbitrary_value: "no" } })
  );
  assert.equal(response.status, 400);
  assert.equal(body.error, "unknown_property");
});

test("5. payload excessivo é rejeitado", async () => {
  const { response, body } = await postJson(
    eventPayload({ properties: { padding: "x".repeat(17 * 1024) } })
  );
  assert.equal(response.status, 413);
  assert.equal(body.error, "payload_too_large");
});

test("6. occurred_at inválido é rejeitado", async () => {
  const { response, body } = await postJson(eventPayload({ occurred_at: "not-a-date" }));
  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_occurred_at");
});

test("7. repetição do event_id é idempotente", async () => {
  const payload = eventPayload();
  const first = await postJson(payload);
  const retry = await postJson(payload);
  assert.equal(first.response.status, 201);
  assert.equal(retry.response.status, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.duplicate_reason, "event_id");

  const persisted = await query("SELECT count(*)::int AS count FROM events WHERE id = $1::uuid", [
    payload.event_id,
  ]);
  assert.equal(persisted.rows[0].count, 1);
});

test("8. session_id inexistente é rejeitado", async () => {
  const { response, body } = await postJson(eventPayload({ session_id: randomUUID() }));
  assert.equal(response.status, 422);
  assert.equal(body.error, "behavioral_session_not_found");
});

test("9. dedupe_key repetida não duplica evento", async () => {
  const occurredAt = new Date().toISOString();
  const dedupeKey = `test:dedupe:${randomUUID()}`;
  const firstPayload = eventPayload({ occurred_at: occurredAt, dedupe_key: dedupeKey });
  const secondPayload = eventPayload({
    event_id: randomUUID(),
    occurred_at: occurredAt,
    dedupe_key: dedupeKey,
  });
  const first = await postJson(firstPayload);
  const duplicate = await postJson(secondPayload);

  assert.equal(first.response.status, 201);
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.duplicate_reason, "dedupe_key");

  const persisted = await query("SELECT count(*)::int AS count FROM events WHERE dedupe_key = $1", [
    dedupeKey,
  ]);
  assert.equal(persisted.rows[0].count, 1);
});

test("10. user_id enviado pelo cliente é rejeitado", async () => {
  const { response, body } = await postJson(eventPayload({ user_id: 1 }));
  assert.equal(response.status, 400);
  assert.equal(body.error, "server_owned_field_forbidden");
});

test("11. campo sensível é rejeitado", async () => {
  const { response, body } = await postJson(
    eventPayload({ properties: { funnel_id: "portal_pseu", email: "hidden@example.invalid" } })
  );
  assert.equal(response.status, 400);
  assert.equal(body.error, "sensitive_field_forbidden");
});

test("12. falha de banco é isolada e o servidor continua vivo", async () => {
  const failingService = createTelemetryIngestionService({
    query: async () => {
      const error = new Error("simulated database failure");
      error.code = "SIMULATED_DB_FAILURE";
      throw error;
    },
  });
  const failingRouter = createTelemetryRouter({
    ingestEvent: failingService.ingestEvent,
  });
  const isolatedServer = await createHttpServer(failingRouter);
  const address = isolatedServer.address();
  const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const failed = await postJson(eventPayload(), `${isolatedBaseUrl}/api/telemetry/events`);
    assert.equal(failed.response.status, 503);
    assert.equal(failed.body.error, "telemetry_unavailable");

    const health = await fetch(`${isolatedBaseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
  } finally {
    await new Promise((resolve, reject) => {
      isolatedServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("13. tabelas comerciais e usuários permanecem inalterados", async () => {
  const reservedCommercialEvent = await postJson(
    eventPayload({
      event_name: "purchase_processed",
      properties: { provider: "gumroad" },
    })
  );
  assert.equal(reservedCommercialEvent.response.status, 403);
  assert.equal(reservedCommercialEvent.body.error, "server_event_forbidden");

  const currentCounts = (
    await query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM gumroad_sales) AS gumroad_sales,
      (SELECT count(*)::int FROM entitlements) AS entitlements`)
  ).rows[0];
  assert.deepEqual(currentCounts, baselineBusinessCounts);

  const commercialEvents = await query(
    `SELECT count(*)::int AS count
       FROM events
      WHERE session_id = $1::uuid
        AND event_name IN ('purchase_processed', 'entitlement_granted')`,
    [behavioralSessionId]
  );
  assert.equal(commercialEvents.rows[0].count, 0);
});
