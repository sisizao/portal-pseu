const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_PROPERTIES_BYTES = 8 * 1024;
const MAX_SESSION_PAYLOAD_BYTES = 2 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const DEDUPE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_./-]*$/;

const CLIENT_OWNED_FIELDS = new Set([
  "event_id",
  "session_id",
  "event_name",
  "event_version",
  "occurred_at",
  "section_id",
  "book_id",
  "document_id",
  "correlation_id",
  "dedupe_key",
  "properties",
]);

const SERVER_OWNED_FIELDS = new Set(["user_id", "source", "received_at"]);
const SESSION_FIELDS = new Set([
  "session_id",
  "anonymous_id",
  "entry_path",
  "entry_source",
  "device_class",
  "consent_state",
]);
const ENTRY_SOURCES = [
  "direct",
  "bio",
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
  "google",
  "organic",
  "referral",
  "other",
];
const DEVICE_CLASSES = ["mobile", "tablet", "desktop"];
const CONSENT_STATES = ["not_configured", "granted", "denied"];
const SENSITIVE_KEYS = new Set([
  "email",
  "e_mail",
  "password",
  "senha",
  "token",
  "cookie",
  "secret",
  "ip",
  "ip_address",
  "user_agent",
  "fingerprint",
  "annotation_text",
  "note_text",
  "annotation_content",
  "note_content",
  "page_content",
  "form_payload",
  "gumroad_payload",
]);

function identifier({ required = false, maxLength = 160 } = {}) {
  return { type: "identifier", required, maxLength };
}

function integer({ required = false, min = 0, max = Number.MAX_SAFE_INTEGER, values } = {}) {
  return { type: "integer", required, min, max, values };
}

function enumString(values, { required = false } = {}) {
  return { type: "enum", required, values };
}

const EVENT_CATALOG = Object.freeze({
  funnel_started: {
    version: 1,
    properties: {
      funnel_id: identifier({ maxLength: 80 }),
      entry_point: identifier({ maxLength: 80 }),
    },
  },
  section_viewed: {
    version: 1,
    requiredFields: ["section_id"],
    properties: {
      section_index: integer({ min: 0, max: 500 }),
    },
  },
  vsl_started: {
    version: 1,
    properties: {
      vsl_id: identifier({ required: true, maxLength: 80 }),
    },
  },
  vsl_progress: {
    version: 1,
    properties: {
      vsl_id: identifier({ required: true, maxLength: 80 }),
      milestone: integer({ required: true, values: [25, 50, 75, 100] }),
    },
  },
  cta_clicked: {
    version: 1,
    properties: {
      cta_id: identifier({ required: true, maxLength: 80 }),
      destination: enumString(["checkout", "portal", "section", "external"]),
    },
  },
  checkout_started: {
    version: 1,
    properties: {
      offer_id: identifier({ required: true, maxLength: 80 }),
      provider: enumString(["gumroad"], { required: true }),
    },
  },
  purchase_processed: {
    version: 1,
    serverOnly: true,
    properties: {
      provider: enumString(["gumroad"], { required: true }),
    },
  },
  entitlement_granted: {
    version: 1,
    serverOnly: true,
    requiredFields: ["book_id"],
    properties: {},
  },
  portal_opened: { version: 1, properties: {} },
  library_opened: { version: 1, properties: {} },
  book_opened: {
    version: 1,
    requiredFields: ["book_id"],
    properties: {},
  },
  reader_progress: {
    version: 1,
    requiredFields: ["book_id", "document_id"],
    properties: {
      current_page: integer({ required: true, min: 1, max: 100000 }),
      total_pages: integer({ required: true, min: 1, max: 100000 }),
      progress_percent: integer({ required: true, min: 0, max: 100 }),
    },
  },
  reading_resumed: {
    version: 1,
    requiredFields: ["book_id", "document_id"],
    properties: {
      current_page: integer({ required: true, min: 1, max: 100000 }),
      progress_percent: integer({ required: true, min: 0, max: 100 }),
    },
  },
  book_completed: {
    version: 1,
    requiredFields: ["book_id", "document_id"],
    properties: {
      total_pages: integer({ min: 1, max: 100000 }),
    },
  },
  companion_opened: {
    version: 1,
    requiredFields: ["book_id", "document_id"],
    properties: {},
  },
  annotation_created: {
    version: 1,
    requiredFields: ["book_id", "document_id"],
    properties: {
      page_number: integer({ min: 1, max: 100000 }),
    },
  },
  bookmark_created: {
    version: 1,
    requiredFields: ["book_id", "document_id"],
    properties: {
      page_number: integer({ min: 1, max: 100000 }),
    },
  },
});

