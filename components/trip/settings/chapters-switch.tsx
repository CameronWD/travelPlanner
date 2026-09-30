"use client";

import * as React from "react";
import { useTransition } from "react";
import { setChaptersEnabled } from "@/server/actions/trips";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";

/**
 * The one place a Trip's chapters get turned on or off (Cam's decision,
 * 2026-09-30 — spec §D9). The Plan header used to carry this toggle too;
 * Task 16 removed it there, so Settings is now the only surface.
 *
 * Optimistic: flips immediately, rolls back and toasts on failure. Success
 * relies on setChaptersEnabled's own revalidatePath to refresh the page (and,
 * when turning chapters on, to bring in the self-healed Chapters card below).
 */
export function ChaptersSwitch({ tripId, enabled }: { tripId: string; enabled: boolean }) {
  const [checked, setChecked] = React.useState(enabled);
  const [isPending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const result = await setChaptersEnabled(tripId, next);
      if (!result.success) {
        setChecked(!next);
        toast({ variant: "destructive", title: "Couldn't update chapters. Try again." });
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor="chapters-enabled" className="text-sm font-bold text-foreground">
          Group this trip into chapters
        </label>
        <p className="text-[13px] text-muted-foreground">
          Name stretches of the trip, like “the Italy chapter”. Turning this
          off hides them; nothing is deleted.
        </p>
      </div>
      <Switch id="chapters-enabled" checked={checked} onCheckedChange={handleToggle} disabled={isPending} />
    </div>
  );
}
