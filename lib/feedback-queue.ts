/**
 * The offline queue for Feedback notes (ADR 0041).
 *
 * This is the app's only offline write. It is safe precisely because a
 * Feedback note is append-only and conflict-free — do NOT read it as a
 * precedent for queueing edits to shared plan state, which ADR 0016 still
 * declines to build.
 *
 * The clientKey is generated once when the note is written and reused on every
 * retry; the server upserts on it, so a replayed flush cannot duplicate.
 */

export type QueuedFeedbackNote = {
  clientKey: string;
  body: string;
  route: string;
  pageLabel: string;
  tripId: string | null;
  tripName: string | null;
  viewport: string | null;
  userAgent: string | null;
  authoredAt: string;
};

const STORAGE_KEY = "teepee.feedback.queue.v1";

/** Keeps a wedged queue from growing without bound on a device that stays offline. */
const MAX_QUEUED = 50;

function isQueuedNote(value: unknown): value is QueuedFeedbackNote {
  if (typeof value !== "object" || value === null) return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.clientKey === "string" &&
    typeof note.body === "string" &&
    typeof note.route === "string" &&
    typeof note.authoredAt === "string"
  );
}

function write(queue: QueuedFeedbackNote[]): QueuedFeedbackNote[] {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or blocked (private mode). The note is lost either way;
    // failing silently keeps the panel usable.
  }
  return queue;
}

/** The queued notes, oldest first. Corrupt or foreign storage reads as empty. */
export function readQueue(): QueuedFeedbackNote[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedNote);
  } catch {
    return [];
  }
}

/** Append a note, ignoring a clientKey already queued. Returns the new queue. */
export function enqueue(note: QueuedFeedbackNote): QueuedFeedbackNote[] {
  const queue = readQueue();
  if (queue.some((q) => q.clientKey === note.clientKey)) return queue;
  return write([...queue, note].slice(-MAX_QUEUED));
}

/** Drop a note by clientKey. Returns the new queue. */
export function removeFromQueue(clientKey: string): QueuedFeedbackNote[] {
  return write(readQueue().filter((q) => q.clientKey !== clientKey));
}

/**
 * Send queued notes oldest-first, stopping at the first failure so ordering is
 * preserved and a dead connection isn't hammered. `send` resolves true when the
 * note landed; a throw counts as a failure and the note stays queued.
 */
export async function flushQueue(
  send: (note: QueuedFeedbackNote) => Promise<boolean>,
): Promise<{ sent: number; remaining: number }> {
  let sent = 0;
  for (const note of readQueue()) {
    let landed = false;
    try {
      landed = await send(note);
    } catch {
      landed = false;
    }
    if (!landed) break;
    removeFromQueue(note.clientKey);
    sent++;
  }
  return { sent, remaining: readQueue().length };
}

/** A one-off key for a note, stable across retries. */
export function newClientKey(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `fk_${random}`;
}
