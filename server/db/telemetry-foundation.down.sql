-- Roll back only the Portal PSEU central telemetry foundation.
-- This intentionally removes telemetry data stored in the three new tables.

BEGIN;

DROP TABLE IF EXISTS reading_progress;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS behavioral_sessions;

COMMIT;
