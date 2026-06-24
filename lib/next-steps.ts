/**
 * Pure "Next steps" engine for the trip Home.
 *
 * Combines detected Flags (problems) with forward-looking nudges (gaps that
 * aren't problems yet) into one ranked, deep-linked to-do list. See CONTEXT.md
 * ("Next steps") and ADR 0010. PURE — no Prisma/React.
 */
import type { Flag } from "@/lib/flags";
import type { TripPhase } from "@/lib/trip-phase";

export interface NextStep {
  id: string;
  title: string;
  href: string;
  severity: "warning" | "info";
  source: "flag" | "nudge";
}

/** Forward-looking gaps that detectFlags does not already cover. */
export interface NudgeInput {
  hasDates: boolean;
  undatedChapterCount: number;
  hasPackingList: boolean;
  hasPretripList: boolean;
  unbookedTransportCount: number;
}

export interface BuildNextStepsInput {
  flags: Flag[];
  phase: TripPhase;
  nudges: NudgeInput;
  tripBasePath: string; // e.g. "/trips/abc"
  limit?: number;
}

// Lower priority = more important (sorts earlier).
const WARNING_PRIORITY = 10;
const INFO_PRIORITY = 30;

function flagHref(flag: Flag, base: string): string {
  switch (flag.targetType) {
    case "DAY":
      return flag.date ? `${base}/day/${flag.date}` : `${base}/calendar`;
    case "STOP":
    case "TRANSPORT":
    case "ACCOMMODATION":
    case "TRIP":
    default:
      return `${base}/plan`;
  }
}

interface Candidate extends NextStep {
  priority: number;
}

export function buildNextSteps({
  flags,
  phase,
  nudges,
  tripBasePath,
  limit = 4,
}: BuildNextStepsInput): NextStep[] {
  const candidates: Candidate[] = [];

  // 1. Flags become steps.
  for (const flag of flags) {
    candidates.push({
      id: flag.id,
      title: flag.message,
      href: flagHref(flag, tripBasePath),
      severity: flag.severity,
      source: "flag",
      priority: flag.severity === "warning" ? WARNING_PRIORITY : INFO_PRIORITY,
    });
  }

  // 2. Forward nudges. In final-prep, prep nudges are boosted above info flags.
  const isFinalPrep = phase === "final-prep";
  const push = (
    cond: boolean,
    id: string,
    title: string,
    href: string,
    priority: number,
  ) => {
    if (cond) candidates.push({ id, title, href, severity: "info", source: "nudge", priority });
  };

  push(!nudges.hasDates, "nudge-set-dates", "Set your trip dates to start firming up.", `${tripBasePath}/plan`, 1);
  push(nudges.undatedChapterCount > 0, "nudge-undated-chapters", `Set dates for ${nudges.undatedChapterCount} chapter${nudges.undatedChapterCount === 1 ? "" : "s"}.`, `${tripBasePath}/plan`, 22);
  push(nudges.unbookedTransportCount > 0, "nudge-unbooked-transport", `${nudges.unbookedTransportCount} transport leg${nudges.unbookedTransportCount === 1 ? "" : "s"} have no times yet.`, `${tripBasePath}/plan`, isFinalPrep ? 9 : 20);
  push(!nudges.hasPackingList, "nudge-packing", "Start your packing list.", `${tripBasePath}/checklists`, isFinalPrep ? 6 : 26);
  push(!nudges.hasPretripList, "nudge-pretrip", "Add pre-trip to-dos (visas, insurance, eSIM).", `${tripBasePath}/checklists`, isFinalPrep ? 8 : 28);

  candidates.sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.id.localeCompare(b.id)));

  return candidates.slice(0, limit).map(({ priority: _priority, ...step }) => step);
}
