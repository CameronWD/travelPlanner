"use client";

import { Search } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import type { MarkerFilter } from "@/lib/globe-list";
import { categoryAccent } from "@/components/trip/category-pill";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

export interface MarkerFiltersProps {
  filter: MarkerFilter;
  countries: string[];
  onChange: (f: MarkerFilter) => void;
}

/** 28px kit Chip, 44px hit area on touch (same as the Wishlist filter chips). */
const CHIP_TOUCH = "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']";

/** Kit Globe list header: the "Search places" field, then country + category filters as kit Chips. */
export function MarkerFilters({ filter, countries, onChange }: MarkerFiltersProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-foreground"
          strokeWidth={2.5}
          aria-hidden="true"
        />
        <Input
          className="pl-11"
          placeholder="Search places"
          aria-label="Search the globe"
          value={filter.query}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
        />
      </div>

      <select
        aria-label="Country"
        value={filter.country ?? ""}
        onChange={(e) => onChange({ ...filter, country: e.target.value || null })}
        className="h-11 w-full rounded-md border-2 border-input bg-card px-3.5 text-base font-semibold text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-[13px]"
      >
        <option value="">All countries</option>
        {countries.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-1.5">
        <Chip
          tone={!filter.category ? "ink" : "white"}
          selected={!filter.category}
          onClick={() => onChange({ ...filter, category: null })}
          className={CHIP_TOUCH}
        >
          All
        </Chip>
        {CATEGORIES.map((cat) => {
          const on = filter.category === cat.value;
          return (
            <Chip
              key={cat.value}
              tone={on ? "ink" : "white"}
              selected={on}
              onClick={() => onChange({ ...filter, category: cat.value })}
              className={CHIP_TOUCH}
            >
              <span aria-hidden="true" className={cn("size-2.5 rounded-full", categoryAccent(cat.value).dot)} />
              {cat.label}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
