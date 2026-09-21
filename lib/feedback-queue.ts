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

/** A nullable field must be present and null — an absent one is a broken record. */
function isNullableString(value: unknown): boolean {
  return typeof value === "string" || value === null;
}

/**
 * Every field the server requires, checked here.
 *
 * A record that passes this guard but fails the server schema can never be
 * sent, and until `flushQueue` learned to discard such a note it blocked every
 * note behind it — so the guard mirrors the schema field for field rather than
 * spot-checking a few.
 */
function isQueuedNote(value: unknown): value is QueuedFeedbackNote {
  if (typeof value !== "object" || value === null) return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.clientKey === "string" &&
    typeof note.body === "string" &&
    typeof note.route === "string" &&
    typeof note.pageLabel === "string" &&
    typeof note.authoredAt === "string" &&
    isNullableString(note.tripId) &&
    isNullableString(note.tripName) &&
    isNullableString(note.viewport) &&
    isNullableString(note.userAgent)
  );
}

function write(queue: QueuedFeedbackNote[]): QueuedFeedbackNote[] {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    return queue;
  } catch {
    // Storage full or blocked (private mode). Return what is actually persisted
    // so the caller knows the write failed and can detect it by checking for their key.
    return readQueue();
  }
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
 * What became of one attempt to send a queued note.
 *
 * The distinction matters because the queue is drained in order: a `transient`
 * result must stop the flush and keep the note, while a `rejected` one must
 * discard it. Retrying a note the server will never accept wedges the queue
 * forever and silently strands every note written after it.
 */
export type SendOutcome = "sent" | "transient" | "rejected";

export type FlushResult = {
  sent: number;
  /** Notes the server refused outright. The caller must tell the user. */
  discarded: QueuedFeedbackNote[];
  remaining: number;
};

/**
 * Send queued notes oldest-first, stopping at the first transient failure so
 * ordering is preserved and a dead connection isn't hammered. A throw is
 * transient — the note stays queued. A `rejected` note is dropped and the
 * flush continues, so one unsendable note cannot block the rest; the discarded
 * notes come back in the result because losing what someone wrote must never
 * be silent.
 */
export async function flushQueue(
  send: (note: QueuedFeedbackNote) => Promise<SendOutcome>,
): Promise<FlushResult> {
  let sent = 0;
  const discarded: QueuedFeedbackNote[] = [];
  for (const note of readQueue()) {
    let outcome: SendOutcome;
    try {
      outcome = await send(note);
    } catch {
      outcome = "transient";
    }
    if (outcome === "transient") break;

    // `write` returns what is ACTUALLY persisted: on a storage failure
    // (quota, private mode) it silently returns the unchanged queue. The
    // send already produced a final verdict at this point — the server
    // accepted or refused the note, and a local storage failure changes
    // neither — so an unpersisted removal must NOT gate the notes behind
    // this one the way a genuinely `transient` failure does. Breaking here
    // would strand every later note for as long as storage stays blocked
    // (private-mode Safari, a permanently full quota), which is worse than
    // the bug this guarded against: `sent` and `discarded` would both stay
    // empty forever, so the caller's toast wouldn't even fire. What an
    // unpersisted removal DOES mean is that this note's own fate can't be
    // reported as final — announcing a discard that didn't actually happen
    // locally would repeat every flush (FN-07) — so only record sent/
    // discarded when the removal actually landed; keep going either way.
    const after = removeFromQueue(note.clientKey);
    const removed = !after.some((q) => q.clientKey === note.clientKey);

    if (outcome === "rejected") {
      if (removed) discarded.push(note);
    } else if (removed) {
      sent++;
    }
  }
  return { sent, discarded, remaining: readQueue().length };
}

/** A one-off key for a note, stable across retries. */
export function newClientKey(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `fk_${random}`;
}
