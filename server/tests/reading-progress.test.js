require("dotenv").config();

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const bcrypt = require("bcryptjs");
const express = require("express");
const portalApp = require("../app");
const { pool, query } = require("../db/pool");
const { createReadingProgressRouter } = require("../routes/reading-progress.routes");

const clientSource = fs.readFileSync(path.resolve(__dirname, "../../js/reading-progress.js"), "utf8");
const mainSource = fs.readFileSync(path.resolve(__dirname, "../../js/main.js"), "utf8");

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

async function request(baseUrl, pathname, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  return { response, body: await response.json() };
}

function percentage(page, total) {
  if (total <= 1) return 100;
  return Math.round(((page - 1) / (total - 1)) * 100);
}

function checkpoint(currentPage, furthestPage, totalPages, expectedRevision, reason = "progress") {
  return {
    current_page: currentPage,
    furthest_page: furthestPage,
    total_pages: totalPages,
    progress_percent: percentage(furthestPage, totalPages),
    expected_revision: expectedRevision,
    reason,
  };
}

function loadClient(fetchImplementation) {
  const window = { fetch: fetchImplementation };
  window.window = window;
  const context = vm.createContext({
    Date,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    String,
    clearTimeout,
    fetch: fetchImplementation,
    setTimeout,
    window,
  });
  vm.runInContext(clientSource, context, { filename: "js/reading-progress.js" });
  return window.PSEU_READING_PROGRESS;
}

