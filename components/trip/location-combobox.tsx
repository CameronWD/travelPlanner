"use client";

import { useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLACE_FIELD_HINT, usePlaceSuggestions } from "@/components/places/use-place-suggestions";
import { placesBrowserKey } from "@/lib/map/google-config";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type LocationValue =
  | { kind: "none" }
  | { kind: "home" }
  | { kind: "stop"; stopId: string; name: string }
  | { kind: "place"; name: string; placeId?: string; lat?: number; lng?: number; countryCode?: string; region?: string };

export interface LocationComboboxProps {
  label: string;
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  stops: { id: string; name: string }[];
  homeBaseName?: string | null;
  disabled?: boolean;
  "data-testid"?: string;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function displayText(value: LocationValue, homeBaseName?: string | null): string {
  switch (value.kind) {
    case "none":
      return "None";
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
  disabled,
  "data-testid": testId,
}: LocationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const apiKey = placesBrowserKey();

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
  };

  const optionProps: OptionsProps = { query, setQuery, stops, filteredStops, homeBaseName, disabled, select };

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) setQuery("");
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
        {apiKey ? (
          <APIProvider apiKey={apiKey} language="en">
            <LocationOptions {...optionProps} />
          </APIProvider>
        ) : (
          <LocationOptions {...optionProps} />
        )}
      </PopoverContent>
    </Popover>
  );
}

interface OptionsProps {
  query: string;
  setQuery: (q: string) => void;
  stops: { id: string; name: string }[];
  filteredStops: { id: string; name: string }[];
  homeBaseName?: string | null;
  disabled?: boolean;
  select: (v: LocationValue) => void;
}

function LocationOptions({ query, setQuery, filteredStops, homeBaseName, disabled, select }: OptionsProps) {
  const { available, suggestions, search, pick, reset } = usePlaceSuggestions({ kind: "any" });
  const typed = query.trim();

  async function choose(id: string) {
    const place = await pick(id);
    if (place) select({ kind: "place", name: place.name, placeId: place.placeId, lat: place.lat, lng: place.lng, countryCode: place.countryCode, region: place.region });
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
        onFocus={reset}
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
            None
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


      {typed && (
        <Button type="button" variant="outline" onClick={() => select({ kind: "place", name: typed })} className="w-full">
          Use &ldquo;{typed}&rdquo; as a place
        </Button>
      )}

      {available && suggestions.length > 0 && (
        <>
          <ul aria-label="Places" className="flex flex-col gap-0.5 rounded-lg border border-border bg-card p-1 max-h-48 overflow-y-auto">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => void choose(s.id)}>
                  <span className="block truncate font-bold">{s.mainText}</span>
                  {s.secondaryText ? <span className="block truncate text-xs text-muted-foreground">{s.secondaryText}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <p translate="no" className="text-right text-[11px] font-semibold text-muted-foreground">Google Maps</p>
        </>
      )}
      {available ? null : <p className="text-[13px] font-semibold text-muted-foreground">{PLACE_FIELD_HINT}</p>}
    </div>
  );
}
