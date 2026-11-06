"use client";

import * as React from "react";
import { useTransition } from "react";
import { setWhatsAroundEnabled } from "@/server/actions/trips";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";

export function WhatsAroundSwitch({ tripId, enabled }: { tripId: string; enabled: boolean }) {
  const [checked, setChecked] = React.useState(enabled);
  const [isPending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      try {
        const result = await setWhatsAroundEnabled(tripId, next);
        if (!result.success) {
          setChecked(!next);
          toast({ variant: "destructive", title: "Couldn't update What's around. Try again." });
        }
      } catch {
        setChecked(!next);
        toast({ variant: "destructive", title: "Couldn't update What's around. Try again." });
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor="whats-around-enabled" className="text-sm font-bold text-foreground">
          Show What&apos;s around
        </label>
        <p className="text-[13px] text-muted-foreground">Show places near where you&apos;re staying, from Google Maps.</p>
      </div>
      <Switch id="whats-around-enabled" checked={checked} onCheckedChange={handleToggle} disabled={isPending} />
    </div>
  );
}
