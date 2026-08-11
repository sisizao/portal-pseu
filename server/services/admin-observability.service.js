const { query } = require("../db/pool");

const DEFAULT_PERIOD_DAYS = 30;
const MAX_PERIOD_DAYS = 366;
const MAX_PAGE_SIZE = 100;
const MAX_JOURNEY_ITEMS = 200;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECTION_RANK = Object.freeze({
  "funil-chamado": 1,
  "funil-biblioteca": 2,
  "funil-travessia": 3,
});

class AdminObservabilityError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "AdminObservabilityError";
    this.code = code;
    this.status = status;
  }
}

function parseDate(value, fallback, { endOfDay = false } = {}) {
  if (!value) return fallback;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const normalized = dateOnly ? `${value}T00:00:00.000Z` : String(value);
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) {
    throw new AdminObservabilityError("invalid_period");
  }
  if (dateOnly && endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function parsePeriod(input = {}, now = new Date()) {
  const defaultTo = new Date(now);
  const defaultFrom = new Date(defaultTo.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const from = parseDate(input.from, defaultFrom);
  const to = parseDate(input.to, defaultTo, { endOfDay: true });
  const duration = to.getTime() - from.getTime();

  if (duration <= 0 || duration > MAX_PERIOD_DAYS * 24 * 60 * 60 * 1000) {
    throw new AdminObservabilityError("invalid_period");
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function parsePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new AdminObservabilityError("invalid_pagination");
  }
  return parsed;
}

function parsePagination(input = {}) {
  const page = parsePositiveInteger(input.page, 1, 1000000);
  const pageSize = parsePositiveInteger(input.page_size, 25, MAX_PAGE_SIZE);
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function parseUserId(value) {
  const normalized = String(value || "").trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new AdminObservabilityError("invalid_user_id");
  }
  return normalized;
}

function parseIdentifier(value, field) {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized.length > 160 || !IDENTIFIER_PATTERN.test(normalized)) {
    throw new AdminObservabilityError(`invalid_${field}`);
  }
  return normalized;
}

function parseStatus(value, allowed) {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new AdminObservabilityError("invalid_status");
  }
  return normalized;
}

function parseBooleanFilter(value, field) {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new AdminObservabilityError(`invalid_${field}`);
}

function parseSessionId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!SESSION_ID_PATTERN.test(normalized)) {
    throw new AdminObservabilityError("invalid_session_id");
  }
  return normalized;
}

function number(value) {
  return Number(value || 0);
}

function serializePage(rows, total, pagination) {
  return {
    items: rows,
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total: number(total),
      total_pages: Math.ceil(number(total) / pagination.pageSize),
    },
  };
}

const JOURNEY_PROPERTY_ALLOWLIST = Object.freeze({
  funnel_started: ["funnel_id", "entry_point"],
  section_viewed: ["section_index"],
  vsl_started: ["vsl_id"],
  vsl_progress: ["vsl_id", "milestone"],
  cta_clicked: ["cta_id", "destination"],
  checkout_started: ["offer_id", "provider"],
  purchase_processed: ["provider"],
  reader_progress: ["current_page", "total_pages", "progress_percent"],
  reading_resumed: ["current_page", "progress_percent"],
  book_completed: ["total_pages"],
  annotation_created: ["page_number"],
  bookmark_created: ["page_number"],
});

function safeJourneyProperties(eventName, properties) {
  const allowed = JOURNEY_PROPERTY_ALLOWLIST[eventName] || [];
  const source = properties && typeof properties === "object" ? properties : {};
  return Object.fromEntries(
    allowed
      .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
      .map((key) => [key, source[key]])
  );
}

function shortSessionId(value) {
  return String(value || "").replace(/-/g, "").slice(0, 8).toUpperCase();
}

function approximateDurationSeconds(startedAt, lastSeenAt) {
  const started = new Date(startedAt).getTime();
  const lastSeen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(lastSeen)) return 0;
  return Math.max(0, Math.round((lastSeen - started) / 1000));
}

