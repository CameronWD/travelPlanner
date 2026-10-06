"use client";

import { useAddParam } from "@/components/navigation/use-add-param";
import { OtherCostFormDialog } from "@/components/trip/other-cost-editor";
import type { OtherCostDefaults } from "@/lib/money/other-cost-defaults";

/** `/budget?add=cost` (the Home's "Add a cost") opens the Other-cost form directly (spec 2026-10-06 §F/§K). */
export function AddCostFromUrl({ tripId, homeCurrency, defaults }: { tripId: string; homeCurrency: string; defaults?: OtherCostDefaults }) {
  const [open, setOpen] = useAddParam("cost");
  return <OtherCostFormDialog tripId={tripId} homeCurrency={homeCurrency} defaults={defaults} open={open} onOpenChange={setOpen} />;
}
