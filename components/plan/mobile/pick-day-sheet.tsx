"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { dayLoadLabel, dayTag, type DaySlot } from "@/lib/plan/day-density";
import { dayLabelNoMonth } from "./stop-sheet";

/** The Pick-a-day bottom sheet over the stop sheet (PLAN.md §7.3): one row per day with its load. */
export function PickDaySheet({
  open,
  onOpenChange,
  title,
  slots,
  stop,
  onPick,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  title: string;
  slots: DaySlot[];
  stop: { arriveDate: string; departDate: string };
  onPick(dateISO: string): void;
}) {
  const [sel, setSel] = React.useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" aria-describedby={undefined} overlayClassName="bg-foreground/45 backdrop-blur-none">
        <div>
          <p className="text-[13px] font-semibold text-muted-foreground">Pick a day for</p>
          <SheetTitle className="font-display text-2xl">{title}</SheetTitle>
        </div>
        <div role="radiogroup" aria-label="Days" className="flex flex-col gap-2">
          {slots.map((slot) => {
            const d = slot.dateISO;
            const selected = sel === d;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSel(d)}
                className={cn(
                  "pressable flex min-h-[50px] items-center gap-3 rounded-[14px] border-2 border-border px-3.5 text-left",
                  selected ? "bg-teal text-on-accent shadow-hard-1" : "bg-card",
                )}
              >
                <span className="w-16 shrink-0 text-sm font-extrabold">{dayLabelNoMonth(d)}</span>
                <span className="flex-1 text-xs font-semibold">{dayLoadLabel(slot, dayTag(stop, d))}</span>
                {selected && <Check className="size-4" aria-hidden />}
              </button>
            );
          })}
        </div>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!sel}
          onClick={() => {
            onPick(sel!);
            onOpenChange(false);
          }}
        >
          Add to {sel ? dayLabelNoMonth(sel) : "a day"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
