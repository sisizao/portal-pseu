const { randomUUID } = require("crypto");
const { query } = require("../db/pool");

function createEvent({ userId, bookId, documentId, eventName, dedupeKey, properties = {} }) {
  return {
    id: randomUUID(),
    userId,
    bookId,
    documentId,
    eventName,
    dedupeKey,
    properties,
  };
}

function createReadingProgressEventsService(dependencies = {}) {
  const runQuery = dependencies.query || query;

  async function recordTransition({ userId, bookId, documentId, progress, previous, reason, transition }) {
    const events = [];
    const keyBase = `reading:${userId}:${bookId}:${documentId}`;
    const opened = reason === "opened" || reason === "resumed";

    if (opened) {
      events.push(
        createEvent({
          userId,
          bookId,
          documentId,
          eventName: "book_opened",
          dedupeKey: `${keyBase}:opened:${progress.revision}`,
        })
      );
      if (documentId === "caderno-de-travessia") {
        events.push(
          createEvent({
            userId,
            bookId,
            documentId,
            eventName: "companion_opened",
            dedupeKey: `${keyBase}:companion:${progress.revision}`,
          })
        );
      }
    }

    if (transition.resumed) {
      events.push(
        createEvent({
          userId,
          bookId,
          documentId,
          eventName: "reading_resumed",
          dedupeKey: `${keyBase}:resumed:${progress.resume_count}`,
          properties: {
            current_page: progress.current_page,
            progress_percent: progress.progress_percent,
          },
        })
      );
    }

    const previousPercent = Number(previous?.progress_percent || 0);
    const previousMilestone = Math.floor(previousPercent / 5);
    const currentMilestone = Math.floor(progress.progress_percent / 5);
    const reachedMilestone = currentMilestone > previousMilestone && progress.progress_percent > 0;
    const reachedMaximumInterval = reason === "max-interval";
    if (reachedMilestone || reachedMaximumInterval) {
      const intervalBucket = Math.floor(Date.now() / (15 * 60 * 1000));
      events.push(
        createEvent({
          userId,
          bookId,
          documentId,
          eventName: "reader_progress",
          dedupeKey: reachedMilestone
            ? `${keyBase}:progress:${currentMilestone * 5}`
            : `${keyBase}:progress:interval:${intervalBucket}`,
          properties: {
            current_page: progress.current_page,
            total_pages: progress.total_pages,
            progress_percent: progress.progress_percent,
          },
        })
      );
    }

    if (transition.newlyCompleted) {
      events.push(
        createEvent({
          userId,
          bookId,
          documentId,
          eventName: "book_completed",
          dedupeKey: `${keyBase}:completed`,
          properties: { total_pages: progress.total_pages },
        })
      );
    }

    for (const event of events) {
      await runQuery(
        `INSERT INTO events (
           id, user_id, event_name, event_version, source, occurred_at,
           book_id, document_id, dedupe_key, properties
         )
         VALUES ($1, $2, $3, 1, 'server', NOW(), $4, $5, $6, $7::jsonb)
         ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
        [
          event.id,
          event.userId,
          event.eventName,
          event.bookId,
          event.documentId,
          event.dedupeKey,
          JSON.stringify(event.properties),
        ]
      );
    }

    return events.map((event) => event.eventName);
  }

  return { recordTransition };
}

module.exports = {
  createReadingProgressEventsService,
};