class TelemetryValidationError extends Error {
  constructor(code, status = 400, field = null) {
    super(code);
    this.name = "TelemetryValidationError";
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

function fail(code, status, field) {
  throw new TelemetryValidationError(code, status, field);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function byteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch (_error) {
    fail("payload_not_serializable", 400);
  }
  return 0;
}

function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function assertNoSensitiveKeys(value, path = "payload") {
  if (!value || typeof value !== "object") return;

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      fail("sensitive_field_forbidden", 400, `${path}.${key}`);
    }
    if (nestedValue && typeof nestedValue === "object") {
      assertNoSensitiveKeys(nestedValue, `${path}.${key}`);
    }
  }
}

function normalizeUuid(value, field, { required = false } = {}) {
  if (value == null || value === "") {
    if (required) fail("required_field_missing", 400, field);
    return null;
  }
  if (typeof value !== "string") fail("invalid_uuid", 400, field);
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) fail("invalid_uuid", 400, field);
  return normalized;
}

function normalizeIdentifier(value, field, { required = false, maxLength = 160 } = {}) {
  if (value == null || value === "") {
    if (required) fail("required_field_missing", 400, field);
    return null;
  }
  if (typeof value !== "string") fail("invalid_identifier", 400, field);
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > maxLength || !IDENTIFIER_PATTERN.test(normalized)) {
    fail("invalid_identifier", 400, field);
  }
  return normalized;
}

function normalizeDedupeKey(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") fail("invalid_dedupe_key", 400, "dedupe_key");
  const normalized = value.trim();
  if (!normalized || normalized.length > 255 || !DEDUPE_KEY_PATTERN.test(normalized)) {
    fail("invalid_dedupe_key", 400, "dedupe_key");
  }
  return normalized;
}

