"use client";

import { CATEGORIES } from "@/lib/categories";
import type { MarkerFilter } from "@/lib/globe-list";
import { Input } from "@/components/ui/input";

export interface MarkerFiltersProps {
  filter: MarkerFilter;
  countries: string[];
  onChange: (f: MarkerFilter) => void;
}

export function MarkerFilters({ filter, countries, onChange }: MarkerFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        placeholder="Search markers…"
        value={filter.query}
        onChange={(e) => onChange({ ...filter, query: e.target.value })}
        className="h-9 min-w-0 flex-1 basis-40 text-sm"
      />
      <select
        value={filter.category ?? ""}
        onChange={(e) =>
          onChange({ ...filter, category: e.target.value || null })
        }
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <option value="">All categories</option>
        {CATEGORIES.map((cat) => (
          <option key={cat.value} value={cat.value}>
            {cat.label}
          </option>
        ))}
      </select>
      <select
        value={filter.country ?? ""}
        onChange={(e) =>
          onChange({ ...filter, country: e.target.value || null })
        }
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <option value="">All countries</option>
        {countries.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