function sessionStage({ funnelStarted, checkoutStarted, ctaClicked, vslStarted, highestVslMilestone, furthestSectionId }) {
  if (checkoutStarted) return { code: "checkout_started", label: "Checkout iniciado" };
  if (ctaClicked) return { code: "cta_clicked", label: "CTA acionado" };
  if (highestVslMilestone) {
    return { code: "vsl_progress", label: `VSL ${highestVslMilestone}%` };
  }
  if (vslStarted) return { code: "vsl_started", label: "VSL iniciada" };
  if (furthestSectionId) return { code: "section_viewed", label: `Seção: ${furthestSectionId}` };
  if (funnelStarted) return { code: "funnel_started", label: "Entrada no funil" };
  return { code: "session_created", label: "Sessão criada" };
}

function summarizeSessionEvents(rows = []) {
  let furthestSectionId = null;
  let furthestSectionRank = 0;
  let highestVslMilestone = 0;
  let funnelStarted = false;
  let vslStarted = false;
  let ctaClicked = false;
  let checkoutStarted = false;

  for (const row of rows) {
    if (row.event_name === "funnel_started") funnelStarted = true;
    if (row.event_name === "section_viewed") {
      const rank = SECTION_RANK[row.section_id] || 0;
      if (rank >= furthestSectionRank) {
        furthestSectionRank = rank;
        furthestSectionId = row.section_id || furthestSectionId;
      }
    }
    if (row.event_name === "vsl_started") vslStarted = true;
    if (row.event_name === "vsl_progress") {
      const milestone = number(row.properties?.milestone);
      if ([25, 50, 75, 100].includes(milestone)) {
        highestVslMilestone = Math.max(highestVslMilestone, milestone);
      }
    }
    if (row.event_name === "cta_clicked") ctaClicked = true;
    if (row.event_name === "checkout_started") checkoutStarted = true;
  }

  return {
    furthest_section_id: furthestSectionId,
    funnel_started: funnelStarted,
    vsl_started: vslStarted,
    highest_vsl_milestone: highestVslMilestone || null,
    cta_clicked: ctaClicked,
    checkout_started: checkoutStarted,
    stage: sessionStage({
      funnelStarted,
      checkoutStarted,
      ctaClicked,
      vslStarted,
      highestVslMilestone,
      furthestSectionId,
    }),
  };
}

