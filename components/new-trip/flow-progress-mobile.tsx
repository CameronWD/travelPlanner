"use client";

import { ArrowLeft, X } from "lucide-react";
import type { Step } from "@/lib/new-trip/draft";
import { cn } from "@/lib/cn";

export function FlowProgressMobile({ step, onBack, disabled }: { step: Step; onBack: () => void; disabled: boolean }) {
  const first = step === 1;
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-[18px] md:hidden">
      <button type="button" onClick={onBack} disabled={disabled} aria-label={first ? "Close" : "Previous step"} className="pressable grid size-11 shrink-0 place-items-center rounded-[14px] border-2 border-border bg-card shadow-hard-1">
        {first ? <X aria-hidden="true" className="size-5" /> : <ArrowLeft aria-hidden="true" className="size-5" />}
      </button>
      <div role="progressbar" aria-label="New trip progress" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} className="grid flex-1 grid-cols-4 gap-[5px]">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            data-segment={n < step ? "done" : n === step ? "current" : "upcoming"}
            className={cn("h-2 rounded-full", n < step && "bg-foreground", n === step && "border-[1.5px] border-border bg-coral", n > step && "bg-muted")}
          />
        ))}
      </div>
      <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums text-muted-foreground">{step} of 4</span>
    </div>
  );
}
