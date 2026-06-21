"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { AgendaView } from "@/components/trip/agenda-view";
import { MonthGrid } from "@/components/trip/month-grid";
import { addMonths, startOfMonthISO, formatMonthYear, monthKey } from "@/lib/dates";
import { rescheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import type { DayPlan } from "@/lib/itinerary";

const STORAGE_KEY = "trip-planner-calendar-view";
type View = "month" | "agenda";

// ---------------------------------------------------------------------------
// External store — mirrors the ThemeProvider pattern so we never call setState
// inside an effect. The source of truth is localStorage (client only).
// ---------------------------------------------------------------------------

const viewSubscribers = new Set<() => void>();

function notifyViewSubscribers() {
  for (const fn of viewSubscribers) fn();
}

function subscribeView(callback: () => void) {
  viewSubscribers.add(callback);
  return () => {
    viewSubscribers.delete(callback);
  };
}

function resolveView(): View {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "month" || stored === "agenda") return stored;
  } catch {
    // localStorage unavailable — fall through to responsive default.
  }
  return window.matchMedia("(min-width: 768px)").matches ? "month" : "agenda";
}

function commitView(next: View) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore persistence failure
  }
  notifyViewSubscribers();
}

/** Client snapshot: read from localStorage + media query. */
function getViewSnapshot(): View {
  return resolveView();
}

/** Server snapshot: always render agenda (SSR-safe, no hydration mismatch). */
function getViewServerSnapshot(): View {
  return "agenda";
}

// ---------------------------------------------------------------------------

export interface CalendarViewsProps {
  tripId: string;
  days: DayPlan[];
  tripStart: string;
  tripEnd: string;
}

export function CalendarViews({ tripId, days, tripStart, tripEnd }: CalendarViewsProps) {
  // useSyncExternalStore gives us the SSR-safe default (agenda on server) and
  // the resolved preference on the client without ever calling setState in an effect.
  const view = React.useSyncExternalStore(
    subscribeView,
    getViewSnapshot,
    getViewServerSnapshot,
  );

  // On first client mount, reconcile localStorage to the resolved preference
  // (handles the case where no stored value exists yet). Mutates the external
  // store — NOT setState — so this is the approved pattern per theme-provider.
  React.useEffect(() => {
    commitView(resolveView());
  }, []);

  const [monthAnchor, setMonthAnchor] = React.useState(() => startOfMonthISO(tripStart));

  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const handleDropItem = React.useCallback(
    (itemId: string, dateISO: string) => {
      startTransition(async () => {
        const result = await rescheduleItem(itemId, dateISO);
        if (!result.success) {
          toast({
            variant: "destructive",
            title: result.errors.date?.[0] ?? "Couldn't move that item.",
          });
          return;
        }
        router.refresh();
      });
    },
    [router],
  );

  // `view` is "agenda" on the server and during hydration (getViewServerSnapshot),
  // resolving to the stored/responsive preference only after hydration — so gating
  // the month UI on `view === "month"` is already SSR-safe with no extra mount flag.
  const canPrev = monthKey(monthAnchor) > monthKey(tripStart);
  const canNext = monthKey(monthAnchor) < monthKey(tripEnd);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          type="single"
          value={view}
          onValueChange={(v) => v && commitView(v as View)}
          aria-label="Calendar view"
        >
          <SegmentedItem value="month">Month</SegmentedItem>
          <SegmentedItem value="agenda">Agenda</SegmentedItem>
        </Segmented>

        {view === "month" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canPrev}
              onClick={() => setMonthAnchor((m) => addMonths(m, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="min-w-32 text-center font-display text-sm font-semibold">
              {formatMonthYear(monthAnchor)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canNext}
              onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {/* Body */}
      {view === "month" ? (
        <div className={pending ? "pointer-events-none opacity-70" : undefined}>
          <MonthGrid
            tripId={tripId}
            monthAnchorISO={monthAnchor}
            days={days}
            tripStart={tripStart}
            tripEnd={tripEnd}
            onDropItem={handleDropItem}
          />
        </div>
      ) : (
        <AgendaView tripId={tripId} days={days} />
      )}
    </div>
  );
}
