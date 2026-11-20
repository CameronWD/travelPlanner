"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
import { setHopMode } from "@/server/actions/hop-modes";
import type { HopModeChoice } from "@/lib/travel-times/hops";

const HOP_MODE_LABEL: Record<HopModeChoice, string> = { WALK: "Walk", TRANSIT: "Public transport", DRIVE: "Drive" };
const OPTIONS: { value: HopModeChoice | null; label: string }[] = [
  { value: null, label: "Automatic" },
  { value: "WALK", label: HOP_MODE_LABEL.WALK },
  { value: "TRANSIT", label: HOP_MODE_LABEL.TRANSIT },
  { value: "DRIVE", label: HOP_MODE_LABEL.DRIVE },
];

export interface HopModeChooserProps {
  fromItemId: string;
  toItemId: string;
  mode: HopModeChoice;
  modeSetByHand: boolean;
}

export function HopModeChooser({ fromItemId, toItemId, mode, modeSetByHand }: HopModeChooserProps) {
  const [isPending, startTransition] = React.useTransition();
  const current = modeSetByHand ? mode : null;

  function choose(next: HopModeChoice | null) {
    if (next === current) return;
    startTransition(async () => {
      try {
        const r = await setHopMode(fromItemId, toItemId, next);
        if (!r.success) toastRefused(r, "Couldn’t change how that hop is travelled.");
      } catch {
        toastRejected("Couldn’t change how that hop is travelled.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        aria-label={`How this hop is travelled: ${current ? HOP_MODE_LABEL[current] : "Automatic"}`}
        className="tap-target inline-flex shrink-0 items-center gap-1 rounded-md border-2 border-border bg-card px-2 py-0.5 text-xs font-bold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        {current ? HOP_MODE_LABEL[current] : "Automatic"}
        <ChevronDown className="size-3" strokeWidth={2.5} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.label} onSelect={() => choose(o.value)} aria-current={o.value === current ? "true" : undefined}>
            <span className="w-4">{o.value === current ? <Check className="size-4" aria-hidden /> : null}</span>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
