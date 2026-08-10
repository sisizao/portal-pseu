(function setupCentralReadingProgress(global) {
  "use strict";

  const DEBOUNCE_MS = 12000;
  const MAX_CHECKPOINT_INTERVAL_MS = 60000;
  const entries = new Map();
  const lastSentAt = new Map();
  const knownRevisions = new Map();

  function keyFor(checkpoint) {
    return `${checkpoint.bookId}:${checkpoint.documentId}`;
  }

  async function parseResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload;
    const error = new Error(payload.error || `reading_progress_http_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  async function fetchAll() {
    const response = await fetch("/api/reading-progress", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await parseResponse(response);
    return Array.isArray(payload.progress) ? payload.progress : [];
  }

  async function sendCheckpoint(checkpoint, keepalive = false) {
    const { bookId, documentId, ...body } = checkpoint;
    const response = await fetch(
      `/api/reading-progress/${encodeURIComponent(bookId)}/${encodeURIComponent(documentId)}`,
      {
        method: "PUT",
        credentials: "same-origin",
        keepalive,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    return parseResponse(response);
  }

  function scheduleDelay(key) {
    const elapsed = Date.now() - Number(lastSentAt.get(key) || 0);
    const untilMaximum = Math.max(0, MAX_CHECKPOINT_INTERVAL_MS - elapsed);
    return Math.min(DEBOUNCE_MS, untilMaximum);
  }

  async function deliver(key, options = {}) {
    const entry = entries.get(key);
    if (!entry || !entry.pending) return null;
    if (entry.inFlight) {
      entry.deliverAfterFlight = true;
      return entry.inFlight;
    }

    clearTimeout(entry.timer);
    entry.timer = null;
    const checkpoint = {
      ...entry.pending,
      expected_revision: Math.max(
        Number(entry.pending.expected_revision || 0),
        Number(knownRevisions.get(key) || 0)
      ),
    };
    const handlers = entry.handlers || {};
    entry.pending = null;

    entry.inFlight = sendCheckpoint(checkpoint, Boolean(options.keepalive))
      .then((payload) => {
        lastSentAt.set(key, Date.now());
        knownRevisions.set(key, Number(payload.progress?.revision || knownRevisions.get(key) || 0));
        handlers.onSuccess?.(payload.progress || null);
        return payload.progress || null;
      })
      .catch((error) => {
        if (error.status === 409) {
          knownRevisions.set(key, Number(error.payload?.current?.revision || knownRevisions.get(key) || 0));
          handlers.onConflict?.(error.payload?.current || null);
          return null;
        }
        handlers.onError?.(error);
        return null;
      })
      .finally(() => {
        entry.inFlight = null;
        if (entry.pending || entry.deliverAfterFlight) {
          entry.deliverAfterFlight = false;
          const flushImmediately = entry.flushAfterFlight;
          const keepalive = entry.keepaliveAfterFlight;
          entry.flushAfterFlight = false;
          entry.keepaliveAfterFlight = false;
          entry.timer = setTimeout(
            () => deliver(key, { keepalive }),
            flushImmediately ? 0 : scheduleDelay(key)
          );
        }
      });

    return entry.inFlight;
  }

  function queue(checkpoint, handlers = {}) {
    const key = keyFor(checkpoint);
    const entry = entries.get(key) || {};
    clearTimeout(entry.timer);
    entry.pending = checkpoint;
    entry.handlers = handlers;
    entry.timer = setTimeout(() => deliver(key), scheduleDelay(key));
    entries.set(key, entry);
  }

  function flush(checkpoint, handlers = {}, options = {}) {
    const key = keyFor(checkpoint);
    const entry = entries.get(key) || {};
    clearTimeout(entry.timer);
    entry.pending = checkpoint;
    entry.handlers = handlers;
    if (entry.inFlight) {
      entry.flushAfterFlight = true;
      entry.keepaliveAfterFlight = Boolean(options.keepalive);
    }
    entries.set(key, entry);
    return deliver(key, options);
  }

  function calculatePercent(furthestPage, totalPages) {
    if (totalPages <= 1) return 100;
    return Math.max(0, Math.min(100, Math.round(((furthestPage - 1) / (totalPages - 1)) * 100)));
  }

  function merge(local = {}, remote = {}) {
    const totalPages = Math.max(1, Number(remote.total_pages || local.totalPages || 1));
    const localPage = Math.max(1, Number(local.page || 1));
    const remotePage = Math.max(1, Number(remote.current_page || 1));
    const localActivity = Number(local.updatedAt || 0);
    const remoteActivity = Date.parse(remote.last_activity_at || remote.updated_at || "") || 0;
    const localRevision = Number(local.serverRevision || 0);
    const remoteRevision = Number(remote.revision || 0);
    const remoteWinsPosition = remoteActivity > localActivity
      || (remoteActivity === localActivity && remoteRevision > localRevision);
    const furthestPage = Math.min(
      totalPages,
      Math.max(localPage, remotePage, Number(local.furthestPage || 1), Number(remote.furthest_page || 1))
    );
    const completedAt = local.completedAt || remote.completed_at || null;

    return {
      ...local,
      page: Math.min(furthestPage, remoteWinsPosition ? remotePage : localPage),
      furthestPage,
      totalPages,
      progress: completedAt ? 100 : calculatePercent(furthestPage, totalPages),
      status: completedAt ? "completed" : furthestPage > 1 ? "reading" : "started",
      updatedAt: Math.max(localActivity, remoteActivity),
      serverRevision: Math.max(localRevision, remoteRevision),
      remoteUpdatedAt: remote.updated_at || local.remoteUpdatedAt || null,
      lastResumedAt: remote.last_resumed_at || local.lastResumedAt || null,
      resumeCount: Math.max(Number(local.resumeCount || 0), Number(remote.resume_count || 0)),
      completedAt,
    };
  }

  global.PSEU_READING_PROGRESS = Object.freeze({
    DEBOUNCE_MS,
    MAX_CHECKPOINT_INTERVAL_MS,
    calculatePercent,
    fetchAll,
    flush,
    merge,
    queue,
  });
})(window);