function createAdminObservabilityService(dependencies = {}) {
  const runQuery = dependencies.query || query;

  async function overview(input = {}) {
    const period = parsePeriod(input);
    const result = await runQuery(
      `SELECT
         (SELECT count(DISTINCT anonymous_id)::int
            FROM behavioral_sessions
           WHERE started_at >= $1 AND started_at < $2) AS anonymous_visitors,
         (SELECT count(*)::int
            FROM behavioral_sessions
           WHERE started_at >= $1 AND started_at < $2) AS behavioral_sessions,
         (SELECT count(DISTINCT user_id)::int
            FROM behavioral_sessions
           WHERE user_id IS NOT NULL
             AND started_at >= $1 AND started_at < $2) AS linked_users,
         (SELECT count(DISTINCT lower(email))::int
            FROM gumroad_sales
           WHERE status = 'active'
             AND created_at >= $1 AND created_at < $2) AS official_buyers,
         (SELECT count(*)::int
            FROM users
           WHERE status = 'active'
             AND last_login_at >= $1 AND last_login_at < $2) AS active_users,
         (SELECT count(DISTINCT user_id)::int
            FROM reading_progress
           WHERE last_activity_at >= $1 AND last_activity_at < $2) AS active_readers,
         (SELECT count(*)::int
            FROM reading_progress
           WHERE completed_at >= $1 AND completed_at < $2) AS completed_documents`,
      [period.from, period.to]
    );
    const row = result.rows[0] || {};
    return {
      period,
      metrics: {
        anonymous_visitors: number(row.anonymous_visitors),
        behavioral_sessions: number(row.behavioral_sessions),
        linked_users: number(row.linked_users),
        official_buyers: number(row.official_buyers),
        active_users: number(row.active_users),
        active_readers: number(row.active_readers),
        completed_documents: number(row.completed_documents),
      },
      definitions: {
        anonymous_visitors: "IDs anonimos distintos com sessao iniciada no periodo.",
        behavioral_sessions: "Sessoes comportamentais iniciadas no periodo.",
        linked_users: "Usuarios internos vinculados a essas sessoes.",
        official_buyers: "Compradores distintos em vendas Gumroad ativas criadas no periodo.",
        active_users: "Usuarios ativos com login no periodo.",
        active_readers: "Usuarios com progresso de leitura atualizado no periodo.",
        completed_documents: "Documentos concluidos no periodo.",
      },
    };
  }

  async function funnel(input = {}) {
    const period = parsePeriod(input);
    const [summaryResult, sectionsResult, vslResult, ctaResult, checkoutResult] = await Promise.all([
      runQuery(
        `SELECT count(DISTINCT session_id)::int AS sessions
           FROM events
          WHERE event_name = 'funnel_started'
            AND occurred_at >= $1 AND occurred_at < $2`,
        [period.from, period.to]
      ),
      runQuery(
        `SELECT section_id, count(DISTINCT session_id)::int AS sessions
           FROM events
          WHERE event_name = 'section_viewed'
            AND section_id IS NOT NULL
            AND occurred_at >= $1 AND occurred_at < $2
          GROUP BY section_id
          ORDER BY min(occurred_at), section_id`,
        [period.from, period.to]
      ),
      runQuery(
        `SELECT properties->>'vsl_id' AS vsl_id,
                event_name,
                CASE WHEN event_name = 'vsl_progress'
                     THEN (properties->>'milestone')::int
                     ELSE 0 END AS milestone,
                count(DISTINCT session_id)::int AS sessions
           FROM events
          WHERE event_name IN ('vsl_started', 'vsl_progress')
            AND occurred_at >= $1 AND occurred_at < $2
          GROUP BY properties->>'vsl_id', event_name,
                   CASE WHEN event_name = 'vsl_progress'
                        THEN (properties->>'milestone')::int ELSE 0 END
          ORDER BY properties->>'vsl_id', milestone`,
        [period.from, period.to]
      ),
      runQuery(
        `SELECT properties->>'cta_id' AS cta_id,
                properties->>'destination' AS destination,
                count(DISTINCT session_id)::int AS sessions
           FROM events
          WHERE event_name = 'cta_clicked'
            AND occurred_at >= $1 AND occurred_at < $2
          GROUP BY properties->>'cta_id', properties->>'destination'
          ORDER BY sessions DESC, cta_id`,
        [period.from, period.to]
      ),
      runQuery(
        `SELECT properties->>'offer_id' AS offer_id,
                properties->>'provider' AS provider,
                count(DISTINCT session_id)::int AS sessions
           FROM events
          WHERE event_name = 'checkout_started'
            AND occurred_at >= $1 AND occurred_at < $2
          GROUP BY properties->>'offer_id', properties->>'provider'
          ORDER BY sessions DESC, offer_id`,
        [period.from, period.to]
      ),
    ]);

    const started = number(summaryResult.rows[0]?.sessions);
    const sections = sectionsResult.rows.map((row) => {
      const reached = number(row.sessions);
      const notReached = Math.max(started - reached, 0);
      return {
        section_id: row.section_id,
        sessions: reached,
        not_reached_from_start: notReached,
        approximate_abandonment_percent: started ? Math.round((notReached / started) * 100) : 0,
      };
    });

    const vslMap = new Map();
    for (const row of vslResult.rows) {
      const id = row.vsl_id || "unknown";
      if (!vslMap.has(id)) {
        vslMap.set(id, { vsl_id: id, started: 0, milestones: { 25: 0, 50: 0, 75: 0, 100: 0 } });
      }
      const item = vslMap.get(id);
      if (row.event_name === "vsl_started") item.started = number(row.sessions);
      if (row.event_name === "vsl_progress" && Object.prototype.hasOwnProperty.call(item.milestones, row.milestone)) {
        item.milestones[row.milestone] = number(row.sessions);
      }
    }

    return {
      period,
      funnel_started: { sessions: started },
      sections,
      vsl: Array.from(vslMap.values()),
      ctas: ctaResult.rows.map((row) => ({
        cta_id: row.cta_id || "unknown",
        destination: row.destination || null,
        sessions: number(row.sessions),
      })),
      checkout: checkoutResult.rows.map((row) => ({
        offer_id: row.offer_id || "unknown",
        provider: row.provider || null,
        sessions: number(row.sessions),
      })),
      caveat: "Checkout iniciado e compra oficial sao fontes separadas; este painel nao atribui conversao entre elas.",
    };
  }

  async function users(input = {}) {
    const pagination = parsePagination(input);
    const status = parseStatus(input.status, ["pending", "active", "suspended", "revoked"]);
    const params = [status, pagination.pageSize, pagination.offset];
    const where = "$1::text IS NULL OR u.status = $1";
    const [rowsResult, countResult] = await Promise.all([
      runQuery(
        `SELECT u.id::text AS id,
                u.status,
                u.last_login_at,
                activity.last_behavioral_activity_at,
                count(rp.*)::int AS documents_started,
                count(rp.*) FILTER (WHERE rp.status = 'completed')::int AS documents_completed
           FROM users u
           LEFT JOIN LATERAL (
             SELECT max(last_seen_at) AS last_behavioral_activity_at
               FROM behavioral_sessions bs
              WHERE bs.user_id = u.id
           ) activity ON true
           LEFT JOIN reading_progress rp ON rp.user_id = u.id
          WHERE ${where}
          GROUP BY u.id, u.status, u.last_login_at, activity.last_behavioral_activity_at
          ORDER BY GREATEST(
                     COALESCE(activity.last_behavioral_activity_at, '-infinity'::timestamptz),
                     COALESCE(u.last_login_at, '-infinity'::timestamptz)
                   ) DESC,
                   u.id DESC
          LIMIT $2 OFFSET $3`,
        params
      ),
      runQuery(`SELECT count(*)::int AS total FROM users u WHERE ${where}`, [status]),
    ]);

    return {
      filters: { status },
      ...serializePage(
        rowsResult.rows.map((row) => ({
          id: row.id,
          status: row.status,
          last_login_at: row.last_login_at,
          last_behavioral_activity_at: row.last_behavioral_activity_at,
          documents_started: number(row.documents_started),
          documents_completed: number(row.documents_completed),
        })),
        countResult.rows[0]?.total,
        pagination
      ),
    };
  }

  async function reading(input = {}) {
    const period = parsePeriod(input);
    const pagination = parsePagination(input);
    const userId = input.user_id ? parseUserId(input.user_id) : null;
    const bookId = parseIdentifier(input.book_id, "book_id");
    const documentId = parseIdentifier(input.document_id, "document_id");
    const status = parseStatus(input.status, ["started", "reading", "completed"]);
    const params = [
      period.from,
      period.to,
      userId,
      bookId,
      documentId,
      status,
      pagination.pageSize,
      pagination.offset,
    ];
    const where = `rp.last_activity_at >= $1 AND rp.last_activity_at < $2
      AND ($3::bigint IS NULL OR rp.user_id = $3)
      AND ($4::text IS NULL OR rp.book_id = $4)
      AND ($5::text IS NULL OR rp.document_id = $5)
      AND ($6::text IS NULL OR rp.status = $6)`;
    const [rowsResult, countResult] = await Promise.all([
      runQuery(
        `SELECT rp.user_id::text AS user_id,
                rp.book_id,
                rp.document_id,
                rp.current_page,
                rp.furthest_page,
                rp.total_pages,
                rp.progress_percent,
                rp.status,
                rp.last_activity_at,
                rp.last_resumed_at,
                rp.resume_count,
                rp.completed_at
           FROM reading_progress rp
          WHERE ${where}
          ORDER BY rp.last_activity_at DESC, rp.user_id DESC
          LIMIT $7 OFFSET $8`,
        params
      ),
      runQuery(`SELECT count(*)::int AS total FROM reading_progress rp WHERE ${where}`, params.slice(0, 6)),
    ]);

    return {
      period,
      filters: { user_id: userId, book_id: bookId, document_id: documentId, status },
      ...serializePage(
        rowsResult.rows.map((row) => ({
          user_id: row.user_id,
          book_id: row.book_id,
          document_id: row.document_id,
          current_page: number(row.current_page),
          furthest_page: number(row.furthest_page),
          total_pages: number(row.total_pages),
          progress_percent: number(row.progress_percent),
          status: row.status,
          last_activity_at: row.last_activity_at,
          last_resumed_at: row.last_resumed_at,
          resume_count: number(row.resume_count),
          completed_at: row.completed_at,
        })),
        countResult.rows[0]?.total,
        pagination
      ),
    };
  }

  async function sessions(input = {}) {
    const period = parsePeriod(input);
    const pagination = parsePagination(input);
    const linkStatus = parseStatus(input.status || "anonymous", ["anonymous", "linked", "all"]);
    const hasCheckout = parseBooleanFilter(input.has_checkout, "has_checkout");
    const hasVsl = parseBooleanFilter(input.has_vsl, "has_vsl");
    const hasCta = parseBooleanFilter(input.has_cta, "has_cta");
    const params = [
      period.from,
      period.to,
      linkStatus,
      hasCheckout,
      hasVsl,
      hasCta,
      pagination.pageSize,
      pagination.offset,
    ];

    const result = await runQuery(
      `WITH candidate_sessions AS (
         SELECT bs.id,
                bs.user_id,
                bs.started_at,
                bs.last_seen_at,
                bs.ended_at,
                bs.linked_at,
                bs.entry_path,
                bs.entry_source,
                bs.device_class
           FROM behavioral_sessions bs
          WHERE bs.last_seen_at >= $1
            AND bs.started_at < $2
            AND (
              $3::text = 'all'
              OR ($3::text = 'anonymous' AND bs.user_id IS NULL)
              OR ($3::text = 'linked' AND bs.user_id IS NOT NULL)
            )
       ), event_summary AS (
         SELECT e.session_id,
                count(*)::int AS event_count,
                max(e.occurred_at) AS last_event_at,
                (array_agg(e.event_name ORDER BY e.occurred_at DESC, e.received_at DESC))[1] AS last_event_name,
                bool_or(e.event_name = 'funnel_started') AS funnel_started,
                bool_or(e.event_name = 'vsl_started') AS vsl_started,
                max(
                  CASE
                    WHEN e.event_name = 'vsl_progress'
                      AND e.properties->>'milestone' IN ('25', '50', '75', '100')
                    THEN (e.properties->>'milestone')::int
                    ELSE NULL
                  END
                )::int AS highest_vsl_milestone,
                bool_or(e.event_name = 'cta_clicked') AS cta_clicked,
                bool_or(e.event_name = 'checkout_started') AS checkout_started,
                (array_agg(
                  e.section_id
                  ORDER BY CASE e.section_id
                    WHEN 'funil-travessia' THEN 3
                    WHEN 'funil-biblioteca' THEN 2
                    WHEN 'funil-chamado' THEN 1
                    ELSE 0
                  END DESC,
                  e.occurred_at DESC
                ) FILTER (WHERE e.event_name = 'section_viewed' AND e.section_id IS NOT NULL))[1] AS furthest_section_id
           FROM events e
           JOIN candidate_sessions cs ON cs.id = e.session_id
          GROUP BY e.session_id
       ), filtered_sessions AS (
         SELECT cs.*,
                COALESCE(es.event_count, 0)::int AS event_count,
                es.last_event_at,
                es.last_event_name,
                COALESCE(es.funnel_started, false) AS funnel_started,
                COALESCE(es.vsl_started, false) AS vsl_started,
                es.highest_vsl_milestone,
                COALESCE(es.cta_clicked, false) AS cta_clicked,
                COALESCE(es.checkout_started, false) AS checkout_started,
                es.furthest_section_id
           FROM candidate_sessions cs
           LEFT JOIN event_summary es ON es.session_id = cs.id
          WHERE ($4::boolean IS NULL OR COALESCE(es.checkout_started, false) = $4)
            AND ($5::boolean IS NULL OR COALESCE(es.vsl_started, false) = $5)
            AND ($6::boolean IS NULL OR COALESCE(es.cta_clicked, false) = $6)
       )
       SELECT fs.*,
              count(*) OVER()::int AS total_count,
              CASE
                WHEN fs.ended_at IS NULL AND fs.last_seen_at >= NOW() - INTERVAL '35 minutes'
                THEN 'active'
                ELSE 'inactive'
              END AS activity_status
         FROM filtered_sessions fs
        ORDER BY fs.last_seen_at DESC, fs.started_at DESC, fs.id DESC
        LIMIT $7 OFFSET $8`,
      params
    );

    const items = result.rows.map((row) => {
      const highestVslMilestone = row.highest_vsl_milestone == null
        ? null
        : number(row.highest_vsl_milestone);
      const stage = sessionStage({
        funnelStarted: row.funnel_started,
        checkoutStarted: row.checkout_started,
        ctaClicked: row.cta_clicked,
        vslStarted: row.vsl_started,
        highestVslMilestone,
        furthestSectionId: row.furthest_section_id,
      });
      return {
        session_id: String(row.id),
        session_label: shortSessionId(row.id),
        started_at: row.started_at,
        last_seen_at: row.last_seen_at,
        last_event_at: row.last_event_at,
        duration_seconds: approximateDurationSeconds(row.started_at, row.last_seen_at),
        event_count: number(row.event_count),
        last_event_name: row.last_event_name,
        furthest_section_id: row.furthest_section_id,
        stage,
        funnel_started: Boolean(row.funnel_started),
        vsl_started: Boolean(row.vsl_started),
        highest_vsl_milestone: highestVslMilestone,
        cta_clicked: Boolean(row.cta_clicked),
        checkout_started: Boolean(row.checkout_started),
        link_status: row.user_id == null ? "anonymous" : "linked",
        linked_at: row.linked_at,
        linked_user_id: row.user_id == null ? null : String(row.user_id),
        activity_status: row.activity_status,
        entry_path: row.entry_path,
        entry_source: row.entry_source,
        device_class: row.device_class,
      };
    });

    return {
      period,
      filters: {
        status: linkStatus,
        has_checkout: hasCheckout,
        has_vsl: hasVsl,
        has_cta: hasCta,
      },
      items,
      pagination: {
        page: pagination.page,
        page_size: pagination.pageSize,
        total: number(result.rows[0]?.total_count),
        total_pages: Math.ceil(number(result.rows[0]?.total_count) / pagination.pageSize),
      },
      privacy: "A lista usa apenas IDs pseudonimos de sessao e metadados comportamentais permitidos.",
      commercial_correlation_available: false,
    };
  }

  async function sessionDetail(sessionIdValue, input = {}) {
    const sessionId = parseSessionId(sessionIdValue);
    const period = parsePeriod(input);
    const limit = parsePositiveInteger(input.limit, 100, MAX_JOURNEY_ITEMS);
    const sessionResult = await runQuery(
      `SELECT id,
              user_id,
              started_at,
              last_seen_at,
              ended_at,
              linked_at,
              entry_path,
              entry_source,
              device_class
         FROM behavioral_sessions
        WHERE id = $1::uuid
        LIMIT 1`,
      [sessionId]
    );
    const session = sessionResult.rows[0];
    if (!session) throw new AdminObservabilityError("session_not_found", 404);

    const [eventsResult, countResult] = await Promise.all([
      runQuery(
        `SELECT id,
                event_name,
                source,
                occurred_at,
                received_at,
                section_id,
                book_id,
                document_id,
                properties
           FROM events
          WHERE session_id = $1::uuid
            AND occurred_at >= $2
            AND occurred_at < $3
          ORDER BY occurred_at ASC, received_at ASC
          LIMIT $4`,
        [sessionId, period.from, period.to, limit]
      ),
      runQuery(
        `SELECT count(*)::int AS total
           FROM events
          WHERE session_id = $1::uuid
            AND occurred_at >= $2
            AND occurred_at < $3`,
        [sessionId, period.from, period.to]
      ),
    ]);

    const summary = summarizeSessionEvents(eventsResult.rows);
    const timeline = [
      {
        type: "behavioral_session_started",
        occurred_at: session.started_at,
        details: {
          entry_path: session.entry_path,
          entry_source: session.entry_source,
          device_class: session.device_class,
        },
      },
      ...eventsResult.rows.map((event) => ({
        type: event.event_name,
        occurred_at: event.occurred_at,
        event_id: String(event.id),
        source: event.source,
        section_id: event.section_id,
        book_id: event.book_id,
        document_id: event.document_id,
        details: safeJourneyProperties(event.event_name, event.properties),
      })),
      ...(session.linked_at ? [{
        type: "behavioral_session_linked",
        occurred_at: session.linked_at,
        details: {},
      }] : []),
    ].sort((left, right) => new Date(left.occurred_at) - new Date(right.occurred_at));

    timeline.forEach((item, index) => {
      if (index === 0) item.delta_seconds = 0;
      else {
        item.delta_seconds = Math.max(0, Math.round(
          (new Date(item.occurred_at) - new Date(timeline[index - 1].occurred_at)) / 1000
        ));
      }
    });

    return {
      period,
      session: {
        session_id: String(session.id),
        session_label: shortSessionId(session.id),
        started_at: session.started_at,
        last_seen_at: session.last_seen_at,
        ended_at: session.ended_at,
        linked_at: session.linked_at,
        linked_user_id: session.user_id == null ? null : String(session.user_id),
        link_status: session.user_id == null ? "anonymous" : "linked",
        duration_seconds: approximateDurationSeconds(session.started_at, session.last_seen_at),
        entry_path: session.entry_path,
        entry_source: session.entry_source,
        device_class: session.device_class,
      },
      summary,
      timeline,
      timeline_total: number(countResult.rows[0]?.total) + 1 + (session.linked_at ? 1 : 0),
      timeline_truncated: number(countResult.rows[0]?.total) > eventsResult.rows.length,
      purchase_observation: summary.checkout_started ? "not_observed_in_behavioral_telemetry" : "not_applicable",
      purchase_copy: summary.checkout_started
        ? "Checkout iniciado. Compra não observada por esta telemetria comportamental."
        : "Nenhuma compra é inferida a partir desta sessão comportamental.",
      privacy: "O raio X exibe somente metadados permitidos; identidade, credenciais e payloads integrais nunca sao retornados.",
      commercial_correlation_available: false,
    };
  }

  async function journey(userIdValue, input = {}) {
    const userId = parseUserId(userIdValue);
    const period = parsePeriod(input);
    const limit = parsePositiveInteger(input.limit, 100, MAX_JOURNEY_ITEMS);
    const userResult = await runQuery(
      `SELECT id::text AS id, status, last_login_at
         FROM users
        WHERE id = $1`,
      [userId]
    );
    if (!userResult.rows[0]) {
      throw new AdminObservabilityError("user_not_found", 404);
    }

    const [sessionsResult, eventsResult, progressResult] = await Promise.all([
      runQuery(
        `SELECT id::text AS session_id,
                started_at,
                last_seen_at,
                linked_at,
                entry_path,
                entry_source,
                device_class
           FROM behavioral_sessions
          WHERE user_id = $1
            AND last_seen_at >= $2 AND started_at < $3
          ORDER BY started_at ASC`,
        [userId, period.from, period.to]
      ),
      runQuery(
        `SELECT e.id::text AS event_id,
                e.event_name,
                e.source,
                e.occurred_at,
                e.session_id::text AS session_id,
                e.section_id,
                e.book_id,
                e.document_id,
                e.properties
           FROM events e
           LEFT JOIN behavioral_sessions bs ON bs.id = e.session_id
          WHERE (e.user_id = $1 OR bs.user_id = $1)
            AND e.occurred_at >= $2 AND e.occurred_at < $3
          ORDER BY e.occurred_at ASC, e.received_at ASC
          LIMIT $4`,
        [userId, period.from, period.to, limit]
      ),
      runQuery(
        `SELECT book_id, document_id, current_page, furthest_page, total_pages,
                progress_percent, status, last_activity_at, last_resumed_at,
                resume_count, completed_at
           FROM reading_progress
          WHERE user_id = $1
            AND last_activity_at >= $2 AND last_activity_at < $3
          ORDER BY last_activity_at ASC`,
        [userId, period.from, period.to]
      ),
    ]);

    const timeline = [];
    for (const session of sessionsResult.rows) {
      timeline.push({
        type: "behavioral_session_started",
        occurred_at: session.started_at,
        session_id: session.session_id,
        details: {
          entry_path: session.entry_path,
          entry_source: session.entry_source,
          device_class: session.device_class,
        },
      });
      if (session.linked_at) {
        timeline.push({
          type: "behavioral_session_linked",
          occurred_at: session.linked_at,
          session_id: session.session_id,
          details: {},
        });
      }
    }
    for (const event of eventsResult.rows) {
      timeline.push({
        type: event.event_name,
        occurred_at: event.occurred_at,
        session_id: event.session_id,
        event_id: event.event_id,
        source: event.source,
        section_id: event.section_id,
        book_id: event.book_id,
        document_id: event.document_id,
        details: safeJourneyProperties(event.event_name, event.properties),
      });
    }
    for (const progress of progressResult.rows) {
      timeline.push({
        type: "reading_state",
        occurred_at: progress.last_activity_at,
        book_id: progress.book_id,
        document_id: progress.document_id,
        details: {
          current_page: number(progress.current_page),
          furthest_page: number(progress.furthest_page),
          total_pages: number(progress.total_pages),
          progress_percent: number(progress.progress_percent),
          status: progress.status,
          last_resumed_at: progress.last_resumed_at,
          resume_count: number(progress.resume_count),
          completed_at: progress.completed_at,
        },
      });
    }
    timeline.sort((left, right) => new Date(left.occurred_at) - new Date(right.occurred_at));

    return {
      period,
      user: userResult.rows[0],
      timeline: timeline.slice(0, limit),
      privacy: "A jornada exibe metadados permitidos; textos de anotacoes e credenciais nunca sao retornados.",
      commercial_correlation_available: false,
    };
  }

  return {
    overview,
    funnel,
    users,
    reading,
    sessions,
    sessionDetail,
    journey,
  };
}

module.exports = {
  AdminObservabilityError,
  createAdminObservabilityService,
  parseBooleanFilter,
  parsePagination,
  parsePeriod,
  parseSessionId,
  safeJourneyProperties,
  summarizeSessionEvents,
};