function normalizeEntryPath(value) {
  if (typeof value !== "string") fail("invalid_entry_path", 400, "entry_path");
  const normalized = value.trim().split(/[?#]/, 1)[0];
  if (
    !normalized ||
    normalized.length > 512 ||
    !normalized.startsWith("/") ||
    normalized.startsWith("//")
  ) {
    fail("invalid_entry_path", 400, "entry_path");
  }
  return normalized;
}

function normalizeEnum(value, field, values) {
  if (typeof value !== "string") fail("invalid_field_value", 400, field);
  const normalized = value.trim().toLowerCase();
  if (!values.includes(normalized)) fail("invalid_field_value", 400, field);
  return normalized;
}

function normalizeTimestamp(value, now) {
  if (typeof value !== "string" || value.length > 64) {
    fail("invalid_occurred_at", 400, "occurred_at");
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail("invalid_occurred_at", 400, "occurred_at");

  const nowMs = now.getTime();
  if (timestamp > nowMs + MAX_CLOCK_SKEW_MS || timestamp < nowMs - MAX_EVENT_AGE_MS) {
    fail("occurred_at_out_of_range", 400, "occurred_at");
  }

  return new Date(timestamp).toISOString();
}

function normalizeProperty(value, specification, field) {
  if (value == null) {
    if (specification.required) fail("required_property_missing", 400, field);
    return undefined;
  }

  if (specification.type === "identifier") {
    return normalizeIdentifier(value, field, specification);
  }

  if (specification.type === "integer") {
    if (!Number.isSafeInteger(value)) fail("invalid_property_type", 400, field);
    if (specification.values && !specification.values.includes(value)) {
      fail("invalid_property_value", 400, field);
    }
    if (value < specification.min || value > specification.max) {
      fail("invalid_property_value", 400, field);
    }
    return value;
  }

  if (specification.type === "enum") {
    if (typeof value !== "string") fail("invalid_property_type", 400, field);
    const normalized = value.trim().toLowerCase();
    if (!specification.values.includes(normalized)) {
      fail("invalid_property_value", 400, field);
    }
    return normalized;
  }

  fail("invalid_contract_specification", 500, field);
  return undefined;
}

function normalizeProperties(rawProperties, definition) {
  const properties = rawProperties == null ? {} : rawProperties;
  if (!isPlainObject(properties)) fail("properties_must_be_object", 400, "properties");
  if (byteLength(properties) > MAX_PROPERTIES_BYTES) {
    fail("properties_too_large", 413, "properties");
  }

  const allowedProperties = definition.properties || {};
  for (const key of Object.keys(properties)) {
    if (!Object.prototype.hasOwnProperty.call(allowedProperties, key)) {
      fail("unknown_property", 400, `properties.${key}`);
    }
  }

  const normalized = {};
  for (const [key, specification] of Object.entries(allowedProperties)) {
    const value = normalizeProperty(properties[key], specification, `properties.${key}`);
    if (value !== undefined) normalized[key] = value;
  }

  return normalized;
}

function validateTelemetryEvent(payload, { source = "web", now = new Date() } = {}) {
  if (!isPlainObject(payload)) fail("payload_must_be_object", 400);
  if (byteLength(payload) > MAX_PAYLOAD_BYTES) fail("payload_too_large", 413);
  assertNoSensitiveKeys(payload);

  for (const key of Object.keys(payload)) {
    if (SERVER_OWNED_FIELDS.has(key)) fail("server_owned_field_forbidden", 400, key);
    if (!CLIENT_OWNED_FIELDS.has(key)) fail("unknown_field", 400, key);
  }

  const normalizedEventName = normalizeIdentifier(payload.event_name, "event_name", {
    required: true,
    maxLength: 80,
  });
  const definition = EVENT_CATALOG[normalizedEventName];
  if (!definition) fail("unknown_event", 400, "event_name");
  if (definition.serverOnly && source !== "server") {
    fail("server_event_forbidden", 403, "event_name");
  }
  if (!Number.isSafeInteger(payload.event_version) || payload.event_version !== definition.version) {
    fail("unsupported_event_version", 400, "event_version");
  }

  for (const requiredField of definition.requiredFields || []) {
    if (payload[requiredField] == null || payload[requiredField] === "") {
      fail("required_field_missing", 400, requiredField);
    }
  }

  const properties = normalizeProperties(payload.properties, definition);
  if (
    normalizedEventName === "reader_progress" &&
    properties.current_page > properties.total_pages
  ) {
    fail("invalid_reader_progress", 400, "properties.current_page");
  }

  return Object.freeze({
    id: normalizeUuid(payload.event_id, "event_id", { required: true }),
    sessionId: normalizeUuid(payload.session_id, "session_id", { required: true }),
    eventName: normalizedEventName,
    eventVersion: payload.event_version,
    source,
    occurredAt: normalizeTimestamp(payload.occurred_at, now),
    sectionId: normalizeIdentifier(payload.section_id, "section_id"),
    bookId: normalizeIdentifier(payload.book_id, "book_id"),
    documentId: normalizeIdentifier(payload.document_id, "document_id"),
    correlationId: normalizeUuid(payload.correlation_id, "correlation_id"),
    dedupeKey: normalizeDedupeKey(payload.dedupe_key),
    properties: Object.freeze(properties),
  });
}

function validateBehavioralSession(payload) {
  if (!isPlainObject(payload)) fail("payload_must_be_object", 400);
  if (byteLength(payload) > MAX_SESSION_PAYLOAD_BYTES) fail("payload_too_large", 413);
  assertNoSensitiveKeys(payload);

  for (const key of Object.keys(payload)) {
    if (SERVER_OWNED_FIELDS.has(key)) fail("server_owned_field_forbidden", 400, key);
    if (!SESSION_FIELDS.has(key)) fail("unknown_field", 400, key);
  }

  return Object.freeze({
    id: normalizeUuid(payload.session_id, "session_id", { required: true }),
    anonymousId: normalizeUuid(payload.anonymous_id, "anonymous_id", { required: true }),
    entryPath: normalizeEntryPath(payload.entry_path),
    entrySource: normalizeEnum(payload.entry_source, "entry_source", ENTRY_SOURCES),
    deviceClass: normalizeEnum(payload.device_class, "device_class", DEVICE_CLASSES),
    consentState: normalizeEnum(payload.consent_state, "consent_state", CONSENT_STATES),
  });
}

module.exports = {
  CONSENT_STATES,
  DEVICE_CLASSES,
  ENTRY_SOURCES,
  EVENT_CATALOG,
  MAX_PAYLOAD_BYTES,
  MAX_PROPERTIES_BYTES,
  MAX_SESSION_PAYLOAD_BYTES,
  TelemetryValidationError,
  validateBehavioralSession,
  validateTelemetryEvent,
};
