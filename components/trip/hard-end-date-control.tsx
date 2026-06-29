"use client";

import * as React from "react";
import { useTransition } from "react";
import { CalendarClock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { setTripHardEndDate } from "@/server/actions/trips";
import { toast } from "@/components/ui/use-toast";

interface HardEndDateControlProps {
  tripId: string;
  hardEndDate: string | null;
  /** Trip start date — lower bound for the picker. */
  startDate: string | null;
}

/**
 * Inline set / edit / clear control for a trip's Hard end date, shown on the
 * Plan overview. Writes via setTripHardEndDate; the page revalidates on success.
 */
export function HardEndDateControl({ tripId, hardEndDate, startDate }: HardEndDateControlProps) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(hardEndDate ?? "");
  const [isPending, startTransition] = useTransition();

  React.useEffect(() => {
    if (!editing) setValue(hardEndDate ?? "");
  }, [hardEndDate, editing]);

  function commit(next: string | null) {
    startTransition(async () => {
      const r = await setTripHardEndDate(tripId, next);
      if (!r.success) {
        toast({ variant: "destructive", title: r.error });
      } else {
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return hardEndDate ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit hard end date (${hardEndDate})`}
        className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
      >
        {hardEndDate}
        <Pencil className="size-3 text-muted-foreground" aria-hidden="true" />
      </button>
    ) : (
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
        <CalendarClock className="size-3.5" aria-hidden="true" />
        Set hard end date
      </Button>
    );
  }

  return (
    <div role="group" aria-label="Hard end date" className="flex items-end gap-2">
      <DateField
        label="Hard end date"
        value={value}
        min={startDate ?? undefined}
        onChange={(e) => setValue(e.target.value)}
        disabled={isPending}
      />
      <Button
        size="sm"
        variant="primary"
        loading={isPending}
        disabled={isPending || value === "" || value === (hardEndDate ?? "")}
        onClick={() => commit(value)}
      >
        Save
      </Button>
      {hardEndDate && (
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => commit(null)}>
          Clear
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => { setEditing(false); setValue(hardEndDate ?? ""); }}>
        Cancel
      </Button>
    </div>
  );
}
