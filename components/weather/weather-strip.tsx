"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { recordUsageAction } from "@/lib/usage/client";

export function WeatherStrip({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (!open) recordUsageAction("weather-detail-opened");
          setOpen((o) => !o);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border-2 border-border bg-card px-4 text-left text-sm font-extrabold text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0 truncate">{summary}</span>
        <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? children : null}
    </div>
  );
}
