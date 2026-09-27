/**
 * "Sort these out" — the desktop Home's to-do tile (spec 2026-09-27-desktop-home
 * §7, amended by 2026-09-27-beta-feedback §C). Built from the Trip's Next steps
 * (lib/next-steps*) plus Reminders due within the next 7 days (CONTEXT.md
 * "Reminder": shows on Home from a week before its date until the day itself).
 *
 * Order: those Reminders, then Transport steps, then every other step in its
 * existing (ranked) order. At most 4 rows; `total` counts everything.
 *
 * PURE — no Prisma/React. Only type imports from the reminders action module.
 */
import { addDays, formatDayLabel } from "@/lib/dates";
import type { NextStep } from "@/lib/next-steps";
import type { ReminderItem } from "@/server/actions/reminders";

export type SortTone = "coral" | "sun" | "teal" | "lilac" | "pink" | "stone";
export type SortIcon =
  | "bell"
  | "plane"
  | "list-checks"
  | "clipboard-list"
  | "calendar"
  | "circle-alert"
  | "map-pin"
  | "check";

export interface SortRow {
  id: string;
  title: string;
  subtitle?: string;
  /** Null only for the "You're all sorted" row, which goes nowhere. */
  href: string | null;
  tone: SortTone;
  icon: SortIcon;
}

export interface SortTheseOutInput {
  steps: NextStep[];
  reminders: ReminderItem[];
  /** YYYY-MM-DD in the Trip's current zone. */
  today: string;
  /** "/trips/<id>" — Reminder rows link into the Plan. */
  basePath: string;
}

export const SORT_ROW_LIMIT = 4;
const REMINDER_WINDOW_DAYS = 7;

export const ALL_SORTED_ROW: SortRow = {
  id: "all-sorted",
  title: "You're all sorted",
  subtitle: "We'll flag anything new here",
  href: null,
  tone: "teal",
  icon: "check",
};

const EMPTY_DAY = /^empty-day-(\d{4}-\d{2}-\d{2})$/;

function stepRow(step: NextStep): SortRow {
  const base = { id: step.id, title: step.title, subtitle: step.subtitle, href: step.href };
  if (step.kind === "transport") return { ...base, tone: "sun", icon: "plane" };

  // Step ids come from lib/next-steps.ts (nudge-*) and lib/flags.ts.
  const id = step.id.replace(/^nudge-/, "");
  if (id.startsWith("packing")) return { ...base, tone: "teal", icon: "list-checks" };
  if (id.startsWith("pretrip")) return { ...base, tone: "lilac", icon: "clipboard-list" };
  if (id.startsWith("first-stop")) return { ...base, tone: "teal", icon: "map-pin" };
  const empty = EMPTY_DAY.exec(step.id);
  if (empty) {
    // The Flag's own message carries an ISO date — people only ever see
    // formatDayLabel ("Sat 12 Dec").
    return {
      ...base,
      title: `Plan ${formatDayLabel(empty[1])}`,
      subtitle: "Nothing scheduled that day",
      tone: "pink",
      icon: "calendar",
    };
  }
  return { ...base, tone: "stone", icon: "circle-alert" };
}

export function sortTheseOut({ steps, reminders, today, basePath }: SortTheseOutInput): {
  rows: SortRow[];
  total: number;
} {
  const until = addDays(today, REMINDER_WINDOW_DAYS);
  const reminderRows: SortRow[] = reminders
    .filter((r) => r.date >= today && r.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      id: `reminder-${r.id}`,
      title: r.title,
      subtitle: `Due ${formatDayLabel(r.date)}`,
      href: r.stopId ? `${basePath}/plan#stop-${r.stopId}` : `${basePath}/plan`,
      tone: "coral",
      icon: "bell",
    }));

  const transport = steps.filter((s) => s.kind === "transport").map(stepRow);
  const rest = steps.filter((s) => s.kind !== "transport").map(stepRow);
  const all = [...reminderRows, ...transport, ...rest];

  if (all.length === 0) return { rows: [ALL_SORTED_ROW], total: 0 };
  return { rows: all.slice(0, SORT_ROW_LIMIT), total: all.length };
}
