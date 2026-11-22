"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { AnimatePresence, m, useReducedMotion, useTransform } from "motion/react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RatesPanel, displayRate, formatRate, type RateEntry } from "@/components/trip/rates-panel";
import { cn } from "@/lib/cn";
import { useTween } from "./use-tween";

export function rateFigureFontSize(n: number): string {
  return `clamp(9px, calc(100cqw / ${Number((n * 0.62).toFixed(2))}), 17px)`;
}

/** One rate cell in the Rates strip: fetched, stale, or missing (MONEY.md §6). */
export function RateCell({ tripId, homeCurrency, entry }: { tripId: string; homeCurrency: string; entry: RateEntry }) {
  const [open, setOpen] = React.useState(false);
  const missing = entry.source === "none" || entry.rate == null;
  const stale = entry.source === "stale";
  // A missing rate that gets set pops once; the class stays until the next change (MOTION.md M10).
  const [wasMissing, setWasMissing] = React.useState(missing);
  const [justSet, setJustSet] = React.useState(false);
  const [prevRate, setPrevRate] = React.useState(entry.rate);
  if (wasMissing !== missing) {
    setWasMissing(missing);
    setJustSet(!missing);
  }
  if (prevRate !== entry.rate) {
    setPrevRate(entry.rate);
    if (prevRate != null && entry.rate != null) setJustSet(true);
  }
  const shown = missing ? null : displayRate({ currency: entry.currency, rate: entry.rate! }, homeCurrency);
  const reduce = useReducedMotion() === true;
  const figureValue = shown ? (shown.inverted ? 1 / entry.rate! : entry.rate!) : 0;
  const mv = useTween(figureValue, { duration: 0.4, skip: reduce });
  const figureText = useTransform(mv, (v) => formatRate(v));
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
            justSet && "tp-pop motion-reduce:animate-none",
          )}
          onAnimationEnd={() => setJustSet(false)}
        >
          <span className="text-[13px] font-extrabold">{shown?.inverted ? `1 ${shown.from} =` : entry.currency}</span>
          <span className="@container w-full min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-1">
              <m.span
                data-testid="rate-figure"
                className={cn("whitespace-nowrap font-display font-extrabold tabular-nums", stale && "text-sun-text")}
                style={{ fontSize: rateFigureFontSize(shown ? shown.figure.length : "Set rate".length) }}
              >
                {shown ? figureText : "Set rate"}
              </m.span>
              {shown?.inverted ? <span className="text-[12px] font-bold text-muted-foreground">{shown.to}</span> : null}
              {stale ? <RefreshCw className="size-3.5 text-sun-text" aria-hidden="true" /> : null}
            </span>
          </span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {shown?.inverted ? `${homeCurrency} to ${entry.currency}` : `${entry.currency} to ${homeCurrency}`}
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
