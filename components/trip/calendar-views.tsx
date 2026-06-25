"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { AgendaView } from "@/components/trip/agenda-view";
import { MonthGrid } from "@/components/trip/month-grid";
import { addMonths, startOfMonthISO, formatMonthYear, monthKey } from "@/lib/dates";
import { rescheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { categoryDotClass } from "@/components/trip/category-dot";
import { cn } from "@/lib/cn";
import { DURATION, EASE_OUT } from "@/lib/motion";
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

export function resolveView(): View {
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

export interface WishlistRailItem {
  id: string;
  title: string;
  category: string;
}

export interface CalendarViewsProps {
  tripId: string;
  days: DayPlan[];
  tripStart: string;
  tripEnd: string;
  wishlistItems: WishlistRailItem[];
}

export function CalendarViews({ tripId, days, tripStart, tripEnd, wishlistItems }: CalendarViewsProps) {
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

  const [railOpen, setRailOpen] = React.useState(true);

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
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.fast, ease: EASE_OUT }}
        >
          {view === "month" ? (
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className={cn("flex-1", pending && "pointer-events-none opacity-70")}>
                <MonthGrid
                  tripId={tripId}
                  monthAnchorISO={monthAnchor}
                  days={days}
                  tripStart={tripStart}
                  tripEnd={tripEnd}
                  onDropItem={handleDropItem}
                />
              </div>

              {wishlistItems.length > 0 && (
                <aside className="lg:w-56 lg:shrink-0">
                  <button
                    type="button"
                    onClick={() => setRailOpen((o) => !o)}
                    className="mb-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    Wishlist ({wishlistItems.length}) {railOpen ? "▾" : "▸"}
                  </button>
                  {railOpen && (
                    <ul className="flex flex-col gap-1.5">
                      {wishlistItems.map((w) => (
                        <li
                          key={w.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/item-id", w.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          className="flex cursor-grab items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-xs active:cursor-grabbing"
                        >
                          <span className={cn("size-2 shrink-0 rounded-full", categoryDotClass(w.category))} />
                          <span className="truncate">{w.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">Drag onto a day to schedule.</p>
                </aside>
              )}
            </div>
          ) : (
            <AgendaView tripId={tripId} days={days} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
