"use client";

import { Search } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import type { MarkerFilter } from "@/lib/globe-list";
import { categoryAccent } from "@/components/trip/category-pill";
import { cn } from "@/lib/cn";

export interface MarkerFiltersProps {
  filter: MarkerFilter;
  countries: string[];
  onChange: (f: MarkerFilter) => void;
}

export function MarkerFilters({ filter, countries, onChange }: MarkerFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: pill search + country select */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-card px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder="Search places"
            value={filter.query}
            onChange={(e) => onChange({ ...filter, query: e.target.value })}
          />
        </div>
        <select
          value={filter.country ?? ""}
          onChange={(e) =>
            onChange({ ...filter, country: e.target.value || null })
          }
          className="rounded-full border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Row 2: category chips */}
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        <button
          onClick={() => onChange({ ...filter, category: null })}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-bold",
            !filter.category
              ? "bg-foreground text-background"
              : "border border-border bg-card text-muted-foreground",
          )}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => onChange({ ...filter, category: cat.value })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              filter.category === cat.value
                ? "bg-foreground text-background"
                : "border border-border bg-card text-foreground",
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", categoryAccent(cat.value).dot)}
              aria-hidden
            />
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
