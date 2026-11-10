"use client";

import * as React from "react";
import { useTransition } from "react";
import { setPackingListsOpen } from "@/server/actions/trips";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";

export function PackingListsSwitch({ tripId, open }: { tripId: string; open: boolean }) {
  const [checked, setChecked] = React.useState(open);
  const [isPending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      try {
        const result = await setPackingListsOpen(tripId, next);
        if (!result.success) {
          setChecked(!next);
          toast({ variant: "destructive", title: "Couldn't update packing lists. Try again." });
        }
      } catch {
        setChecked(!next);
        toast({ variant: "destructive", title: "Couldn't update packing lists. Try again." });
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor="packing-lists-open" className="text-sm font-bold text-foreground">
          Open packing lists
        </label>
        <p className="text-[13px] text-muted-foreground">See each other&apos;s packing lists and add to them. Only the owner of a list can tick it off.</p>
      </div>
      <Switch id="packing-lists-open" checked={checked} onCheckedChange={handleToggle} disabled={isPending} />
    </div>
  );
}
