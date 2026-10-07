"use client";

import type { Route } from "next";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { m } from "motion/react";
import { LayoutMotion } from "@/components/ui/layout-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import type { BreakdownBy } from "@/lib/money/breakdown";

/** The Category · Place · Chapter · Day switch (MONEY.md §5): a segmented control from md, a phone select below it. */
export function BreakdownSwitch({
  value,
  options,
}: {
  value: BreakdownBy;
  options: { value: BreakdownBy; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // The pill slides on click (MOTION.md M6), not when the server's ?by= lands.
  const [shown, setShown] = React.useOptimistic(value);

  function choose(v: string) {
    if (!v || v === shown) return;
    const next = new URLSearchParams(params.toString());
    if (v === "category") next.delete("by");
    else next.set("by", v);
    const qs = next.toString();
    React.startTransition(() => {
      setShown(v as BreakdownBy);
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
    });
  }

  return (
    <>
      <Segmented
        type="single"
        tone="ink"
        value={shown}
        onValueChange={choose}
        aria-label="Group by"
        className="hidden gap-0 overflow-hidden border-border p-0 md:inline-flex"
      >
        {options.map((o) => (
          <SegmentedItem
            key={o.value}
            value={o.value}
            // The ink pill is a shared layoutId that slides between items (MOTION.md M6); the
            // label colour swaps at the slide's midpoint.
            className="isolate h-9 rounded-none border-0 border-r-2 border-border px-3.5 transition-colors delay-[90ms] duration-[90ms] last:border-r-0 motion-reduce:delay-0 data-[state=on]:bg-transparent data-[state=on]:text-primary-foreground pointer-coarse:h-11"
          >
            {o.value === shown ? (
              <LayoutMotion>
                <m.span
                  data-slot="by-pill"
                  layoutId="by-pill"
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 bg-primary"
                  transition={{ duration: 0.18 }}
                />
              </LayoutMotion>
            ) : null}
            {o.label}
          </SegmentedItem>
        ))}
      </Segmented>
      <div className="relative md:hidden">
        <select
          aria-label="Group by"
          value={shown}
          onChange={(e) => choose(e.target.value)}
          className="h-11 appearance-none rounded-full border-2 border-border bg-card pl-4 pr-9 text-[13px] font-extrabold text-card-foreground"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" aria-hidden="true" />
      </div>
    </>
  );
}
