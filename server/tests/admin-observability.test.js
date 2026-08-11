require("dotenv").config();

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const bcrypt = require("bcryptjs");
const portalApp = require("../app");
const { pool, query } = require("../db/pool");

const PERIOD = { from: "2031-01-01", to: "2031-01-02" };
const PERIOD_QUERY = `from=${PERIOD.from}&to=${PERIOD.to}`;

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

async function request(baseUrl, pathname, { method = "GET", body, cookie, accept = "application/json" } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  const raw = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_error) { parsed = raw; }
  return { response, body: parsed, raw };
}

test("Pacote 7 oferece observabilidade administrativa estritamente read-only", async (t) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 14);
  const password = `Admin-${suffix}-9!`;
  const passwordHash = await bcrypt.hash(password, 4);
  const previousAdminEmails = process.env.ADMIN_EMAILS;
  const emails = {
    admin: `package7-admin-${suffix}@example.invalid`,
    common: `package7-common-${suffix}@example.invalid`,
    target: `package7-target-${suffix}@example.invalid`,
    other: `package7-other-${suffix}@example.invalid`,
    buyer: `package7-buyer-${suffix}@example.invalid`,
  };
  const sessionIds = [randomUUID(), randomUUID(), randomUUID()];
  const anonymousIds = [randomUUID(), randomUUID()];
  const eventIds = [];
  const saleId = `package7-sale-${suffix}`;
  let users = {};
  let server;
  let baseUrl;
  let adminCookie;
  let commonCookie;
  let cleaned = false;

  async function addEvent({ sessionId, eventName, at, sectionId = null, bookId = null, documentId = null, properties = {} }) {
    const id = randomUUID();
    eventIds.push(id);
    await query(
      `INSERT INTO events (
         id, session_id, event_name, event_version, source, occurred_at,
         section_id, book_id, document_id, properties
       ) VALUES ($1, $2, $3, 1, 'web', $4, $5, $6, $7, $8::jsonb)`,
      [id, sessionId, eventName, at, sectionId, bookId, documentId, JSON.stringify(properties)]
    );
  }

  async function login(email) {
    const result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(result.response.status, 200);
    return cookieFrom(result.response);
  }

  async function adminGet(pathname) {
    const result = await request(baseUrl, pathname, { cookie: adminCookie });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.ok, true);
    return result.body.data;
  }

  async function cleanup() {
    if (cleaned) return;
    if (eventIds.length) await query("DELETE FROM events WHERE id = ANY($1::uuid[])", [eventIds]);
    if (Object.keys(users).length) {
      const userIds = Object.values(users).map((user) => String(user.id));
      await query("DELETE FROM reading_progress WHERE user_id = ANY($1::bigint[])", [userIds]);
      await query("DELETE FROM behavioral_sessions WHERE user_id = ANY($1::bigint[]) OR id = ANY($2::uuid[])", [userIds, sessionIds]);
      await query(`DELETE FROM "session" WHERE sess->>'userId' = ANY($1::text[])`, [userIds]);
      await query("DELETE FROM users WHERE id = ANY($1::bigint[])", [userIds]);
    } else {
      await query("DELETE FROM behavioral_sessions WHERE id = ANY($1::uuid[])", [sessionIds]);
    }
    await query("DELETE FROM gumroad_sales WHERE sale_id = $1", [saleId]);
    process.env.ADMIN_EMAILS = previousAdminEmails;
    cleaned = true;
  }

  try {
    for (const [key, email] of Object.entries(emails).filter(([key]) => key !== "buyer")) {
      users[key] = (
        await query(
          `INSERT INTO users (email, password_hash, status, last_login_at)
           VALUES ($1, $2, 'active', CASE WHEN $3 = 'target' THEN '2031-01-01T11:00:00Z'::timestamptz ELSE NULL END)
           RETURNING id, email`,
          [email, passwordHash, key]
        )
      ).rows[0];
    }

    await query(
      `INSERT INTO behavioral_sessions (
         id, anonymous_id, user_id, started_at, last_seen_at, linked_at,
         entry_path, entry_source, device_class, consent_state
       ) VALUES
         ($1, $4, NULL, '2031-01-01T10:00:00Z', '2031-01-01T10:12:00Z', NULL, '/', 'bio', 'mobile', 'granted'),
         ($2, $4, NULL, '2031-01-01T10:30:00Z', '2031-01-01T10:35:00Z', NULL, '/', 'bio', 'mobile', 'granted'),
         ($3, $5, $6, '2031-01-01T11:00:00Z', '2031-01-01T12:30:00Z', '2031-01-01T12:00:00Z', '/', 'direct', 'desktop', 'granted')`,
      [sessionIds[0], sessionIds[1], sessionIds[2], anonymousIds[0], anonymousIds[1], users.target.id]
    );

    await addEvent({ sessionId: sessionIds[0], eventName: "funnel_started", at: "2031-01-01T10:01:00Z", properties: { funnel_id: "portal_pseu" } });
    await addEvent({ sessionId: sessionIds[2], eventName: "funnel_started", at: "2031-01-01T11:01:00Z", properties: { funnel_id: "portal_pseu" } });
    await addEvent({ sessionId: sessionIds[0], eventName: "section_viewed", at: "2031-01-01T10:02:00Z", sectionId: "funil-chamado", properties: { section_index: 0 } });
    await addEvent({ sessionId: sessionIds[2], eventName: "section_viewed", at: "2031-01-01T11:02:00Z", sectionId: "funil-chamado", properties: { section_index: 0 } });
    await addEvent({ sessionId: sessionIds[2], eventName: "section_viewed", at: "2031-01-01T11:03:00Z", sectionId: "funil-travessia", properties: { section_index: 2 } });
    await addEvent({ sessionId: sessionIds[2], eventName: "vsl_started", at: "2031-01-01T11:04:00Z", properties: { vsl_id: "travessia" } });
    await addEvent({ sessionId: sessionIds[2], eventName: "vsl_progress", at: "2031-01-01T11:05:00Z", properties: { vsl_id: "travessia", milestone: 25 } });
    await addEvent({ sessionId: sessionIds[2], eventName: "vsl_progress", at: "2031-01-01T11:06:00Z", properties: { vsl_id: "travessia", milestone: 50 } });
    await addEvent({ sessionId: sessionIds[2], eventName: "cta_clicked", at: "2031-01-01T11:07:00Z", properties: { cta_id: "atravessar_portal", destination: "checkout" } });
    await addEvent({ sessionId: sessionIds[2], eventName: "checkout_started", at: "2031-01-01T11:08:00Z", properties: { offer_id: "portal_pseu", provider: "gumroad" } });
    await addEvent({ sessionId: sessionIds[2], eventName: "reader_progress", at: "2031-01-01T12:05:00Z", bookId: "manual-do-despertar", documentId: "manual", properties: { current_page: 31, total_pages: 73, progress_percent: 43 } });
    await addEvent({ sessionId: sessionIds[2], eventName: "annotation_created", at: "2031-01-01T12:06:00Z", bookId: "manual-do-despertar", documentId: "manual", properties: { page_number: 31, private_text: "NAO_EXIBIR" } });

    await query(
      `INSERT INTO reading_progress (
         user_id, book_id, document_id, current_page, furthest_page, total_pages,
         progress_percent, status, last_session_id, last_activity_at, last_resumed_at,
         completed_at, resume_count, revision, updated_at
       ) VALUES
         ($1, 'manual-do-despertar', 'manual', 31, 31, 73, 43, 'reading', $3, '2031-01-01T12:10:00Z', '2031-01-01T12:00:00Z', NULL, 2, 4, '2031-01-01T12:10:00Z'),
         ($1, 'manual-do-despertar', 'caderno', 56, 56, 56, 100, 'completed', $3, '2031-01-01T12:20:00Z', '2031-01-01T12:15:00Z', '2031-01-01T12:20:00Z', 1, 3, '2031-01-01T12:20:00Z'),
         ($2, 'manual-do-despertar', 'manual', 4, 4, 73, 4, 'reading', NULL, '2031-01-01T13:00:00Z', NULL, NULL, 0, 1, '2031-01-01T13:00:00Z')`,
      [users.target.id, users.other.id, sessionIds[2]]
    );
    await query(
      `INSERT INTO gumroad_sales (sale_id, product_id, email, status, raw_payload, created_at, updated_at)
       VALUES ($1, 'package7-product', $2, 'active', '{}'::jsonb, '2031-01-01T11:30:00Z', '2031-01-01T11:30:00Z')`,
      [saleId, emails.buyer]
    );

    process.env.ADMIN_EMAILS = emails.admin;
    server = await listen(portalApp);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    adminCookie = await login(emails.admin);
    commonCookie = await login(emails.common);

    await t.test("01 usuario comum e bloqueado", async () => {
      const result = await request(baseUrl, `/api/admin/observability/overview?${PERIOD_QUERY}`, { cookie: commonCookie });
      assert.equal(result.response.status, 403);
    });

    await t.test("02 administrador acessa pagina e API", async () => {
      const page = await request(baseUrl, "/ia-pseu", { cookie: adminCookie, accept: "text/html" });
      assert.equal(page.response.status, 200);
      assert.match(page.raw, /Observat.rio interno/u);
      const api = await adminGet(`/api/admin/observability/overview?${PERIOD_QUERY}`);
      assert.ok(api.metrics);
    });

    await t.test("03 overview vazio retorna zeros reais", async () => {
      const data = await adminGet("/api/admin/observability/overview?from=1999-01-01&to=1999-01-02");
      assert.ok(Object.values(data.metrics).every((value) => value === 0));
    });

    await t.test("04 dados sinteticos aparecem no overview", async () => {
      const data = await adminGet(`/api/admin/observability/overview?${PERIOD_QUERY}`);
      assert.equal(data.metrics.anonymous_visitors, 2);
      assert.equal(data.metrics.behavioral_sessions, 3);
      assert.equal(data.metrics.linked_users, 1);
      assert.equal(data.metrics.active_readers, 2);
      assert.equal(data.metrics.completed_documents, 1);
    });

    await t.test("05 visitantes nao sao confundidos com sessoes", async () => {
      const data = await adminGet(`/api/admin/observability/overview?${PERIOD_QUERY}`);
      assert.notEqual(data.metrics.anonymous_visitors, data.metrics.behavioral_sessions);
    });

    await t.test("06 funil agrega alcance e abandono aproximado", async () => {
      const data = await adminGet(`/api/admin/observability/funnel?${PERIOD_QUERY}`);
      assert.equal(data.funnel_started.sessions, 2);
      assert.equal(data.sections.find((item) => item.section_id === "funil-travessia").approximate_abandonment_percent, 50);
    });

    await t.test("07 VSL separa identificador e milestones", async () => {
      const data = await adminGet(`/api/admin/observability/funnel?${PERIOD_QUERY}`);
      const vsl = data.vsl.find((item) => item.vsl_id === "travessia");
      assert.equal(vsl.started, 1);
      assert.equal(vsl.milestones[25], 1);
      assert.equal(vsl.milestones[50], 1);
      assert.equal(vsl.milestones[75], 0);
    });

    await t.test("08 CTA permanece separado por cta_id", async () => {
      const data = await adminGet(`/api/admin/observability/funnel?${PERIOD_QUERY}`);
      assert.deepEqual(data.ctas[0], { cta_id: "atravessar_portal", destination: "checkout", sessions: 1 });
    });

    await t.test("09 checkout nao e apresentado como compra", async () => {
      const data = await adminGet(`/api/admin/observability/funnel?${PERIOD_QUERY}`);
      assert.equal(data.checkout[0].sessions, 1);
      assert.match(data.caveat, /fontes separadas/i);
      assert.equal(Object.prototype.hasOwnProperty.call(data, "purchases"), false);
    });

    await t.test("10 compradores vem somente da fonte comercial oficial", async () => {
      const data = await adminGet(`/api/admin/observability/overview?${PERIOD_QUERY}`);
      assert.equal(data.metrics.official_buyers, 1);
    });

    await t.test("11 leitura retorna pagina atual", async () => {
      const data = await adminGet(`/api/admin/observability/reading?${PERIOD_QUERY}&user_id=${users.target.id}&document_id=manual`);
      assert.equal(data.items[0].current_page, 31);
    });

    await t.test("12 leitura retorna pagina mais distante", async () => {
      const data = await adminGet(`/api/admin/observability/reading?${PERIOD_QUERY}&user_id=${users.target.id}&document_id=manual`);
      assert.equal(data.items[0].furthest_page, 31);
    });

    await t.test("13 leitura retorna percentual atual", async () => {
      const data = await adminGet(`/api/admin/observability/reading?${PERIOD_QUERY}&user_id=${users.target.id}&document_id=manual`);
      assert.equal(data.items[0].progress_percent, 43);
    });

    await t.test("14 leitura retorna status", async () => {
      const data = await adminGet(`/api/admin/observability/reading?${PERIOD_QUERY}&user_id=${users.target.id}&document_id=manual`);
      assert.equal(data.items[0].status, "reading");
    });

    await t.test("15 leitura retorna retomadas e ultima retomada", async () => {
      const data = await adminGet(`/api/admin/observability/reading?${PERIOD_QUERY}&user_id=${users.target.id}&document_id=manual`);
      assert.equal(data.items[0].resume_count, 2);
      assert.ok(data.items[0].last_resumed_at);
    });

    await t.test("16 leitura identifica conclusao", async () => {
      const data = await adminGet(`/api/admin/observability/reading?${PERIOD_QUERY}&user_id=${users.target.id}&status=completed`);
      assert.equal(data.items.length, 1);
      assert.equal(data.items[0].document_id, "caderno");
      assert.equal(data.items[0].progress_percent, 100);
    });

    await t.test("17 filtros isolam usuarios", async () => {
      const data = await adminGet(`/api/admin/observability/reading?${PERIOD_QUERY}&user_id=${users.other.id}`);
      assert.equal(data.items.length, 1);
      assert.equal(data.items[0].user_id, String(users.other.id));
    });

    await t.test("18 jornada e ordenada cronologicamente", async () => {
      const data = await adminGet(`/api/admin/observability/users/${users.target.id}/journey?${PERIOD_QUERY}`);
      const times = data.timeline.map((item) => new Date(item.occurred_at).getTime());
      assert.deepEqual(times, [...times].sort((a, b) => a - b));
    });

    await t.test("19 jornada inclui evento anonimo por sessao vinculada", async () => {
      const data = await adminGet(`/api/admin/observability/users/${users.target.id}/journey?${PERIOD_QUERY}`);
      assert.ok(data.timeline.some((item) => item.type === "funnel_started" && item.session_id === sessionIds[2]));
    });

    await t.test("20 texto privado de anotacao nunca e exposto", async () => {
      const data = await adminGet(`/api/admin/observability/users/${users.target.id}/journey?${PERIOD_QUERY}`);
      assert.equal(JSON.stringify(data).includes("NAO_EXIBIR"), false);
      const annotation = data.timeline.find((item) => item.type === "annotation_created");
      assert.deepEqual(annotation.details, { page_number: 31 });
    });

    await t.test("21 metodos de escrita sao bloqueados", async () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const result = await request(baseUrl, "/api/admin/observability/overview", { method, cookie: adminCookie, body: {} });
        assert.equal(result.response.status, 405);
        assert.equal(result.body.error, "method_not_allowed");
      }
    });

    await t.test("22 paginacao aplica limite e metadados", async () => {
      const data = await adminGet("/api/admin/observability/users?page=1&page_size=1");
      assert.equal(data.items.length, 1);
      assert.equal(data.pagination.page_size, 1);
      assert.ok(data.pagination.total >= 4);
    });

    await t.test("23 filtros por livro documento e status funcionam", async () => {
      const data = await adminGet(`/api/admin/observability/reading?${PERIOD_QUERY}&book_id=manual-do-despertar&document_id=caderno&status=completed`);
      assert.equal(data.items.length, 1);
      assert.equal(data.items[0].document_id, "caderno");
    });

    await t.test("24 periodo limita as consultas", async () => {
      const populated = await adminGet(`/api/admin/observability/overview?${PERIOD_QUERY}`);
      const empty = await adminGet("/api/admin/observability/overview?from=1999-01-01&to=1999-01-02");
      assert.ok(populated.metrics.behavioral_sessions > empty.metrics.behavioral_sessions);
    });

    await t.test("25 listas vazias sao respostas genuinas", async () => {
      const data = await adminGet(`/api/admin/observability/reading?${PERIOD_QUERY}&book_id=livro-inexistente`);
      assert.deepEqual(data.items, []);
      assert.equal(data.pagination.total, 0);
    });

    await t.test("26 sessoes anonimas recentes usam apenas identificador pseudonimo", async () => {
      const data = await adminGet(`/api/admin/observability/sessions?${PERIOD_QUERY}`);
      assert.equal(data.filters.status, "anonymous");
      assert.equal(data.items.length, 2);
      assert.ok(data.items.every((item) => item.link_status === "anonymous"));
      assert.ok(data.items.every((item) => /^[A-F0-9]{8}$/.test(item.session_label)));
      assert.equal(data.items.some((item) => item.session_id === sessionIds[2]), false);
      assert.equal(data.items.find((item) => item.session_id === sessionIds[1]).stage.code, "session_created");
      assert.equal(JSON.stringify(data).includes(anonymousIds[0]), false);
      assert.equal(Object.prototype.hasOwnProperty.call(data, "anonymous_id"), false);
    });

    await t.test("27 filtro encontra checkout anonimo sem inferir compra", async () => {
      await addEvent({ sessionId: sessionIds[0], eventName: "vsl_started", at: "2031-01-01T10:03:00Z", properties: { vsl_id: "main" } });
      await addEvent({ sessionId: sessionIds[0], eventName: "vsl_progress", at: "2031-01-01T10:04:00Z", properties: { vsl_id: "main", milestone: 25 } });
      await addEvent({ sessionId: sessionIds[0], eventName: "cta_clicked", at: "2031-01-01T10:05:00Z", properties: { cta_id: "atravessar_portal", destination: "checkout", private_text: "NAO_EXIBIR_SESSION" } });
      await addEvent({ sessionId: sessionIds[0], eventName: "checkout_started", at: "2031-01-01T10:06:00Z", properties: { offer_id: "portal_pseu", provider: "gumroad" } });

      const data = await adminGet(`/api/admin/observability/sessions?${PERIOD_QUERY}&has_checkout=true`);
      assert.equal(data.items.length, 1);
      assert.equal(data.items[0].session_id, sessionIds[0]);
      assert.equal(data.items[0].checkout_started, true);
      assert.equal(data.items[0].highest_vsl_milestone, 25);
      assert.equal(data.items[0].stage.code, "checkout_started");
      assert.equal(data.commercial_correlation_available, false);
      assert.equal(Object.prototype.hasOwnProperty.call(data.items[0], "purchase"), false);
    });

    await t.test("28 raio X anonimo e cronologico e remove propriedades nao permitidas", async () => {
      const data = await adminGet(`/api/admin/observability/sessions/${sessionIds[0]}?${PERIOD_QUERY}`);
      const times = data.timeline.map((item) => new Date(item.occurred_at).getTime());
      assert.deepEqual(times, [...times].sort((a, b) => a - b));
      assert.ok(data.timeline.some((item) => item.type === "checkout_started"));
      assert.ok(data.timeline.every((item) => item.delta_seconds >= 0));
      assert.equal(data.session.link_status, "anonymous");
      assert.equal(data.purchase_observation, "not_observed_in_behavioral_telemetry");
      assert.match(data.purchase_copy, /Compra não observada/i);
      assert.equal(JSON.stringify(data).includes("NAO_EXIBIR_SESSION"), false);
      assert.equal(JSON.stringify(data).includes(anonymousIds[0]), false);
    });

    await t.test("29 sessao posteriormente vinculada aparece somente no filtro correto", async () => {
      const anonymous = await adminGet(`/api/admin/observability/sessions?${PERIOD_QUERY}&status=anonymous`);
      const linked = await adminGet(`/api/admin/observability/sessions?${PERIOD_QUERY}&status=linked`);
      assert.equal(anonymous.items.some((item) => item.session_id === sessionIds[2]), false);
      assert.equal(linked.items.some((item) => item.session_id === sessionIds[2]), true);
      assert.equal(linked.items.find((item) => item.session_id === sessionIds[2]).linked_user_id, String(users.target.id));
    });

    await t.test("30 filtros e paginacao de sessoes sao aplicados", async () => {
      const vsl = await adminGet(`/api/admin/observability/sessions?${PERIOD_QUERY}&has_vsl=true&page=1&page_size=1`);
      const cta = await adminGet(`/api/admin/observability/sessions?${PERIOD_QUERY}&has_cta=true`);
      assert.equal(vsl.items.length, 1);
      assert.equal(vsl.pagination.page_size, 1);
      assert.ok(vsl.pagination.total >= 1);
      assert.equal(cta.items.length, 1);
      assert.equal(cta.items[0].session_id, sessionIds[0]);
    });

    await t.test("31 sessao invalida e usuario comum permanecem bloqueados", async () => {
      const invalid = await request(baseUrl, "/api/admin/observability/sessions/not-a-uuid", { cookie: adminCookie });
      const forbidden = await request(baseUrl, `/api/admin/observability/sessions?${PERIOD_QUERY}`, { cookie: commonCookie });
      assert.equal(invalid.response.status, 400);
      assert.equal(invalid.body.error, "invalid_session_id");
      assert.equal(forbidden.response.status, 403);
    });

    await t.test("32 endpoints de sessoes rejeitam escrita", async () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const result = await request(baseUrl, "/api/admin/observability/sessions", { method, cookie: adminCookie, body: {} });
        assert.equal(result.response.status, 405);
        assert.equal(result.body.error, "method_not_allowed");
      }
    });

    await t.test("33 painel desktop preserva atalhos e seis visoes", async () => {
      const page = await request(baseUrl, "/ia-pseu", { cookie: adminCookie, accept: "text/html" });
      assert.match(page.raw, /Ver Funil/);
      assert.match(page.raw, /Ver Portal/);
      assert.match(page.raw, /Sessões anônimas recentes/);
      assert.equal((page.raw.match(/data-view=/g) || []).length, 6);
    });

    await t.test("34 painel contem adaptacao mobile real", async () => {
      const source = fs.readFileSync(path.resolve(__dirname, "../views/ai-panel-page.js"), "utf8");
      assert.match(source, /@media \(max-width: 720px\)/);
      assert.match(source, /grid-template-columns: 1fr/);
      assert.match(source, /min-height: 44px/);
    });

    await t.test("35 cliente usa API real e nao possui metricas simuladas", async () => {
      const source = fs.readFileSync(path.resolve(__dirname, "../../js/admin-observability.js"), "utf8");
      assert.match(source, /\/api\/admin\/observability/);
      assert.doesNotMatch(source, /mock|fixture|fake metric/i);
      assert.doesNotThrow(() => new Function(source));
    });

    await close(server);
    server = null;
    await cleanup();

    await t.test("36 nenhum dado sintetico permanece", async () => {
      const result = await query(
        `SELECT
           (SELECT count(*)::int FROM events WHERE id = ANY($1::uuid[])) AS events,
           (SELECT count(*)::int FROM behavioral_sessions WHERE id = ANY($2::uuid[])) AS sessions,
           (SELECT count(*)::int FROM gumroad_sales WHERE sale_id = $3) AS sales,
           (SELECT count(*)::int FROM users WHERE email = ANY($4::text[])) AS users`,
        [eventIds, sessionIds, saleId, Object.values(emails)]
      );
      assert.deepEqual(result.rows[0], { events: 0, sessions: 0, sales: 0, users: 0 });
    });
  } finally {
    if (server) await close(server);
    await cleanup();
    await pool.end();
  }
});