test("Pacote 6 sincroniza progresso do reader sem enfraquecer acesso", async (t) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
  const password = `Local-${suffix}-9!`;
  const passwordHash = await bcrypt.hash(password, 4);
  const emails = {
    a: `package6-a-${suffix}@example.invalid`,
    b: `package6-b-${suffix}@example.invalid`,
    c: `package6-c-${suffix}@example.invalid`,
  };
  let server;
  let baseUrl;
  let users;
  let cookies;
  let gumroadBaseline;

  async function login(email) {
    const result = await request(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(result.response.status, 200);
    return cookieFrom(result.response);
  }

  async function put(cookie, bookId, documentId, body) {
    return request(
      baseUrl,
      `/api/reading-progress/${encodeURIComponent(bookId)}/${encodeURIComponent(documentId)}`,
      { method: "PUT", cookie, body }
    );
  }

  async function cleanup() {
    if (!users) return;
    const ids = Object.values(users).map((user) => String(user.id));
    await query("DELETE FROM events WHERE user_id = ANY($1::bigint[])", [ids]);
    await query("DELETE FROM reading_progress WHERE user_id = ANY($1::bigint[])", [ids]);
    await query(`DELETE FROM "session" WHERE sess->>'email' = ANY($1::text[])`, [Object.values(emails)]);
    await query("DELETE FROM users WHERE id = ANY($1::bigint[])", [ids]);
  }

  try {
    gumroadBaseline = Number((await query("SELECT count(*)::int AS count FROM gumroad_sales")).rows[0].count);
    users = {};
    for (const [key, email] of Object.entries(emails)) {
      users[key] = (
        await query(
          `INSERT INTO users (email, password_hash, status)
           VALUES ($1, $2, 'active')
           RETURNING id, email`,
          [email, passwordHash]
        )
      ).rows[0];
    }
    await query(
      `INSERT INTO entitlements (user_id, book_id, status, source)
       VALUES ($1, 'manual-do-despertar', 'active', 'local-test'),
              ($2, 'manual-do-despertar', 'active', 'local-test')`,
      [users.a.id, users.b.id]
    );

    server = await listen(portalApp);
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    cookies = {
      a: await login(emails.a),
      b: await login(emails.b),
      c: await login(emails.c),
    };

    await t.test("01 Manual inicia sem progresso central", async () => {
      const result = await request(baseUrl, "/api/reading-progress", { cookie: cookies.a });
      assert.equal(result.response.status, 200);
      assert.deepEqual(result.body.progress, []);
    });

    await t.test("02 primeira abertura cria checkpoint do Manual", async () => {
      const result = await put(cookies.a, "manual-do-despertar", "manual", checkpoint(1, 1, 73, 0, "opened"));
      assert.equal(result.response.status, 200);
      assert.equal(result.body.progress.revision, 1);
      assert.equal(result.body.progress.status, "started");
    });

    await t.test("03 avanço persiste página e percentual no backend", async () => {
      const result = await put(cookies.a, "manual-do-despertar", "manual", checkpoint(5, 5, 73, 1));
      assert.equal(result.response.status, 200);
      assert.equal(result.body.progress.current_page, 5);
      assert.equal(result.body.progress.progress_percent, 6);
    });

    await t.test("04 GET restaura checkpoint atual", async () => {
      const result = await request(baseUrl, "/api/reading-progress", { cookie: cookies.a });
      assert.equal(result.body.progress.length, 1);
      assert.equal(result.body.progress[0].current_page, 5);
    });

    await t.test("05 retorno de página preserva furthest e percentual", async () => {
      const result = await put(cookies.a, "manual-do-despertar", "manual", checkpoint(2, 5, 73, 2));
      assert.equal(result.response.status, 200);
      assert.equal(result.body.progress.current_page, 2);
      assert.equal(result.body.progress.furthest_page, 5);
      assert.equal(result.body.progress.progress_percent, 6);
    });

    await t.test("06 revision obsoleta é recusada sem sobrescrever", async () => {
      const result = await put(cookies.a, "manual-do-despertar", "manual", checkpoint(3, 5, 73, 2));
      assert.equal(result.response.status, 409);
      assert.equal(result.body.error, "stale_progress_revision");
      assert.equal(result.body.current.revision, 3);
    });

    await t.test("07 retomada incrementa contador uma única vez por checkpoint", async () => {
      const result = await put(cookies.a, "manual-do-despertar", "manual", checkpoint(2, 5, 73, 3, "resumed"));
      assert.equal(result.response.status, 200);
      assert.equal(result.body.progress.resume_count, 1);
      assert.ok(result.body.progress.last_resumed_at);
    });

    await t.test("08 Caderno usa progresso independente com entitlement do Manual", async () => {
      const result = await put(
        cookies.a,
        "manual-do-despertar",
        "caderno-de-travessia",
        checkpoint(4, 4, 56, 0, "opened")
      );
      assert.equal(result.response.status, 200);
      assert.equal(result.body.progress.current_page, 4);
      assert.equal(result.body.progress.progress_percent, 5);
    });

    await t.test("09 avanço do Caderno não altera Manual", async () => {
      const result = await request(baseUrl, "/api/reading-progress", { cookie: cookies.a });
      const manual = result.body.progress.find((row) => row.document_id === "manual");
      const companion = result.body.progress.find((row) => row.document_id === "caderno-de-travessia");
      assert.equal(manual.current_page, 2);
      assert.equal(companion.current_page, 4);
    });

    await t.test("10 total de páginas protegido é validado", async () => {
      const result = await put(
        cookies.a,
        "manual-do-despertar",
        "caderno-de-travessia",
        checkpoint(4, 4, 55, 1)
      );
      assert.equal(result.response.status, 400);
      assert.equal(result.body.error, "invalid_document_page_count");
    });

    await t.test("11 conclusão chega a 100% e torna-se sticky", async () => {
      const completed = await put(cookies.a, "manual-do-despertar", "manual", checkpoint(73, 73, 73, 4));
      assert.equal(completed.response.status, 200);
      assert.equal(completed.body.progress.status, "completed");
      assert.equal(completed.body.progress.progress_percent, 100);
      const returned = await put(cookies.a, "manual-do-despertar", "manual", checkpoint(4, 73, 73, 5));
      assert.equal(returned.body.progress.status, "completed");
      assert.equal(returned.body.progress.progress_percent, 100);
      assert.equal(returned.body.progress.current_page, 4);
    });

    await t.test("12 evento de conclusão não duplica", async () => {
      const repeated = await put(cookies.a, "manual-do-despertar", "manual", checkpoint(73, 73, 73, 6, "completed"));
      assert.equal(repeated.response.status, 200);
      const count = await query(
        `SELECT count(*)::int AS count
         FROM events
         WHERE user_id = $1 AND book_id = 'manual-do-despertar'
           AND document_id = 'manual' AND event_name = 'book_completed'`,
        [users.a.id]
      );
      assert.equal(count.rows[0].count, 1);
    });

    await t.test("13 eventos mínimos são server-side e sem conteúdo pessoal", async () => {
      const result = await query(
        `SELECT event_name, source, properties
         FROM events WHERE user_id = $1 ORDER BY occurred_at`,
        [users.a.id]
      );
      const names = new Set(result.rows.map((row) => row.event_name));
      assert.ok(names.has("book_opened"));
      assert.ok(names.has("companion_opened"));
      assert.ok(names.has("reader_progress"));
      assert.ok(names.has("reading_resumed"));
      assert.ok(names.has("book_completed"));
      result.rows.forEach((row) => {
        assert.equal(row.source, "server");
        assert.equal(Object.hasOwn(row.properties, "annotation_text"), false);
      });
    });

    await t.test("14 usuário B não lê progresso de A", async () => {
      const own = await request(baseUrl, "/api/reading-progress", { cookie: cookies.b });
      assert.deepEqual(own.body.progress, []);
      const created = await put(cookies.b, "manual-do-despertar", "manual", checkpoint(2, 2, 73, 0));
      assert.equal(created.response.status, 200);
      const a = await request(baseUrl, "/api/reading-progress", { cookie: cookies.a });
      assert.equal(a.body.progress.some((row) => row.current_page === 2 && row.revision === 1), false);
    });

    await t.test("14b intervalo máximo gera histórico deduplicado", async () => {
      const first = await put(cookies.b, "manual-do-despertar", "manual", checkpoint(2, 2, 73, 1, "max-interval"));
      const second = await put(cookies.b, "manual-do-despertar", "manual", checkpoint(2, 2, 73, 2, "max-interval"));
      assert.equal(first.response.status, 200);
      assert.equal(second.response.status, 200);
      const result = await query(
        `SELECT count(*)::int AS count FROM events
         WHERE user_id = $1 AND event_name = 'reader_progress'`,
        [users.b.id]
      );
      assert.equal(result.rows[0].count, 1);
    });

    await t.test("15 cliente não escolhe user_id", async () => {
      const body = { ...checkpoint(4, 4, 56, 1), user_id: users.b.id };
      const result = await put(cookies.a, "manual-do-despertar", "caderno-de-travessia", body);
      assert.equal(result.response.status, 400);
      assert.equal(result.body.error, "unexpected_progress_fields");
    });

    await t.test("16 ausência de entitlement bloqueia leitura e escrita", async () => {
      const write = await put(cookies.c, "manual-do-despertar", "manual", checkpoint(1, 1, 73, 0));
      assert.equal(write.response.status, 403);
      const read = await request(baseUrl, "/api/reading-progress", { cookie: cookies.c });
      assert.deepEqual(read.body.progress, []);
    });

    await t.test("17 sessão é obrigatória", async () => {
      const get = await request(baseUrl, "/api/reading-progress");
      const putResult = await put(null, "manual-do-despertar", "manual", checkpoint(1, 1, 73, 0));
      assert.equal(get.response.status, 401);
      assert.equal(putResult.response.status, 401);
    });

    await t.test("18 falha de eventos não bloqueia resposta de progresso", async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.session = { userId: users.a.id };
        next();
      });
      const fakeProgress = {
        book_id: "manual-do-despertar",
        document_id: "manual",
        current_page: 1,
        furthest_page: 1,
        total_pages: 73,
        progress_percent: 0,
        status: "started",
        resume_count: 0,
        revision: 1,
      };
      app.use(
        "/",
        createReadingProgressRouter({
          hasBookAccess: async () => true,
          progressService: {
            listForUser: async () => [],
            updateCheckpoint: async () => ({
              progress: fakeProgress,
              previous: null,
              reason: "opened",
              transition: { resumed: false, newlyCompleted: false },
            }),
          },
          eventsService: { recordTransition: async () => { throw new Error("offline"); } },
        })
      );
      const isolated = await listen(app);
      const address = isolated.address();
      const originalWarn = console.warn;
      console.warn = () => {};
      try {
        const result = await request(
          `http://127.0.0.1:${address.port}`,
          "/manual-do-despertar/manual",
          { method: "PUT", body: checkpoint(1, 1, 73, 0, "opened") }
        );
        assert.equal(result.response.status, 200);
      } finally {
        console.warn = originalWarn;
        await close(isolated);
      }
    });

    await t.test("19 cliente mantém reader funcional quando backend cai", async () => {
      let errors = 0;
      const api = loadClient(async () => { throw new Error("offline"); });
      const result = await api.flush(
        { bookId: "manual-do-despertar", documentId: "manual", ...checkpoint(2, 2, 73, 0) },
        { onError: () => { errors += 1; } }
      );
      assert.equal(result, null);
      assert.equal(errors, 1);
    });

    await t.test("20 merge escolhe atividade mais recente e maior furthest", () => {
      const api = loadClient(async () => ({ ok: true, json: async () => ({ progress: [] }) }));
      const merged = api.merge(
        { page: 8, furthestPage: 12, updatedAt: Date.parse("2026-08-10T12:00:00Z"), serverRevision: 2 },
        {
          current_page: 6,
          furthest_page: 15,
          total_pages: 73,
          progress_percent: 19,
          revision: 3,
          last_activity_at: "2026-08-10T11:00:00Z",
        }
      );
      assert.equal(merged.page, 8);
      assert.equal(merged.furthestPage, 15);
      assert.equal(merged.serverRevision, 3);
    });

    await t.test("21 persistência local ocorre antes da fila remota", () => {
      const persistPosition = mainSource.indexOf("persistReaderDocumentState(book, state.activePage);");
      const localSavePosition = mainSource.indexOf("saveState();", persistPosition);
      const remoteQueuePosition = mainSource.indexOf('queueCentralReadingCheckpoint(book, "progress")', persistPosition);
      assert.ok(persistPosition >= 0);
      assert.ok(localSavePosition > persistPosition);
      assert.ok(remoteQueuePosition > localSavePosition);
    });

    await t.test("22 anotações não são sincronizadas", () => {
      assert.equal(clientSource.includes("annotation"), false);
      assert.equal(mainSource.includes("annotation_text"), false);
    });

    await t.test("23 nenhuma venda Gumroad foi criada ou alterada", async () => {
      const count = Number((await query("SELECT count(*)::int AS count FROM gumroad_sales")).rows[0].count);
      assert.equal(count, gumroadBaseline);
    });

    await t.test("24 checkpoint pendente herda a revisão confirmada", async () => {
      const calls = [];
      let releaseFirst;
      const firstResponse = new Promise((resolve) => { releaseFirst = resolve; });
      const api = loadClient(async (_pathname, options) => {
        calls.push(JSON.parse(options.body));
        if (calls.length === 1) return firstResponse;
        return {
          ok: true,
          status: 200,
          json: async () => ({ progress: { revision: 2 } }),
        };
      });
      const base = { bookId: "manual-do-despertar", documentId: "manual" };
      const first = api.flush({ ...base, ...checkpoint(1, 1, 73, 0, "opened") });
      api.flush({ ...base, ...checkpoint(3, 3, 73, 0) });
      releaseFirst({
        ok: true,
        status: 200,
        json: async () => ({ progress: { revision: 1 } }),
      });
      await first;
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(calls.length, 2);
      assert.equal(calls[1].expected_revision, 1);
    });
  } finally {
    if (server) await close(server);
    await cleanup();
    const residual = users
      ? Number((await query("SELECT count(*)::int AS count FROM reading_progress WHERE user_id = ANY($1::bigint[])", [Object.values(users).map((user) => String(user.id))])).rows[0].count)
      : 0;
    assert.equal(residual, 0);
    await pool.end();
  }
});
