/**
 * Per-stop colour bands, keyed by stop.sortOrder. Shared by MonthGrid and the
 * plan editor's StopCard so a stop reads the same hue on the calendar and the
 * itinerary. Static strings keep Tailwind's content scanner happy.
 */
const STOP_HUES = ["sky", "amber", "emerald", "violet", "rose", "teal"] as const;

const BORDER = ["border-l-sky-400", "border-l-amber-400", "border-l-emerald-400", "border-l-violet-400", "border-l-rose-400", "border-l-teal-400"];
const DOT = ["bg-sky-400", "bg-amber-400", "bg-emerald-400", "bg-violet-400", "bg-rose-400", "bg-teal-400"];
const PILL = [
  "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
];

const idx = (i: number) => ((i % STOP_HUES.length) + STOP_HUES.length) % STOP_HUES.length;

export function stopBandBorderClass(index: number): string { return BORDER[idx(index)]; }
export function stopDotClass(index: number): string { return DOT[idx(index)]; }
export function stopPillClass(index: number): string { return PILL[idx(index)]; }
