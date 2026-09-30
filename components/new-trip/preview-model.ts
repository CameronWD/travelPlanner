import { cardBigNumber, type BigNumber } from "@/lib/trips/trip-status";
import { formatDateRangeCompact } from "@/lib/dates";
import { formatRoughMonth, roughMonthStamp } from "@/lib/rough-month";
import { stampPlace, stampDate } from "@/components/trips/cover-stamp";
import type { DateMode, Step } from "@/lib/new-trip/draft";

export interface PreviewInput {
  past: boolean;
  step: Step;
  name: string;
  dateMode: DateMode;
  startDate?: string;
  endDate?: string;
  roughMonth?: string;
  today: string;
  /** The name the stamp reads, debounced so it doesn't re-stamp per keystroke (MOTION N5). Defaults to `name`. */
  stampName?: string;
}

export interface PreviewModel {
  pill: { kind: "up-next" | "done"; label: string };
  dateLine: string | null;
  title: string;
  placeholder: boolean;
  bottom: { kind: "skeleton" } | { kind: "big"; big: BigNumber } | { kind: "rough"; month: string };
  stamp: { place: string; startDate: string | null; dateLabel: string };
  chip: boolean;
  caption: string;
}

const CAPTION: Record<Step, string> = {
  1: "Fills in as you answer",
  2: "Dates start the countdown and date the stamp",
  3: "Ready to go",
  4: "Ready to go",
};

export function previewModel(i: PreviewInput): PreviewModel {
  const exact = (i.past || i.dateMode === "exact") && i.startDate && i.endDate ? { s: i.startDate, e: i.endDate } : null;
  const rough = !i.past && i.dateMode === "rough" && i.roughMonth ? i.roughMonth : null;
  const kind = i.past ? "done" : "up-next";
  const label = exact ? (i.past ? "DONE" : "UP NEXT") : rough ? "UP NEXT" : "NEW TRIP";
  const title = i.name.trim();
  // The stamp dates from the start alone, so the first-date press (MOTION N6) lands
  // with its date; the countdown still waits for the whole range.
  const stampStart = exact?.s ?? ((i.past || i.dateMode === "exact") && i.startDate ? i.startDate : null);
  return {
    pill: { kind, label },
    dateLine: exact ? formatDateRangeCompact(exact.s, exact.e) : null,
    title: title || "Your trip",
    placeholder: !title,
    bottom: exact
      ? { kind: "big", big: cardBigNumber({ kind, startDate: exact.s, endDate: exact.e, today: i.today }) }
      : rough
        ? { kind: "rough", month: formatRoughMonth(rough, i.today) }
        : { kind: "skeleton" },
    stamp: {
      // The preview matches the real card's rule (no separate stamp word): with no
      // Stops yet, stampPlace just echoes the name; empty name falls back to "TRIP".
      place: stampPlace({ stops: [], name: (i.stampName ?? i.name).trim(), size: "hero" }) || "TRIP",
      startDate: stampStart,
      dateLabel: stampStart ? stampDate(stampStart) : rough ? roughMonthStamp(rough) : "— — —",
    },
    chip: i.step === 4 && !i.past,
    caption: CAPTION[i.step],
  };
}
