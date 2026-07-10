"use client";

import * as React from "react";
import { GitMerge, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { formatLongDate } from "@/lib/dates";
import { diffMetrics, diffRoute, type RouteDiffStop } from "@/lib/compare";
import type { ComparisonPlan } from "@/server/actions/forks";
import { moveFork } from "@/server/actions/forks";
import { PromoteForkDialog } from "@/components/trip/promote-fork-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TripMeta {
  id: string;
  name: string;
  homeCurrency: string;
}

export interface CompareTableProps {
  trip: TripMeta;
  plans: ComparisonPlan[];
  /** When true (discreet mode) the table is hidden and a neutral placeholder shown. */
  discreet?: boolean;
}

// ---------------------------------------------------------------------------
// Delta formatters
// ---------------------------------------------------------------------------

function signedInt(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

function formatNightsDelta(n: number): string | null {
  if (n === 0) return null;
  const unit = Math.abs(n) === 1 ? "night" : "nights";
  return `${signedInt(n)} ${unit}`;
}

function formatStopsDelta(n: number): string | null {
  if (n === 0) return null;
  const unit = Math.abs(n) === 1 ? "stop" : "stops";
  return `${signedInt(n)} ${unit}`;
}

function formatFlightsDelta(n: number): string | null {
  if (n === 0) return null;
  const unit = Math.abs(n) === 1 ? "flight" : "flights";
  return `${signedInt(n)} ${unit}`;
}

function formatBudgetDelta(minor: number | null, currency: string): string | null {
  if (minor === null || minor === 0) return null;
  // Format the absolute magnitude then prepend sign (formatMoney includes the currency symbol)
  const abs = formatMoney(Math.abs(minor), currency);
  return minor > 0 ? `+${abs}` : `-${abs}`;
}

function formatMinutesDelta(minutes: number): string | null {
  if (minutes === 0) return null;
  const totalMins = Math.abs(minutes);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const formatted = h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
  return `${minutes > 0 ? "+" : "-"}${formatted}`;
}

function formatProjectedEndDelta(days: number | null): string | null {
  if (days === null || days === 0) return null;
  const unit = Math.abs(days) === 1 ? "day" : "days";
  if (days > 0) return `ends ${days} ${unit} later`;
  return `ends ${Math.abs(days)} ${unit} earlier`;
}

function formatFlagsDelta(warnings: number, infos: number): string | null {
  const parts: string[] = [];
  if (warnings !== 0) {
    const unit = Math.abs(warnings) === 1 ? "warning" : "warnings";
    parts.push(`${signedInt(warnings)} ${unit}`);
  }
  if (infos !== 0) {
    const unit = Math.abs(infos) === 1 ? "info" : "infos";
    parts.push(`${signedInt(infos)} ${unit}`);
  }
  if (parts.length === 0) return null;
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Hard-end state label
// ---------------------------------------------------------------------------

function hardEndLabel(state: ComparisonPlan["metrics"]["hardEndState"]): string {
  switch (state) {
    case "ok":
      return "On time";
    case "approaching":
      return "Approaching limit";
    case "over":
      return "Over hard end";
    case "none":
      return "—";
  }
}

function hardEndBadgeVariant(state: ComparisonPlan["metrics"]["hardEndState"]): "outline" | "destructive" | "secondary" {
  if (state === "over") return "destructive";
  if (state === "approaching") return "secondary";
  return "outline";
}

// ---------------------------------------------------------------------------
// Transit/driving time formatter
// ---------------------------------------------------------------------------

function formatMinutes(minutes: number): string {
  if (minutes === 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Route summary
// ---------------------------------------------------------------------------

function RouteCell({ plan }: { plan: ComparisonPlan }) {
  const { route, countries } = plan.metrics;
  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      {route.map((stop, i) => (
        <div key={i} className="flex items-baseline gap-1 min-w-0 text-sm">
          <span className="font-medium text-foreground truncate min-w-0">{stop.name}</span>
          {stop.country && (
            <span className="text-xs text-muted-foreground">{stop.country}</span>
          )}
          {stop.nights !== null && stop.nights > 0 && (
            <span className="ml-auto text-xs text-muted-foreground font-mono">
              {stop.nights}n
            </span>
          )}
        </div>
      ))}
      {countries.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {countries.join(" · ")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route diff cell (fork columns)
// ---------------------------------------------------------------------------

function nightsLabel(n: number | null): string | null {
  return n !== null && n > 0 ? `${n}n` : null;
}

function DiffStopRow({ stop }: { stop: RouteDiffStop }) {
  const base = "flex items-baseline gap-1 min-w-0 text-sm";
  if (stop.kind === "dropped") {
    return (
      <div className={base}>
        <span className="truncate min-w-0 text-muted-foreground line-through">{stop.name}</span>
        {nightsLabel(stop.nights) && (
          <span className="ml-auto text-xs text-muted-foreground line-through font-mono">{nightsLabel(stop.nights)}</span>
        )}
      </div>
    );
  }
  const tone =
    stop.kind === "added"
      ? "text-emerald-700 dark:text-emerald-400"
      : stop.kind === "renighted"
        ? "text-amber-700 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className={base}>
      {stop.kind === "added" && <span className="shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true">+</span>}
      {stop.kind === "moved" && <span className="shrink-0 text-muted-foreground" aria-hidden="true">↕</span>}
      <span className={`truncate min-w-0 font-medium ${tone}`}>{stop.name}</span>
      {stop.country && <span className="text-xs text-muted-foreground">{stop.country}</span>}
      {stop.kind === "renighted" ? (
        <span className="ml-auto text-xs text-amber-700 dark:text-amber-400 font-mono">{stop.baseNights ?? "?"}→{stop.nights ?? "?"}n</span>
      ) : (
        nightsLabel(stop.nights) && <span className="ml-auto text-xs text-muted-foreground font-mono">{nightsLabel(stop.nights)}</span>
      )}
    </div>
  );
}

function RouteDiffCell({ realPlan, plan }: { realPlan: ComparisonPlan; plan: ComparisonPlan }) {
  const diff = diffRoute(realPlan.metrics, plan.metrics);
  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      <p className="text-xs font-medium text-muted-foreground">{diff.summary}</p>
      {diff.stops.map((s, i) => (
        <DiffStopRow key={i} stop={s} />
      ))}
      {diff.legChanges.map((l, i) => (
        <p key={`leg-${i}`} className="text-xs text-amber-700 dark:text-amber-400 truncate">
          {l.fromName}→{l.toName}: {l.fromMode.toLowerCase()} → {l.toMode.toLowerCase()}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delta badge
// ---------------------------------------------------------------------------

function DeltaBadge({ text }: { text: string }) {
  const isNegative = text.startsWith("-");
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        isNegative
          ? "bg-over/10 text-over"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      ].join(" ")}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reorder arrows
// ---------------------------------------------------------------------------

function ReorderArrows({
  planName, isFirst, isLast, onMove, pending,
}: { planName: string; isFirst: boolean; isLast: boolean; onMove: (d: "left" | "right") => void; pending: boolean }) {
  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button" aria-label={`Move ${planName} left`} disabled={isFirst || pending}
        onClick={() => onMove("left")}
        className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button" aria-label={`Move ${planName} right`} disabled={isLast || pending}
        onClick={() => onMove("right")}
        className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CompareTable({ trip, plans, discreet = false }: CompareTableProps) {
  const [promoteOpenFor, setPromoteOpenFor] = React.useState<string | null>(null);
  const router = useRouter();
  const [reorderPending, startReorder] = React.useTransition();

  function handleMove(forkId: string, direction: "left" | "right") {
    startReorder(async () => {
      await moveFork(forkId, direction);
      router.refresh();
    });
  }

  // ---------------------------------------------------------------------------
  // Discreet gate — hide fork/plan vocabulary when discreet mode is active.
  // The Compare view names forks explicitly; it cannot be rendered neutrally
  // without disclosing fork vocabulary, so we gate the entire feature.
  // ---------------------------------------------------------------------------
  if (discreet) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Comparison view not available in this mode.
        </p>
      </div>
    );
  }

  const realPlan = plans[0];
  const forkPlans = plans.slice(1);

  // Metric rows definition
  type MetricRowId =
    | "route"
    | "projected-end"
    | "budget"
    | "flags"
    | "stops"
    | "nights"
    | "transit"
    | "driving"
    | "flights";

  const METRIC_ROWS: { id: MetricRowId; label: string }[] = [
    { id: "route", label: "Route" },
    { id: "projected-end", label: "Projected end" },
    { id: "budget", label: "Budget" },
    { id: "flags", label: "Flags" },
    { id: "stops", label: "Stops" },
    { id: "nights", label: "Nights" },
    { id: "transit", label: "Transit time" },
    { id: "driving", label: "Driving" },
    { id: "flights", label: "Flights" },
  ];

  function renderCell(plan: ComparisonPlan, rowId: MetricRowId): React.ReactNode {
    const m = plan.metrics;
    switch (rowId) {
      case "route":
        return plan.forkId === null
          ? <RouteCell plan={plan} />
          : <RouteDiffCell realPlan={realPlan} plan={plan} />;
      case "projected-end":
        return (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-sm text-foreground">
              {m.projectedEnd ? formatLongDate(m.projectedEnd) : "—"}
            </span>
            <Badge variant={hardEndBadgeVariant(m.hardEndState)} className="w-fit text-xs">
              {hardEndLabel(m.hardEndState)}
            </Badge>
          </div>
        );
      case "budget":
        return (
          <span className="font-mono text-sm text-foreground text-right block">
            {m.budgetHomeMinor !== null
              ? formatMoney(m.budgetHomeMinor, trip.homeCurrency)
              : "—"}
          </span>
        );
      case "flags":
        return (
          <div className="flex flex-col gap-0.5 text-sm">
            {m.flagCounts.warning > 0 && (
              <span className="text-amber-600">⚠ {m.flagCounts.warning}</span>
            )}
            {m.flagCounts.info > 0 && (
              <span className="text-muted-foreground">ℹ {m.flagCounts.info}</span>
            )}
            {m.flagCounts.warning === 0 && m.flagCounts.info === 0 && (
              <span className="text-muted-foreground">None</span>
            )}
          </div>
        );
      case "stops":
        return <span className="font-mono text-sm text-foreground text-right block">{m.stopCount}</span>;
      case "nights":
        return <span className="font-mono text-sm text-foreground text-right block">{m.nightTotal}</span>;
      case "transit":
        return (
          <span className="font-mono text-sm text-foreground text-right block">
            {formatMinutes(m.transitMinutes)}
          </span>
        );
      case "driving":
        return (
          <span className="font-mono text-sm text-foreground text-right block">
            {formatMinutes(m.drivingMinutes)}
          </span>
        );
      case "flights":
        return <span className="font-mono text-sm text-foreground text-right block">{m.flightCount}</span>;
    }
  }

  function renderDelta(
    plan: ComparisonPlan,
    rowId: MetricRowId,
  ): React.ReactNode {
    const deltas = diffMetrics(realPlan.metrics, plan.metrics);
    let text: string | null = null;

    switch (rowId) {
      case "nights":
        text = formatNightsDelta(deltas.nightTotal);
        break;
      case "stops":
        text = formatStopsDelta(deltas.stopCount);
        break;
      case "flights":
        text = formatFlightsDelta(deltas.flightCount);
        break;
      case "budget":
        text = formatBudgetDelta(deltas.budgetHomeMinor, trip.homeCurrency);
        break;
      case "transit":
        text = formatMinutesDelta(deltas.transitMinutes);
        break;
      case "driving":
        text = formatMinutesDelta(deltas.drivingMinutes);
        break;
      case "flags":
        text = formatFlagsDelta(deltas.flagWarnings, deltas.flagInfos);
        break;
      case "projected-end":
        text = formatProjectedEndDelta(deltas.projectedEndDays);
        break;
      case "route":
        // No single delta for route — display nothing extra
        text = null;
        break;
    }

    if (!text) return null;
    return <DeltaBadge text={text} />;
  }

  return (
    <>
      {/* Mobile: stacked cards (real plan + one card per fork). Desktop keeps the table. */}
      <div className="flex flex-col gap-4 sm:hidden">
        {plans.map((plan, planIndex) => {
          const isReal = planIndex === 0;
          return (
            <div
              key={plan.forkId ?? "real"}
              className="rounded-2xl border border-border bg-card shadow-soft"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {plan.name}
                </span>
                {!isReal && (
                  <div className="flex items-center gap-1 shrink-0">
                    <ReorderArrows
                      planName={plan.name}
                      isFirst={planIndex - 1 === 0}
                      isLast={planIndex === plans.length - 1}
                      onMove={(d) => handleMove(plan.forkId!, d)}
                      pending={reorderPending}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-xs"
                      onClick={() => setPromoteOpenFor(plan.forkId)}
                      aria-label={`Promote ${plan.name}`}
                    >
                      <GitMerge className="mr-1 size-3.5 shrink-0" aria-hidden="true" />
                      Promote
                    </Button>
                  </div>
                )}
              </div>
              <dl className="divide-y divide-border">
                {METRIC_ROWS.map((row) => (
                  <div key={row.id} className="flex items-start justify-between gap-3 px-4 py-2">
                    <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {row.label}
                    </dt>
                    <dd className="flex min-w-0 flex-col items-end gap-1 text-right">
                      {renderCell(plan, row.id)}
                      {!isReal && renderDelta(plan, row.id)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>

      {/* Horizontal-scroll container — wide content stays inside; page never scrolls sideways */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {/* Row-label column header (empty) */}
              <th
                scope="col"
                className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground min-w-[120px]"
              />
              {/* Real plan column */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[200px]"
              >
                {realPlan.name}
              </th>
              {/* Fork columns */}
              {forkPlans.map((plan, forkIndex) => (
                <th
                  key={plan.forkId}
                  scope="col"
                  className="px-4 py-3 text-left min-w-[200px]"
                >
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground min-w-0 truncate">{plan.name}</span>
                      <ReorderArrows
                        planName={plan.name}
                        isFirst={forkIndex === 0}
                        isLast={forkIndex === forkPlans.length - 1}
                        onMove={(d) => handleMove(plan.forkId!, d)}
                        pending={reorderPending}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-fit text-xs"
                      onClick={() => setPromoteOpenFor(plan.forkId)}
                      aria-label={`Promote ${plan.name}`}
                    >
                      <GitMerge className="size-3.5 mr-1" aria-hidden="true" />
                      Promote
                    </Button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((row, rowIndex) => (
              <tr
                key={row.id}
                className={rowIndex % 2 === 0 ? "bg-background" : "bg-muted/20"}
              >
                {/* Row label — sticky on left for wide tables */}
                <td className="sticky left-0 z-10 border-r border-border bg-inherit px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                  {row.label}
                </td>
                {/* Real plan cell */}
                <td className="px-4 py-3 align-top">
                  {renderCell(realPlan, row.id)}
                </td>
                {/* Fork cells */}
                {forkPlans.map((plan) => (
                  <td key={plan.forkId} className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-1.5">
                      {renderCell(plan, row.id)}
                      {renderDelta(plan, row.id)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Promote dialogs — one per fork */}
      {forkPlans.map((plan) => (
        <PromoteForkDialog
          key={plan.forkId}
          forkId={plan.forkId!}
          forkName={plan.name}
          open={promoteOpenFor === plan.forkId}
          onOpenChange={(open) => {
            if (!open) setPromoteOpenFor(null);
          }}
          homeCurrency={trip.homeCurrency}
        />
      ))}
    </>
  );
}
