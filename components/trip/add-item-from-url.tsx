"use client";

import { useAddParam } from "@/components/navigation/use-add-param";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";

/** `/wishlist?add=item` (Search's "Add Item") opens the Item form as a new idea (spec 2026-10-06 §F). */
export function AddItemFromUrl({
  tripId,
  stops,
  tripStartDate,
  homeCurrency,
}: {
  tripId: string;
  stops: StopOption[];
  tripStartDate?: string | null;
  homeCurrency: string;
}) {
  const [open, setOpen] = useAddParam("item");
  return (
    <ItemFormDialog
      tripId={tripId}
      stops={stops}
      tripStartDate={tripStartDate ?? undefined}
      defaultUnscheduled
      open={open}
      onOpenChange={setOpen}
      homeCurrency={homeCurrency}
    />
  );
}
