-- Portal PSEU central telemetry foundation.
-- Apply once with psql using ON_ERROR_STOP. The transaction prevents partial setup.

BEGIN;

CREATE TABLE behavioral_sessions (
  id UUID PRIMARY KEY,
  anonymous_id UUID NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  linked_at TIMESTAMPTZ,
  entry_path TEXT,
  entry_source TEXT,
  device_class TEXT,
  consent_state TEXT,
  checkout_correlation_id UUID,
  CONSTRAINT behavioral_sessions_last_seen_check
    CHECK (last_seen_at >= started_at),
  CONSTRAINT behavioral_sessions_ended_at_check
    CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT behavioral_sessions_entry_path_size_check
    CHECK (entry_path IS NULL OR char_length(entry_path) <= 2048),
  CONSTRAINT behavioral_sessions_entry_source_size_check
    CHECK (entry_source IS NULL OR char_length(entry_source) <= 255),
  CONSTRAINT behavioral_sessions_device_class_size_check
    CHECK (device_class IS NULL OR char_length(device_class) <= 32),
  CONSTRAINT behavioral_sessions_consent_state_size_check
    CHECK (consent_state IS NULL OR char_length(consent_state) <= 32)
);

CREATE INDEX idx_behavioral_sessions_anonymous_started
  ON behavioral_sessions (anonymous_id, started_at DESC);

CREATE INDEX idx_behavioral_sessions_user_last_seen
  ON behavioral_sessions (user_id, last_seen_at DESC);

CREATE INDEX idx_behavioral_sessions_checkout_correlation
  ON behavioral_sessions (checkout_correlation_id)
  WHERE checkout_correlation_id IS NOT NULL;

CREATE TABLE events (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES behavioral_sessions(id) ON DELETE SET NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_version SMALLINT NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  section_id TEXT,
  book_id TEXT,
  document_id TEXT,
  correlation_id UUID,
  dedupe_key TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT events_event_name_check
    CHECK (char_length(event_name) BETWEEN 1 AND 100),
  CONSTRAINT events_event_version_check
    CHECK (event_version > 0),
  CONSTRAINT events_source_check
    CHECK (source IN ('web', 'server')),
  CONSTRAINT events_section_id_size_check
    CHECK (section_id IS NULL OR char_length(section_id) <= 100),
  CONSTRAINT events_book_id_size_check
    CHECK (book_id IS NULL OR char_length(book_id) <= 160),
  CONSTRAINT events_document_id_size_check
    CHECK (document_id IS NULL OR char_length(document_id) <= 160),
  CONSTRAINT events_dedupe_key_size_check
    CHECK (dedupe_key IS NULL OR char_length(dedupe_key) <= 255),
  CONSTRAINT events_properties_object_check
    CHECK (jsonb_typeof(properties) = 'object'),
  CONSTRAINT events_properties_size_check
    CHECK (octet_length(properties::text) <= 8192),
  CONSTRAINT events_properties_forbidden_keys_check
    CHECK (
      NOT (
        properties ?| ARRAY[
          'email',
          'e-mail',
          'password',
          'senha',
          'token',
          'cookie',
          'secret',
          'ip',
          'user_agent',
          'user-agent',
          'fingerprint',
          'annotation_text',
          'note_text',
          'form_payload',
          'gumroad_payload'
        ]
      )
    )
);

CREATE INDEX idx_events_name_occurred
  ON events (event_name, occurred_at DESC);

CREATE INDEX idx_events_session_occurred
  ON events (session_id, occurred_at);

CREATE INDEX idx_events_user_occurred
  ON events (user_id, occurred_at DESC);

CREATE INDEX idx_events_book_document_occurred
  ON events (book_id, document_id, occurred_at DESC);

CREATE UNIQUE INDEX idx_events_dedupe_key_unique
  ON events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX idx_events_correlation
  ON events (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE TABLE reading_progress (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  current_page INTEGER NOT NULL,
  furthest_page INTEGER NOT NULL,
  total_pages INTEGER NOT NULL,
  progress_percent SMALLINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  last_session_id UUID REFERENCES behavioral_sessions(id) ON DELETE SET NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_resumed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  resume_count INTEGER NOT NULL DEFAULT 0,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, book_id, document_id),
  CONSTRAINT reading_progress_book_id_size_check
    CHECK (char_length(book_id) BETWEEN 1 AND 160),
  CONSTRAINT reading_progress_document_id_size_check
    CHECK (char_length(document_id) BETWEEN 1 AND 160),
  CONSTRAINT reading_progress_pages_check
    CHECK (
      current_page > 0
      AND furthest_page >= current_page
      AND total_pages > 0
      AND furthest_page <= total_pages
    ),
  CONSTRAINT reading_progress_percent_check
    CHECK (progress_percent BETWEEN 0 AND 100),
  CONSTRAINT reading_progress_status_check
    CHECK (status IN ('started', 'reading', 'completed')),
  CONSTRAINT reading_progress_completion_check
    CHECK (
      (
        status = 'completed'
        AND completed_at IS NOT NULL
        AND progress_percent = 100
      )
      OR
      (
        status IN ('started', 'reading')
        AND completed_at IS NULL
      )
    ),
  CONSTRAINT reading_progress_resume_count_check
    CHECK (resume_count >= 0),
  CONSTRAINT reading_progress_revision_check
    CHECK (revision > 0)
);

CREATE INDEX idx_reading_progress_user_updated
  ON reading_progress (user_id, updated_at DESC);

CREATE INDEX idx_reading_progress_book_completed
  ON reading_progress (book_id, completed_at);

COMMIT;
