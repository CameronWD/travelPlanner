/**
 * Pure Digest builder.
 *
 * A Digest is the once-a-day push TEEPEE sends a Traveller who has switched
 * it on — the single outward interruption the app allows itself (see
 * CONTEXT.md, ADR 0047). This module takes plain data describing what is
 * true for a Trip on a given day and returns the one push payload to send,
 * or `null` when there is nothing worth interrupting anyone for.
 *
 * PURE: no database access, no env vars, no network, no React, and no
 * `Date.now()` / `new Date()` — every temporal fact (today, "is it the
 * morning or evening slot", days-until figures) arrives as a parameter. The
 * dispatcher (a later task) depends on this purity to be deterministically
 * testable: given the same input, this module always produces the same
 * output.
 */
import type { TripPhase } from "@/lib/trip-phase";

export type DigestSlot = "MORNING" | "EVENING";

export interface DigestPaymentLine {
  id: string;
  label: string;
  amountLabel: string;
  daysUntil: number;
}

export interface DigestChecklistLine {
  id: string;
  text: string;
  daysUntil: number;
}

export interface DigestReminderLine {
  id: string;
  title: string;
}

export interface DigestTransportLine {
  id: string;
  mode: string;
  route: string;
  localTime: string | null;
}

export interface DigestStayLine {
  id: string;
  name: string;
  kind: "CHECK_IN" | "CHECK_OUT";
  localTime: string | null;
}

export interface DigestItemLine {
  id: string;
  title: string;
  localTime: string | null;
}

export interface DigestInput {
  tripId: string;
  slot: DigestSlot;
  /**
   * The Trip's phase on the digest's local date. Part of the input contract —
   * the title rule reads the schedule rather than the phase (see below), but
   * the dispatcher still computes it and consumers may key off it.
   */
  phase: TripPhase;
  payments: DigestPaymentLine[];
  checklist: DigestChecklistLine[];
  reminders: DigestReminderLine[];
  /** EVENING: tomorrow's plan. MORNING: today's. Empty outside "travelling". */
  schedule: {
    transports: DigestTransportLine[];
    stays: DigestStayLine[];
    items: DigestItemLine[];
  };
}

export interface DigestPayload {
  title: string;
  body: string;
  url: string;
}

export const DIGEST_MAX_LINES = 6;

/** At most this many Checklist lines, however many are overdue. */
const DIGEST_MAX_CHECKLIST_LINES = 2;

function formatPayment(line: DigestPaymentLine): string {
  return line.daysUntil === 0
    ? `${line.amountLabel} ${line.label} comes out today`
    : `${line.amountLabel} ${line.label} comes out in ${line.daysUntil} days`;
}

function formatChecklist(line: DigestChecklistLine): string {
  // A Checklist item persists until done and keeps reappearing while overdue
  // (CONTEXT.md **Checklist**), so `daysUntil` can be negative — and "due in -2
  // days" is not a sentence. Say it plainly instead.
  if (line.daysUntil < 0) {
    const days = -line.daysUntil;
    return `Checklist: ${line.text} — ${days} ${days === 1 ? "day" : "days"} overdue`;
  }
  return line.daysUntil === 0
    ? `Checklist: ${line.text} due today`
    : `Checklist: ${line.text} due in ${line.daysUntil} days`;
}

function formatReminder(line: DigestReminderLine): string {
  return line.title;
}

function formatTransport(line: DigestTransportLine): string {
  const routeWord = line.mode.toLowerCase();
  return line.localTime === null
    ? `${routeWord} ${line.route}`
    : `${line.localTime} ${routeWord} ${line.route}`;
}

function formatStay(line: DigestStayLine): string {
  if (line.kind === "CHECK_OUT") {
    return line.localTime === null
      ? `Check out of ${line.name}`
      : `Check out of ${line.name} by ${line.localTime}`;
  }
  return line.localTime === null
    ? `Check in at ${line.name}`
    : `Check in at ${line.name} from ${line.localTime}`;
}

function formatItem(line: DigestItemLine): string {
  return line.localTime === null ? line.title : `${line.localTime} ${line.title}`;
}

