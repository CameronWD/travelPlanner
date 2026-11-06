"use client";

import * as React from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { m } from "motion/react";
import { LayoutMotion } from "@/components/ui/layout-motion";
import { useFieldControl } from "@/components/ui/field";
import { PLACE_FIELD_HINT, usePlaceSuggestions, type PlaceKind, type PlaceSuggestion } from "@/components/places/use-place-suggestions";
import { placesBrowserKey } from "@/lib/map/google-config";
import type { PickedPlace } from "@/lib/picked-place";

export type { PickedPlace } from "@/lib/picked-place";

export interface PlaceComboboxProps {
  value: string;
  onValueChange: (text: string) => void;
  onPick: (p: PickedPlace) => void;
  placeholder?: string;
  /** Bias suggestions toward this point (Plan: the route's centroid). */
  rankNear?: { lat: number; lng: number };
  kind?: PlaceKind;
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
  unavailableHint?: string;
}

export function PlaceCombobox(props: PlaceComboboxProps) {
  const apiKey = placesBrowserKey();
  return apiKey ? (
    <APIProvider apiKey={apiKey} language="en">
      <PlaceField {...props} />
    </APIProvider>
  ) : (
    <PlaceField {...props} />
  );
}

function PlaceField({ value, onValueChange, onPick, placeholder = "Search a town or city", rankNear, kind = "area", autoFocus, id, "aria-label": ariaLabel = "Place", disabled, unavailableHint = PLACE_FIELD_HINT }: PlaceComboboxProps) {
  const listId = React.useId();
  const hintId = React.useId();
  const field = useFieldControl();
  const { available, suggestions, status, search, pick, reset } = usePlaceSuggestions({ kind, near: rankNear });
  // Both are keyed to the suggestion list they were set for, so a fresh list reopens with its first row highlighted.
  const [dismissed, setDismissed] = React.useState<PlaceSuggestion[] | null>(null);
  const [highlight, setHighlight] = React.useState<{ list: PlaceSuggestion[]; index: number } | null>(null);
  const edits = React.useRef(0);
  // Between a pick and its place arriving the list is closed, so a second Enter would otherwise submit the typed text.
  const picking = React.useRef(false);

  const open = dismissed !== suggestions;
  const active = highlight?.list === suggestions ? highlight.index : suggestions.length ? 0 : -1;

  async function choose(s: PlaceSuggestion) {
    const mine = ++edits.current;
    picking.current = true;
    setDismissed(suggestions);
    const place = await pick(s.id);
    if (mine !== edits.current) return;
    picking.current = false;
    if (!place) return;
    onValueChange(place.name);
    onPick(place);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    edits.current++;
    picking.current = false;
    search(next);
    onValueChange(next);
  }

  function move(step: 1 | -1) {
    const n = suggestions.length;
    setDismissed(null);
    setHighlight({ list: suggestions, index: step === 1 ? (active + 1) % n : active <= 0 ? n - 1 : active - 1 });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && picking.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!available) return;
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" && open && suggestions[active]) {
      e.preventDefault();
      e.stopPropagation();
      void choose(suggestions[active]);
    } else if (e.key === "Escape" && open && suggestions.length) {
      e.preventDefault();
      e.stopPropagation();
      setDismissed(suggestions);
    }
  }

  const showList = available && open && suggestions.length > 0;
  const describedBy = [field["aria-describedby"], available ? undefined : hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="shrink-0 overflow-hidden rounded-[18px] border-2 border-border bg-card shadow-hard-2">
      <input
        id={id ?? field.id}
        role={available ? "combobox" : undefined}
        aria-label={ariaLabel}
        aria-invalid={field["aria-invalid"]}
        aria-describedby={describedBy}
        aria-expanded={available ? showList : undefined}
        aria-controls={available ? listId : undefined}
        aria-autocomplete={available ? "list" : undefined}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={reset}
        onBlur={() => setDismissed(suggestions)}
        className="h-[60px] w-full bg-transparent px-5 text-xl font-bold text-foreground caret-coral outline-none placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring"
      />
      {showList ? (
        <>
          <m.ul
            id={listId}
            role="listbox"
            aria-label="Places"
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden border-t-2 border-border"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight({ list: suggestions, index: i })}
                onClick={() => void choose(s)}
                className="relative flex min-h-[52px] cursor-pointer items-center gap-3 px-5 py-2"
              >
                {/* One highlight that slides to the active row (MOTION N10). */}
                {i === active ? (
                  <LayoutMotion>
                    <m.span data-place-hl layoutId={`place-hl-${listId}`} aria-hidden="true" className="absolute inset-0 bg-sun/25" transition={{ duration: 0.18 }} />
                  </LayoutMotion>
                ) : null}
                <span aria-hidden="true" className="relative size-3 shrink-0 rounded-full border-2 border-border bg-sun" />
                <span className="relative min-w-0">
                  <span className="block truncate font-bold">{s.mainText}</span>
                  {s.secondaryText ? <span className="block truncate text-xs text-muted-foreground">{s.secondaryText}</span> : null}
                </span>
              </li>
            ))}
          </m.ul>
          <p translate="no" className="border-t-2 border-border px-5 py-1.5 text-right text-[11px] font-semibold text-muted-foreground">Google Maps</p>
        </>
      ) : null}
      {available && status === "empty" && open ? (
        <p role="status" className="border-t-2 border-border px-5 py-3 text-[13px] font-semibold text-muted-foreground">No places found. Keep typing, or use it as written.</p>
      ) : null}
      {available ? null : (
        <p id={hintId} className="border-t-2 border-border px-5 py-3 text-[13px] font-semibold text-muted-foreground">{unavailableHint}</p>
      )}
    </div>
  );
}
