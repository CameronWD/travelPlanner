"use client";

import { ChevronDown } from "lucide-react";
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

  function choose(v: string) {
    if (!v || v === value) return;
    const next = new URLSearchParams(params.toString());
    if (v === "category") next.delete("by");
    else next.set("by", v);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <>
      <Segmented
        type="single"
        tone="ink"
        value={value}
        onValueChange={choose}
        aria-label="Group by"
        className="hidden gap-0 overflow-hidden border-border p-0 md:inline-flex"
      >
        {options.map((o) => (
          <SegmentedItem
            key={o.value}
            value={o.value}
            className="h-9 rounded-none border-0 border-r-2 border-border px-3.5 last:border-r-0 pointer-coarse:h-11"
          >
            {o.label}
          </SegmentedItem>
        ))}
      </Segmented>
      <div className="relative md:hidden">
        <select
          aria-label="Group by"
          value={value}
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
