"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RatesPanel, displayRate, type RateEntry } from "@/components/trip/rates-panel";
import { cn } from "@/lib/cn";

/** One rate cell in the Rates strip: fetched, stale, or missing (MONEY.md §6). */
export function RateCell({ tripId, homeCurrency, entry }: { tripId: string; homeCurrency: string; entry: RateEntry }) {
  const [open, setOpen] = React.useState(false);
  const missing = entry.source === "none" || entry.rate == null;
  const stale = entry.source === "stale";
  // A missing rate that gets set pops once; the class stays until the next change (MOTION.md M10).
  const [wasMissing, setWasMissing] = React.useState(missing);
  const [justSet, setJustSet] = React.useState(false);
  if (wasMissing !== missing) {
    setWasMissing(missing);
    setJustSet(!missing);
  }
  const shown = missing ? null : displayRate({ currency: entry.currency, rate: entry.rate! }, homeCurrency);
  const label = shown
    ? shown.inverted
      ? `1 ${shown.from} = ${shown.figure} ${shown.to}${stale ? ", may be out of date" : ""}`
      : `${entry.currency} rate ${shown.figure}${stale ? ", may be out of date" : ""}`
    : `Set a rate for ${entry.currency}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "pressable flex min-h-11 w-full min-w-0 flex-col items-start rounded-[12px] border-2 border-border px-2.5 py-2 text-left text-card-foreground",
            missing ? "border-dashed bg-background" : "bg-card",
            justSet && "tp-pop",
          )}
        >
          <span className="text-[13px] font-extrabold">{shown?.inverted ? `1 ${shown.from} =` : entry.currency}</span>
          <span className="inline-flex min-w-0 max-w-full items-center gap-1">
            <span
              className={cn(
                "min-w-0 max-w-full truncate font-display font-extrabold tabular-nums",
                shown && shown.figure.length > 7 ? "text-[14px]" : "text-[17px]",
                stale && "text-sun-text",
              )}
            >
              {shown ? (shown.inverted ? `${shown.figure} ${shown.to}` : shown.figure) : "Set rate"}
            </span>
            {stale ? <RefreshCw className="size-3.5 text-sun-text" aria-hidden="true" /> : null}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entry.currency} to {homeCurrency}
          </DialogTitle>
        </DialogHeader>
        <RatesPanel tripId={tripId} homeCurrency={homeCurrency} rates={[entry]} />
      </DialogContent>
    </Dialog>
  );
}

/** Collapses its child's height to 0 as it leaves, over 180ms (MOTION.md M10's "left out of totals" line). */
export function CollapsibleLine({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {children ? (
        <m.div key="line" initial={false} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
          {children}
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
