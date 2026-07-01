"use client";

import * as React from "react";
import { GitMerge } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { diffMetrics } from "@/lib/compare";
import type { ComparisonPlan } from "@/server/actions/forks";
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
        <div key={i} className="flex items-baseline gap-1 text-sm">
          <span className="font-medium text-foreground">{stop.name}</span>
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
        <p className="text-xs text-muted-foreground mt-1">
          {countries.join(" · ")}
        </p>
      )}
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
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      ].join(" ")}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CompareTable({ trip, plans, discreet = false }: CompareTableProps) {
  const [promoteOpenFor, setPromoteOpenFor] = React.useState<string | null>(null);

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
        return <RouteCell plan={plan} />;
      case "projected-end":
        return (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-sm text-foreground">
              {m.projectedEnd ?? "—"}
            </span>
            <Badge variant={hardEndBadgeVariant(m.hardEndState)} className="w-fit text-xs">
              {hardEndLabel(m.hardEndState)}
            </Badge>
          </div>
        );
      case "budget":
        return (
          <span className="font-mono text-sm text-foreground">
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
        return <span className="font-mono text-sm text-foreground">{m.stopCount}</span>;
      case "nights":
        return <span className="font-mono text-sm text-foreground">{m.nightTotal}</span>;
      case "transit":
        return (
          <span className="font-mono text-sm text-foreground">
            {formatMinutes(m.transitMinutes)}
          </span>
        );
      case "driving":
        return (
          <span className="font-mono text-sm text-foreground">
            {formatMinutes(m.drivingMinutes)}
          </span>
        );
      case "flights":
        return <span className="font-mono text-sm text-foreground">{m.flightCount}</span>;
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
      {/* Horizontal-scroll container — wide content stays inside; page never scrolls sideways */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
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
              {forkPlans.map((plan) => (
                <th
                  key={plan.forkId}
                  scope="col"
                  className="px-4 py-3 text-left min-w-[200px]"
                >
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {plan.name}
                    </span>
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
