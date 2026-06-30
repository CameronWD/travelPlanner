"use client";

import * as React from "react";
import { RefreshCw, Lock, Unlock, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { setManualRate, clearManualRate, refreshRates } from "@/server/actions/rates";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateEntry {
  /** Foreign currency code (not home). */
  currency: string;
  /** Current rate: 1 unit of `currency` = `rate` units of home currency. */
  rate: number | null;
  /** Rate source. */
  source: "manual" | "fetched" | "stale" | "none";
  /** Whether the rate is stale (auto-fetched but possibly outdated). */
  stale: boolean;
}

export interface RatesPanelProps {
  tripId: string;
  homeCurrency: string;
  /** Foreign currencies that appear on this trip's costs, with their current rates. */
  rates: RateEntry[];
}

// ---------------------------------------------------------------------------
// Rate formatting — adaptive precision
// ---------------------------------------------------------------------------

/**
 * Format an exchange rate with ~4 significant figures so very small rates
 * (e.g. 0.000012) never render as "0.0000" and large rates aren't over-padded.
 *
 * Uses `Number.toPrecision(4)` and trims trailing zeros, but keeps at least the
 * digits needed to show the value clearly.
 */
export function formatRate(rate: number): string {
  // toPrecision gives us 4 sig figs; parseFloat removes trailing zeros.
  return parseFloat(rate.toPrecision(4)).toString();
}

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

// `stale` is kept in the prop type so callers don't need updating, but the
// display logic now relies solely on `source` (which already encodes staleness).
export function SourceBadge({ source }: { source: RateEntry["source"]; stale?: boolean }) {
  if (source === "manual") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400">
        <Lock className="size-3" aria-hidden="true" />
        Manual
      </span>
    );
  }
  if (source === "fetched") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Live
      </span>
    );
  }
  // Only show "Stale" when the source is explicitly "stale" — not on any
  // other source+stale combination. This prevents a just-fetched rate from
  // being labelled stale if there is any prop mismatch.
  if (source === "stale") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <Clock className="size-3" aria-hidden="true" />
        Stale
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <AlertCircle className="size-3" aria-hidden="true" />
      No rate
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single-rate row
// ---------------------------------------------------------------------------

function RateRow({
  tripId,
  homeCurrency,
  entry,
}: {
  tripId: string;
  homeCurrency: string;
  entry: RateEntry;
}) {
  const [editing, setEditing] = React.useState(false);
  const [rateInput, setRateInput] = React.useState(
    entry.rate !== null ? String(entry.rate) : "",
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSetManual(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(rateInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Please enter a positive number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setManualRate(tripId, entry.currency, homeCurrency, parsed);
      setEditing(false);
    } catch {
      setError("Failed to save rate. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearManual() {
    setSaving(true);
    try {
      await clearManualRate(tripId, entry.currency, homeCurrency);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2.5 bg-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-sm font-semibold">
            {entry.currency}/{homeCurrency}
          </span>
          <SourceBadge source={entry.source} stale={entry.stale} />
        </div>

        <div className="flex items-center gap-1.5">
          {entry.rate !== null ? (
            <span className="font-mono text-sm tabular-nums">
              {formatRate(entry.rate)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          )}

          {/* Manual lock indicator & clear button */}
          {entry.source === "manual" && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              title="Clear manual rate"
              aria-label={`Clear manual rate for ${entry.currency}`}
              onClick={handleClearManual}
              disabled={saving}
            >
              <Unlock className="size-3.5" aria-hidden="true" />
            </Button>
          )}

          {/* Toggle edit form */}
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setRateInput(entry.rate !== null ? String(entry.rate) : "");
                setError(null);
                setEditing(true);
              }}
            >
              Set rate
            </Button>
          )}
        </div>
      </div>

      {/* Inline manual rate form */}
      {editing && (
        <form onSubmit={handleSetManual} className="flex flex-col gap-2">
          <Field
            label={`1 ${entry.currency} =`}
            error={error ?? undefined}
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min="0.000001"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="0.0000"
                disabled={saving}
                invalid={Boolean(error)}
                className="font-mono text-sm"
                aria-label={`Exchange rate: 1 ${entry.currency} to ${homeCurrency}`}
              />
              <span className="text-sm text-muted-foreground shrink-0">{homeCurrency}</span>
            </div>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={saving} className="h-8">
              {saving ? "Saving…" : "Lock rate"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={saving}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

/**
 * Shows exchange rates for all foreign currencies on the trip, with the ability
 * to set/clear manual rates and trigger a bulk refresh.
 */
export function RatesPanel({ tripId, homeCurrency, rates }: RatesPanelProps) {
  const [refreshing, setRefreshing] = React.useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const foreignCurrencies = rates.map((r) => r.currency);
      await refreshRates(tripId, foreignCurrencies, homeCurrency);
    } finally {
      setRefreshing(false);
    }
  }

  if (rates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No foreign currencies on this trip — all costs are in {homeCurrency}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Rates are relative to your home currency ({homeCurrency}).
          Lock a rate manually to freeze it against auto-refresh.
        </p>
        <Button
          variant="outline"
          size="sm"
          className={cn("shrink-0 gap-1.5", refreshing && "opacity-70")}
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh all rates"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden="true" />
          {refreshing ? "Refreshing…" : "Refresh all"}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {rates.map((entry) => (
          <RateRow
            key={entry.currency}
            tripId={tripId}
            homeCurrency={homeCurrency}
            entry={entry}
          />
        ))}
      </div>
    </div>
  );
}
