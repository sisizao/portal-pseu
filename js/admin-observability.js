(() => {
  "use strict";

  const API_BASE = "/api/admin/observability";
  const state = { view: "overview", loaded: new Set(), readingFilters: {}, userFilters: {} };
  const byId = (id) => document.getElementById(id);
  const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function setInitialPeriod() {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    byId("period-from").value = isoDate(from);
    byId("period-to").value = isoDate(to);
  }

  function periodParams() {
    return new URLSearchParams({
      from: byId("period-from").value,
      to: byId("period-to").value,
    });
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
      : "—";
  }

  function title(value) {
    return String(value || "—").replace(/_/g, " ");
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    node.className = "";
  }

  function message(node, text, kind = "empty") {
    clear(node);
    node.className = kind;
    node.textContent = text;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  function appendTable(container, columns, rows, { compact = false } = {}) {
    const wrap = element("div", null, "table-wrap");
    const table = element("table");
    if (compact) table.className = "compact-table";
    const headRow = element("tr");
    columns.forEach((column) => headRow.appendChild(element("th", column.label)));
    const thead = element("thead");
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = element("tbody");
    rows.forEach((row) => {
      const tr = element("tr");
      columns.forEach((column) => {
        const td = element("td");
        const content = column.render ? column.render(row) : row[column.key];
        if (content instanceof Node) td.appendChild(content);
        else td.textContent = content == null || content === "" ? "—" : String(content);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  async function fetchData(path, params) {
    const query = params && String(params) ? `?${params}` : "";
    const response = await fetch(`${API_BASE}${path}${query}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.error || `http_${response.status}`);
    return body.data;
  }

  function metricCard(label, value, detail) {
    const card = element("article", null, "metric");
    card.appendChild(element("span", label, "eyebrow"));
    card.appendChild(element("strong", value));
    card.appendChild(element("small", detail));
    return card;
  }

  async function loadOverview() {
    const target = byId("overview-content");
    message(target, "Consultando dados reais…", "loading");
    try {
      const data = await fetchData("/overview", periodParams());
      clear(target);
      target.className = "metrics";
      const labels = {
        anonymous_visitors: "Visitantes anônimos",
        behavioral_sessions: "Sessões comportamentais",
        linked_users: "Usuários vinculados",
        official_buyers: "Compradores · Gumroad",
        active_users: "Usuários ativos",
        active_readers: "Leitores ativos",
        completed_documents: "Documentos concluídos",
      };
      Object.entries(labels).forEach(([key, label]) => {
        target.appendChild(metricCard(label, data.metrics[key], data.definitions[key]));
      });
    } catch (error) {
      message(target, `Não foi possível consultar a visão geral: ${error.message}`, "error");
    }
  }

  async function loadFunnel() {
    const target = byId("funnel-content");
    message(target, "Consultando a travessia…", "loading");
    try {
      const data = await fetchData("/funnel", periodParams());
      clear(target);

      const start = element("article", null, "data-block");
      start.appendChild(element("h3", "Entrada no funil"));
      start.appendChild(element("p", `${data.funnel_started.sessions} sessão(ões) distinta(s) iniciou(aram) a travessia.`));
      target.appendChild(start);

      const sections = element("article", null, "data-block");
      sections.appendChild(element("h3", "Alcance por seção"));
      if (data.sections.length) {
        appendTable(sections, [
          { label: "Seção", key: "section_id" },
          { label: "Sessões", key: "sessions" },
          { label: "Não chegaram desde o início", key: "not_reached_from_start" },
          { label: "Abandono aproximado", render: (row) => `${row.approximate_abandonment_percent}%` },
        ], data.sections, { compact: true });
      } else sections.appendChild(element("p", "Nenhuma seção registrada no período."));
      target.appendChild(sections);

      const vsl = element("article", null, "data-block");
      vsl.appendChild(element("h3", "VSL por transmissão"));
      if (data.vsl.length) {
        appendTable(vsl, [
          { label: "VSL", key: "vsl_id" },
          { label: "Iniciou", key: "started" },
          { label: "25%", render: (row) => row.milestones[25] },
          { label: "50%", render: (row) => row.milestones[50] },
          { label: "75%", render: (row) => row.milestones[75] },
          { label: "100%", render: (row) => row.milestones[100] },
        ], data.vsl, { compact: true });
      } else vsl.appendChild(element("p", "Nenhum marco de VSL registrado no período."));
      target.appendChild(vsl);

      const ctas = element("article", null, "data-block");
      ctas.appendChild(element("h3", "CTAs e checkout"));
      const rows = [
        ...data.ctas.map((item) => ({ type: "CTA", id: item.cta_id, detail: item.destination, sessions: item.sessions })),
        ...data.checkout.map((item) => ({ type: "Checkout", id: item.offer_id, detail: item.provider, sessions: item.sessions })),
      ];
      if (rows.length) appendTable(ctas, [
        { label: "Tipo", key: "type" },
        { label: "Identificador", key: "id" },
        { label: "Destino/provedor", key: "detail" },
        { label: "Sessões", key: "sessions" },
      ], rows, { compact: true });
      else ctas.appendChild(element("p", "Nenhum CTA ou checkout registrado no período."));
      target.appendChild(ctas);
      target.appendChild(element("p", data.caveat, "caveat"));
    } catch (error) {
      message(target, `Não foi possível consultar o funil: ${error.message}`, "error");
    }
  }

  function filtersFromForm(form) {
    const params = periodParams();
    new FormData(form).forEach((value, key) => {
      const normalized = String(value).trim();
      if (normalized) params.set(key, normalized);
    });
    return params;
  }

  async function loadReading(form = byId("reading-filters")) {
    const target = byId("reading-content");
    message(target, "Consultando checkpoints…", "loading");
    try {
      const data = await fetchData("/reading", filtersFromForm(form));
      clear(target);
      if (!data.items.length) return message(target, "Nenhum progresso de leitura encontrado para os filtros.");
      appendTable(target, [
        { label: "Usuário", key: "user_id" },
        { label: "Livro / documento", render: (row) => `${row.book_id} / ${row.document_id}` },
        { label: "Página atual", render: (row) => `${row.current_page} / ${row.total_pages}` },
        { label: "Mais distante", key: "furthest_page" },
        { label: "%", render: (row) => `${row.progress_percent}%` },
        { label: "Status", key: "status" },
        { label: "Retomadas", key: "resume_count" },
        { label: "Última atividade", render: (row) => formatDate(row.last_activity_at) },
      ], data.items);
      target.appendChild(element("p", `${data.pagination.total} registro(s) encontrado(s).`, "caveat"));
    } catch (error) {
      message(target, `Não foi possível consultar a leitura: ${error.message}`, "error");
    }
  }

  async function loadUsers(form = byId("users-filters")) {
    const target = byId("users-content");
    message(target, "Consultando usuários…", "loading");
    try {
      const params = new URLSearchParams();
      new FormData(form).forEach((value, key) => {
        if (String(value).trim()) params.set(key, String(value).trim());
      });
      const data = await fetchData("/users", params);
      clear(target);
      if (!data.items.length) return message(target, "Nenhum usuário encontrado para os filtros.");
      appendTable(target, [
        { label: "ID interno", key: "id" },
        { label: "Status", key: "status" },
        { label: "Último login", render: (row) => formatDate(row.last_login_at) },
        { label: "Última atividade", render: (row) => formatDate(row.last_behavioral_activity_at) },
        { label: "Documentos", render: (row) => `${row.documents_started} iniciado(s) · ${row.documents_completed} concluído(s)` },
        { label: "Jornada", render: (row) => {
          const button = element("button", "Abrir", "button");
          button.type = "button";
          button.dataset.journeyUser = row.id;
          return button;
        } },
      ], data.items);
      target.appendChild(element("p", `${data.pagination.total} usuário(s) encontrado(s).`, "caveat"));
    } catch (error) {
      message(target, `Não foi possível consultar usuários: ${error.message}`, "error");
    }
  }

  async function loadJourney(userId) {
    const target = byId("journey-content");
    if (!userId) return message(target, "Selecione um usuário antes de consultar.");
    message(target, "Reconstruindo a jornada permitida…", "loading");
    try {
      const data = await fetchData(`/users/${encodeURIComponent(userId)}/journey`, periodParams());
      clear(target);
      const heading = element("article", null, "data-block");
      heading.appendChild(element("h3", `Usuário interno #${data.user.id}`));
      heading.appendChild(element("p", `Status: ${data.user.status} · último login: ${formatDate(data.user.last_login_at)}`));
      target.appendChild(heading);
      if (!data.timeline.length) {
        target.appendChild(element("div", "Nenhuma atividade encontrada no período.", "empty"));
      } else {
        const timeline = element("div", null, "timeline");
        data.timeline.forEach((item) => {
          const card = element("article");
          card.appendChild(element("time", formatDate(item.occurred_at)));
          card.appendChild(element("strong", title(item.type)));
          const context = [item.section_id, item.book_id, item.document_id].filter(Boolean).join(" · ");
          if (context) card.appendChild(element("small", context));
          if (Object.keys(item.details || {}).length) card.appendChild(element("small", JSON.stringify(item.details)));
          timeline.appendChild(card);
        });
        target.appendChild(timeline);
      }
      target.appendChild(element("p", data.privacy, "caveat"));
    } catch (error) {
      message(target, `Não foi possível consultar a jornada: ${error.message}`, "error");
    }
  }

  function selectView(view) {
    state.view = view;
    byId("global-period").hidden = view === "users";
    all("[data-view]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.view === view)));
    all("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== view; });
    if (view === "overview") loadOverview();
    if (view === "funnel") loadFunnel();
    if (view === "reading") loadReading();
    if (view === "users") loadUsers();
  }

  all("[data-view]").forEach((button) => button.addEventListener("click", () => selectView(button.dataset.view)));
  byId("apply-period").addEventListener("click", () => {
    if (state.view === "journey") {
      const userId = byId("journey-form").elements.user_id.value.trim();
      if (userId) loadJourney(userId);
      return;
    }
    selectView(state.view);
  });
  byId("reading-filters").addEventListener("submit", (event) => { event.preventDefault(); loadReading(event.currentTarget); });
  byId("users-filters").addEventListener("submit", (event) => { event.preventDefault(); loadUsers(event.currentTarget); });
  byId("journey-form").addEventListener("submit", (event) => {
    event.preventDefault();
    loadJourney(event.currentTarget.elements.user_id.value.trim());
  });
  byId("users-content").addEventListener("click", (event) => {
    const button = event.target.closest("[data-journey-user]");
    if (!button) return;
    byId("journey-form").elements.user_id.value = button.dataset.journeyUser;
    selectView("journey");
    loadJourney(button.dataset.journeyUser);
  });

  setInitialPeriod();
  loadOverview();
})();
