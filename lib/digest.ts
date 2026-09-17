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

function formatPayment(line: DigestPaymentLine): string {
  return line.daysUntil === 0
    ? `${line.amountLabel} ${line.label} comes out today`
    : `${line.amountLabel} ${line.label} comes out in ${line.daysUntil} days`;
}

function formatChecklist(line: DigestChecklistLine): string {
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
 * Returns the content lines in documented order (payments, checklist,
 * reminders, transports, stays, items) — and, for MORNING, the schedule-only
 * lines, since the morning slot exists purely as travel-day insurance and
 * must never repeat what the previous evening's Digest already carried.
 */
function collectLines(input: DigestInput): { lines: string[]; paymentLineCount: number } {
  const lines: string[] = [];
  let paymentLineCount = 0;

  if (input.slot === "EVENING") {
    for (const payment of input.payments) {
      lines.push(formatPayment(payment));
      paymentLineCount += 1;
    }
    for (const item of input.checklist) lines.push(formatChecklist(item));
    for (const reminder of input.reminders) lines.push(formatReminder(reminder));
  }

  for (const transport of input.schedule.transports) lines.push(formatTransport(transport));
  for (const stay of input.schedule.stays) lines.push(formatStay(stay));
  for (const item of input.schedule.items) lines.push(formatItem(item));

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

  const title =
    input.slot === "MORNING"
      ? "Today"
      : input.phase === "travelling"
        ? "Tomorrow"
        : "Coming up";

  const isPaymentOnly = paymentLineCount > 0 && paymentLineCount === lines.length;
  const url = isPaymentOnly ? `/trips/${input.tripId}/budget` : `/trips/${input.tripId}`;

  return { title, body: capped.join("\n"), url };
}
