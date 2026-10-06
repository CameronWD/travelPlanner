"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { OtherCostFormDialog } from "@/components/trip/other-cost-editor";
import type { OtherCostDefaults } from "@/lib/money/other-cost-defaults";

export interface AddCostButtonProps {
  tripId: string;
  homeCurrency: string;
  /** "pill" is the md+ ink pill in PageHeader's actions; "round" the 44px
   * mobile button in its mobileAction slot. */
  variant: "pill" | "round";
  /** Phase-aware starting values (spec 2026-10-06 §K). */
  defaults?: OtherCostDefaults;
}

/** Money's "+ Add a cost" — opens Task 8's OtherCostFormDialog in create mode. */
export function AddCostButton({ tripId, homeCurrency, variant, defaults }: AddCostButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {variant === "pill" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pressable inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border bg-foreground px-[18px] text-sm font-extrabold text-background shadow-cta"
        >
          <Plus className="size-4" strokeWidth={3} aria-hidden="true" />
          Add a cost
        </button>
      ) : (
        <button
          type="button"
          aria-label="Add a cost"
          onClick={() => setOpen(true)}
          className="pressable grid size-11 place-items-center rounded-full border-2 border-border bg-foreground text-background shadow-[3px_3px_0_hsl(var(--coral))]"
        >
          <Plus className="size-5" strokeWidth={3} aria-hidden="true" />
        </button>
      )}
      <OtherCostFormDialog tripId={tripId} homeCurrency={homeCurrency} defaults={defaults} open={open} onOpenChange={setOpen} />
    </>
  );
}
