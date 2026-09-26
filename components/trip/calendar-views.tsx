"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, CalendarCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { AgendaView } from "@/components/trip/agenda-view";
import { MonthGrid } from "@/components/trip/month-grid";
import { addMonths, startOfMonthISO, formatMonthYear, monthKey } from "@/lib/dates";
import { scheduleItem, rescheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { ScheduleItemDialog } from "@/components/trip/schedule-item-dialog";
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
  /** Trip-reference-timezone "today" (YYYY-MM-DD), computed by the caller. */
  todayISO: string;
}

export function CalendarViews({ tripId, days, tripStart, tripEnd, wishlistItems, todayISO }: CalendarViewsProps) {
  const reduce = useReducedMotion();

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

  const wishlistIds = React.useMemo(
    () => new Set(wishlistItems.map((w) => w.id)),
    [wishlistItems],
  );

  // Stops in trip order, derived from the days already projected here (no
  // separate stops prop to keep in sync) — used to default the Schedule
  // dialog's date to the trip's first Stop. A Wishlist idea is never
  // attached to a Stop (ADR 0022), so the first Stop is the natural default.
  const stops = React.useMemo(() => {
    const seen = new Map<string, { id: string; arriveDate: string }>();
    for (const d of days) {
      if (d.stop && !seen.has(d.stop.id)) {
        seen.set(d.stop.id, { id: d.stop.id, arriveDate: d.stop.arriveDate });
      }
    }
    return [...seen.values()];
  }, [days]);

  const handleDropItem = React.useCallback(
    (itemId: string, dateISO: string) => {
      startTransition(async () => {
        // ADR 0019: a Wishlist idea is PLACED (copy-in) — the idea survives on
        // the board. Only an already-dated item moves in place.
        const result = wishlistIds.has(itemId)
          ? await scheduleItem(itemId, { date: dateISO })
          : await rescheduleItem(itemId, dateISO);
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
    [router, wishlistIds],
  );

  const [railOpen, setRailOpen] = React.useState(true);
  const [schedulingItem, setSchedulingItem] = React.useState<WishlistRailItem | null>(null);

  // `view` is "agenda" on the server and during hydration (getViewServerSnapshot),
  // resolving to the stored/responsive preference only after hydration — so gating
  // the month UI on `view === "month"` is already SSR-safe with no extra mount flag.
  const canPrev = monthKey(monthAnchor) > monthKey(tripStart);
  const canNext = monthKey(monthAnchor) < monthKey(tripEnd);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar — kit Days header: the month as a display title beside the sun Segmented. */}
      {/* One wrapping row: on a phone the title takes its own line and the
          Segmented + month arrows share the next; from `sm` it is one line. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 className="w-full font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-foreground sm:w-auto lg:text-4xl">
          {view === "month" ? formatMonthYear(monthAnchor) : "Agenda"}
        </h2>
        <Segmented
          type="single"
          tone="sun"
          value={view}
          onValueChange={(v) => v && commitView(v as View)}
          aria-label="Calendar view"
        >
          <SegmentedItem value="month">Month</SegmentedItem>
          <SegmentedItem value="agenda">Agenda</SegmentedItem>
        </Segmented>

        <div
          className={cn("ml-auto flex items-center gap-2", view !== "month" && "invisible")}
          aria-hidden={view !== "month" || undefined}
        >
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className={cn(view !== "month" && "invisible")}
            disabled={view !== "month" || !canPrev}
            onClick={() => setMonthAnchor((m) => addMonths(m, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className={cn(view !== "month" && "invisible")}
            disabled={view !== "month" || !canNext}
            onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? { duration: 0 } : { duration: DURATION.fast, ease: EASE_OUT }}
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
                  todayISO={todayISO}
                  onDropItem={handleDropItem}
                />
              </div>

              {wishlistItems.length > 0 && (
                <aside className={cn(cardVariants({ shadow: 1 }), "self-start p-3 lg:w-72 lg:shrink-0 xl:w-80")}>
                  <button
                    type="button"
                    aria-expanded={railOpen}
                    onClick={() => setRailOpen((o) => !o)}
                    className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-md px-1 text-[13px] font-extrabold text-foreground hover:bg-muted"
                  >
                    {railOpen ? (
                      <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                    )}
                    Wishlist ({wishlistItems.length})
                  </button>
                  {railOpen && (
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {wishlistItems.map((w) => (
                        <li
                          key={w.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/item-id", w.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          className="flex cursor-grab items-center gap-2 rounded-md border-2 border-border bg-background py-1 pl-2.5 pr-1 text-[13px] font-semibold active:cursor-grabbing"
                        >
                          {/* Opens the same schedule dialog as the CalendarCheck action below — the
                              only "view this item" affordance this rail has — so the clamped title
                              still has somewhere to reveal its full text. */}
                          <button
                            type="button"
                            onClick={() => setSchedulingItem(w)}
                            // tap-target: invisible ≥44px hit area on coarse pointers (COMPONENTS.md
                            // "Tap targets"). It's centred on this button's own box, so it can't
                            // spread sideways into the CalendarCheck button's separate hit area.
                            className="tap-target flex min-w-0 flex-1 items-center gap-2 rounded text-left"
                          >
                            <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", categoryDotClass(w.category))} />
                            <span className="min-w-0 flex-1 line-clamp-2">{w.title}</span>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            // 32px visual; the coarse-pointer ::after pads the hit area to 44px.
                            className="relative size-8 shrink-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']"
                            aria-label={`Schedule ${w.title}`}
                            title="Schedule this item"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSchedulingItem(w);
                            }}
                          >
                            <CalendarCheck className="size-4" aria-hidden="true" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] font-medium text-muted-foreground">Drag onto a day to schedule.</p>
                </aside>
              )}
            </div>
          ) : (
            <AgendaView tripId={tripId} days={days} todayISO={todayISO} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Schedule item dialog — keyboard/touch path for wishlist rail */}
      {schedulingItem && (
        <ScheduleItemDialog
          itemId={schedulingItem.id}
          itemTitle={schedulingItem.title}
          defaultDate={stops[0]?.arriveDate ?? tripStart}
          open={Boolean(schedulingItem)}
          onOpenChange={(open) => {
            if (!open) setSchedulingItem(null);
          }}
          onSaved={() => setSchedulingItem(null)}
        />
      )}
    </div>
  );
}