/**
 * Returns the content lines ordered by HOW COSTLY EACH ONE IS TO LOSE, not by
 * category — and, for MORNING, the schedule-only lines, since the morning slot
 * exists purely as travel-day insurance and must never repeat what the
 * previous evening's Digest already carried.
 *
 * The cap (DIGEST_MAX_LINES) always eats the tail, so the tail has to hold the
 * most repeatable content:
 *
 *   1. Schedule — tomorrow's plan, said once, and the reason the push is
 *      titled "Tomorrow". Six overdue checklist items used to push the
 *      outbound flight into "+1 more".
 *   2. Reminders — CONTEXT.md is explicit that a Reminder is "said once, the
 *      night before". Truncated, it is gone for good.
 *   3. Payments — urgent, but deliberately repeated on each of the three days
 *      before and on the day, so a truncated one returns tomorrow.
 *   4. Checklist — persists until done and reappears nightly, so it gives way
 *      first, and is capped besides.
 */
function collectLines(input: DigestInput): { lines: string[]; paymentLineCount: number } {
  const lines: string[] = [];
  let paymentLineCount = 0;

  for (const transport of input.schedule.transports) lines.push(formatTransport(transport));
  for (const stay of input.schedule.stays) lines.push(formatStay(stay));
  for (const item of input.schedule.items) lines.push(formatItem(item));

  if (input.slot === "EVENING") {
    for (const reminder of input.reminders) lines.push(formatReminder(reminder));
    for (const payment of input.payments) {
      lines.push(formatPayment(payment));
      paymentLineCount += 1;
    }
    for (const item of input.checklist.slice(0, DIGEST_MAX_CHECKLIST_LINES)) {
      lines.push(formatChecklist(item));
    }
  }

  return { lines, paymentLineCount };
}

export function buildDigest(input: DigestInput): DigestPayload | null {
  if (input.slot === "MORNING") {
    const hasDeparture = input.schedule.transports.length > 0;
    const hasCheckOut = input.schedule.stays.some((stay) => stay.kind === "CHECK_OUT");
    if (!hasDeparture && !hasCheckOut) return null;
  }

  const { lines, paymentLineCount } = collectLines(input);
  if (lines.length === 0) return null;

  const capped =
    lines.length > DIGEST_MAX_LINES
      ? [...lines.slice(0, DIGEST_MAX_LINES), `+${lines.length - DIGEST_MAX_LINES} more`]
      : lines;

  // "Tomorrow" is a promise about the *itinerary*, so it follows the schedule
  // rather than the phase. The night before departure the trip is still in
  // final-prep, yet that digest carries tomorrow's outbound flight — heading it
  // "Coming up" would bury the single most useful digest of the trip.
  const hasSchedule =
    input.schedule.transports.length > 0 ||
    input.schedule.stays.length > 0 ||
    input.schedule.items.length > 0;

  const title = input.slot === "MORNING" ? "Today" : hasSchedule ? "Tomorrow" : "Coming up";

  const isPaymentOnly = paymentLineCount > 0 && paymentLineCount === lines.length;
  const url = isPaymentOnly ? `/trips/${input.tripId}/budget` : `/trips/${input.tripId}`;

  return { title, body: capped.join("\n"), url };
}

/**
 * The payload a Settings "send me a test" press should deliver.
 *
 * Two jobs, and the second is why this exists at all:
 *
 * 1. **Never refuse.** A quiet day makes `buildDigest` return null, which is
 *    correct for the 8pm run — silence when there is nothing to say is the
 *    Digest's whole contract (CONTEXT.md **Digest**). But the test button is
 *    the probe for the push half (ADR 0047), and a probe that declines to fire
 *    on a quiet day answers a question nobody asked. The placeholder goes out
 *    instead.
 * 2. **Never impersonate the real thing.** A real digest is sent verbatim so
 *    the Traveller sees true content and true formatting on their lock screen,
 *    but titled `Test · Tomorrow` rather than `Tomorrow` — otherwise a test
 *    pressed at 3pm and the genuine digest at 8pm are indistinguishable, and
 *    the second one reads as a double-send.
 */
export function asTestDigest(
  digest: DigestPayload | null,
  tripId: string,
): DigestPayload {
  if (!digest) {
    return {
      title: "Test · TEEPEE",
      body: "Push is working. Your digest arrives in the evening when there's something to say.",
      // The settings page, because that is where the button was pressed and
      // where the explanation of a silent day already lives.
      url: `/trips/${tripId}/settings`,
    };
  }
  return { ...digest, title: `Test · ${digest.title}` };
}
