"use client";

import * as React from "react";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { isOnTrip, type CostSettlement } from "@/lib/enums";

export interface SettlementChoiceProps {
  /** CONTEXT.md "Settlement" — anything but ON_TRIP shows as Before you go. */
  value: string | null | undefined;
  onChange: (v: CostSettlement) => void;
  disabled?: boolean;
}

/**
 * The two-way Settlement choice on a Cost (CONTEXT.md "Settlement"): paid
 * before you go or on the trip. A plain choice, never derived from dates.
 * Shared by InlineCostFields (entity costs) and OtherCostEditor.
 */
export function SettlementChoice({ value, onChange, disabled }: SettlementChoiceProps) {
  return (
    <Segmented
      type="single"
      tone="ink"
      value={isOnTrip(value) ? "ON_TRIP" : "BEFORE"}
      onValueChange={(v) => {
        if (v) onChange(v as CostSettlement);
      }}
      aria-label="When it's paid"
      disabled={disabled}
      className="self-start flex-wrap"
    >
      <SegmentedItem value="BEFORE">Paid before you go</SegmentedItem>
      <SegmentedItem value="ON_TRIP">Paid on the trip</SegmentedItem>
    </Segmented>
  );
}
