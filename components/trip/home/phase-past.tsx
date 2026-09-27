import type { ReactNode } from "react";
import Link from "next/link";
import { NotebookPen, PlaneTakeoff, Route } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { loadPastHome } from "@/lib/past-home-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import { PastDesktopGrid } from "@/components/trip/home/desktop/desktop-home-grid";
import { CountdownTile, type CountdownTileProps } from "@/components/trip/home/desktop/countdown-tile";
import { HOME_GRID_GAP, HOME_STACK } from "@/components/trip/home/spacing";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PhasePastProps {
  tripId: string;
  trip: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    homeCurrency: string;
    chaptersEnabled: boolean;
  };
  /** The trip Home's Reminders card, rendered by the page for every Phase —
   * this phase's job is only to place it at the end of the right rail.
   * Phone layout only: the desktop grid has no Reminders panel (they live on
   * Checklists, Task 16). */
  reminders?: ReactNode;
  /** "phone" (default): the recap + rail, unchanged. "desktop": the same
   * wrap-up content as tiles on the lg+ 12-column grid (spec D), under the
   * page's HomeHeader. Both read the same cache()d model (lib/past-home-loader). */
  layout?: "phone" | "desktop";
  /** Desktop only: the Trip's cover for the countdown tile's polaroid. */
  cover?: CountdownTileProps["cover"];
}

// ---------------------------------------------------------------------------
// Exported constant — tested by phase-past.test.tsx
// ---------------------------------------------------------------------------

/** Exported for className assertion in tests — must match the JSX below. */
export const PAST_DESKTOP_GRID_CLASS =
  `grid grid-cols-1 ${HOME_GRID_GAP} lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start`;

/**
 * Exported for className assertion in tests — must match the JSX below.
 * Stacked below `sm` so the two CTA buttons' full label text (e.g. "Plan
 * another trip") never gets clipped at 320–374px viewports; side by side
 * from `sm` up; stacked again at `lg`, where they sit in the 340px rail.
 */
export const PAST_CTAS_ROW_CLASS = `${HOME_STACK} sm:flex-row lg:flex-col`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export async function PhasePast({ tripId, trip, reminders, layout = "phone", cover = null }: PhasePastProps) {
  const base = `/trips/${tripId}`;
  // Reminders still need a home even in this defensive branch, since the
  // page passes them in regardless of phase.
  if (!trip.startDate) return <>{layout === "phone" ? reminders : null}</>;

  const {
    totalNights,
    grandTotal,
    mapStops,
    stopCount,
    paidSoFarMinor,
    costTotalMinor,
    varianceMinor,
    underBudget,
    pct,
    journalCount,
  } = await loadPastHome(tripId, trip.startDate, trip.endDate, trip.homeCurrency, trip.chaptersEnabled);

  // ---------------------------------------------------------------------------
  // Compose cards — kit shared/onthego.jsx "Summary": a title, then the
  // StatCard row (teal nights · sun trip cost · lilac paid so far).
  // ---------------------------------------------------------------------------
  const wrapHeading = (
    <h2 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-foreground lg:text-4xl">
      That&apos;s a wrap
    </h2>
  );

  const nightsStat = (
    <StatCard
      tone="teal"
      label="Nights"
      value={totalNights}
      sub={`${stopCount} ${stopCount === 1 ? "stop" : "stops"}`}
    />
  );
  const costStat = (
    <StatCard
      tone="sun"
      label="Trip cost"
      value={formatMoney(grandTotal.costTotalMinor, trip.homeCurrency)}
      sub="shared pot"
    />
  );
  const paidStat = (className?: string) => (
    <StatCard
      tone="lilac"
      label="Paid so far"
      value={formatMoney(paidSoFarMinor, trip.homeCurrency)}
      progress={pct}
      className={className}
      sub={
        <span className="flex flex-wrap items-center gap-1.5">
          <span>
            {pct}% of {formatMoney(costTotalMinor, trip.homeCurrency)} cost
          </span>
          {/* Under/over is a state: status tokens, not an accent hue. */}
          <Badge
            variant={underBudget ? undefined : "destructive"}
            className={underBudget ? "bg-success text-success-foreground" : undefined}
          >
            {formatMoney(Math.abs(varianceMinor), trip.homeCurrency)} {underBudget ? "under" : "over"}
          </Badge>
        </span>
      }
    />
  );

  const recap = (
    <div className={HOME_STACK}>
      {wrapHeading}
      <div className={`grid grid-cols-2 ${HOME_GRID_GAP} lg:grid-cols-3`}>
        {nightsStat}
        {costStat}
        {paidStat("col-span-2 lg:col-span-1")}
      </div>
    </div>
  );

  // Taller as the desktop grid's full-width row than in the phone column.
  const routeMapAt = (height: number) => mapStops.length > 0 ? (
    // The map draws its own kit frame (2px outline, hard shadow) — no Card around it.
    <RouteMap stops={mapStops} height={height} />
  ) : (
    // Kit shared/states.jsx "Plan" empty — the route has nothing to draw.
    <EmptyState
      icon={Route}
      tone="teal"
      title="No stops yet"
      description="Give the places you went dates and we'll draw the route."
    />
  );

  const ctas = (
    <div className={PAST_CTAS_ROW_CLASS}>
      <Button asChild variant="primary" className="sm:flex-1 lg:flex-none">
        <Link href={`${base}/journal`}>
          <NotebookPen className="size-4" aria-hidden="true" />
          {journalCount === 0
            ? "Write your first journal entry"
            : "Finish your journal"}
        </Link>
      </Button>
      <Button asChild variant="secondary" className="sm:flex-1 lg:flex-none">
        <Link href="/trips/new">
          <PlaneTakeoff className="size-4" aria-hidden="true" />
          Plan another trip
        </Link>
      </Button>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Desktop (lg+, spec D): the same wrap-up — no new content — as tiles on
  // the 12-column grid. Row 1 the "Back home" countdown tile beside "That's a
  // wrap" + the CTAs; row 2 the three stat tiles; row 3 the route map.
  // ---------------------------------------------------------------------------
  if (layout === "desktop") {
    return (
      <PastDesktopGrid
        hasCover={cover != null}
        countdown={
          <CountdownTile
            href={`${base}/plan`}
            status="HOME"
            countdown={{ kind: "home" }}
            firstLeg={null}
            cover={cover}
            tripId={tripId}
          />
        }
        wrap={
          <Card radius="xl" shadow={3} className="flex h-full min-h-0 flex-col gap-4 p-6">
            {wrapHeading}
            <div className={`mt-auto ${HOME_STACK}`}>{ctas}</div>
          </Card>
        }
        stats={[nightsStat, costStat, paidStat("h-full")]}
        map={routeMapAt(320)}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render — full-width recap (title + stat row), then a main column (route
  // map) beside a right rail (CTAs). On mobile the grid collapses to one
  // column: recap → route map → CTAs.
  // ---------------------------------------------------------------------------
  return (
    <div className={HOME_STACK}>
      {recap}
      <div className={PAST_DESKTOP_GRID_CLASS} data-testid="past-grid">
        {/* Main: route map */}
        <div className={`${HOME_STACK} lg:order-1`}>
          {routeMapAt(200)}
        </div>
        {/* Rail: CTAs */}
        <div className={`${HOME_STACK} lg:order-2`} data-home-aside>
          {ctas}
          {reminders}
        </div>
      </div>
    </div>
  );
}
