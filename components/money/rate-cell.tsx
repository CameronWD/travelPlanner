"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RatesPanel, formatRate, type RateEntry } from "@/components/trip/rates-panel";
import { cn } from "@/lib/cn";

/** One rate cell in the Rates strip: fetched, stale, or missing (MONEY.md §6). */
export function RateCell({ tripId, homeCurrency, entry }: { tripId: string; homeCurrency: string; entry: RateEntry }) {
  const [open, setOpen] = React.useState(false);
  const missing = entry.source === "none" || entry.rate == null;
  const stale = entry.source === "stale";
  const label = missing
    ? `Set a rate for ${entry.currency}`
    : `${entry.currency} rate ${formatRate(entry.rate!)}${stale ? ", may be out of date" : ""}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "pressable flex min-h-11 w-full flex-col items-start rounded-[12px] border-2 border-border px-2.5 py-2 text-left text-card-foreground",
            missing ? "border-dashed bg-background" : "bg-card",
          )}
        >
          <span className="text-[13px] font-extrabold">{entry.currency}</span>
          <span className="inline-flex items-center gap-1">
            <span className={cn("font-display text-[17px] font-extrabold tabular-nums", stale && "text-sun-text")}>
              {missing ? "Set rate" : formatRate(entry.rate!)}
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
