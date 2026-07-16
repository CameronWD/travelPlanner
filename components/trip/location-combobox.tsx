"use client";

import { useState, useTransition } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchPlacesAction } from "@/server/actions/transport";
import type { GeoCandidate } from "@/lib/geocode";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type LocationValue =
  | { kind: "none" }
  | { kind: "home" }
  | { kind: "stop"; stopId: string; name: string }
  | { kind: "place"; name: string };

export interface LocationComboboxProps {
  label: string;
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  stops: { id: string; name: string }[];
  homeBaseName?: string | null;
  tripId: string;
  disabled?: boolean;
  "data-testid"?: string;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function displayText(value: LocationValue, homeBaseName?: string | null): string {
  switch (value.kind) {
    case "none":
      return "— none —";
    case "home":
      return `🏠 ${homeBaseName ?? "Home"}`;
    case "stop":
      return value.name;
    case "place":
      return value.name;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LocationCombobox({
  label,
  value,
  onChange,
  stops,
  homeBaseName,
  tripId,
  disabled,
  "data-testid": testId,
}: LocationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<GeoCandidate[]>([]);
  const [searchPending, startSearchTransition] = useTransition();

  const currentDisplay = displayText(value, homeBaseName);

  // Filter quick options by query
  const lowerQuery = query.toLowerCase();
  const filteredStops = query
    ? stops.filter((s) => s.name.toLowerCase().includes(lowerQuery))
    : stops;

  const select = (next: LocationValue) => {
    onChange(next);
    setOpen(false);
    setQuery("");
    setCandidates([]);
  };

  const runSearch = () => {
    const q = query.trim();
    if (q.length < 2) return;
    startSearchTransition(async () => {
      const res = await searchPlacesAction(tripId, q);
      if (res.status === "ok") {
        setCandidates(res.candidates);
      } else {
        setCandidates([]);
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) {
        setQuery("");
        setCandidates([]);
      }
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={`${label}: ${currentDisplay}`}
          data-testid={testId}
        >
          {label}: {currentDisplay}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-3">
        <div className="flex flex-col gap-2">
          {/* Search input */}
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCandidates([]);
            }}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Type to filter or search…"
            disabled={disabled}
          />

          {/* Quick options */}
          <ul className="flex flex-col gap-0.5">
            {/* None option */}
            <li>
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted text-muted-foreground"
                onClick={() => select({ kind: "none" })}
              >
                — none —
              </button>
            </li>

            {/* Home option */}
            {homeBaseName && (
              <li>
                <button
                  type="button"
                  className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => select({ kind: "home" })}
                >
                  🏠 {homeBaseName}
                </button>
              </li>
            )}

            {/* Stops */}
            {filteredStops.map((stop) => (
              <li key={stop.id}>
                <button
                  type="button"
                  className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => select({ kind: "stop", stopId: stop.id, name: stop.name })}
                >
                  {stop.name}
                </button>
              </li>
            ))}
          </ul>

          {/* Search button (shown when query ≥ 2 chars) */}
          {query.trim().length >= 2 && (
            <Button
              type="button"
              variant="outline"
              onClick={runSearch}
              disabled={searchPending || disabled}
              className="w-full"
            >
              Search &ldquo;{query.trim()}&rdquo;
            </Button>
          )}

          {/* Candidate results */}
          {candidates.length > 0 && (
            <ul className="flex flex-col gap-0.5 rounded-lg border border-border bg-card p-1 max-h-48 overflow-y-auto">
              {candidates.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => select({ kind: "place", name: c.name })}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
