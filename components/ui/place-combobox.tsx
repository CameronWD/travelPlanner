"use client";

import * as React from "react";
import { m } from "motion/react";
import { LayoutMotion } from "@/components/ui/layout-motion";
import { useFieldControl } from "@/components/ui/field";
import { findPlaces } from "@/server/actions/places";
import { pickedPlaces, type PickedPlace } from "@/lib/picked-place";

export type { PickedPlace } from "@/lib/picked-place";

export interface PlaceComboboxProps {
  value: string;
  onValueChange: (text: string) => void;
  onPick: (p: PickedPlace) => void;
  placeholder?: string;
  /** Sort results nearest-first to this point (Plan: the route's centroid). */
  rankNear?: { lat: number; lng: number };
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
}

const DEBOUNCE_MS = 350;
const MIN_CHARS = 2;

type Status = "idle" | "empty" | "error";

export function PlaceCombobox({ value, onValueChange, onPick, placeholder = "Search a town or city", rankNear, autoFocus, id, "aria-label": ariaLabel = "Place", disabled }: PlaceComboboxProps) {
  const listId = React.useId();
  const field = useFieldControl();
  const [results, setResults] = React.useState<PickedPlace[]>([]);
  const [status, setStatus] = React.useState<Status>("idle");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const seq = React.useRef(0);
  // The value it mounts with is settled (an existing Stop's name, spec 2026-10-06 §L) — not searched.
  const pickedValue = React.useRef<string | null>(value.trim() || null);
  const rankNearRef = React.useRef(rankNear);
  React.useEffect(() => {
    rankNearRef.current = rankNear;
  });

  React.useEffect(() => {
    const q = value.trim();
    if (q.length < MIN_CHARS || q === pickedValue.current) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const res = await findPlaces(q);
      if (mine !== seq.current) return;
      if (res.status === "error") {
        setResults([]);
        setStatus("error");
        setOpen(false);
        return;
      }
      const list = pickedPlaces(res.candidates, rankNearRef.current).slice(0, 5);
      setResults(list);
      setActive(list.length ? 0 : -1);
      setStatus(list.length ? "idle" : "empty");
      setOpen(true);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  function pick(p: PickedPlace) {
    pickedValue.current = p.name;
    seq.current++;
    onValueChange(p.name);
    onPick(p);
    setOpen(false);
    setResults([]);
    setStatus("idle");
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    pickedValue.current = null;
    if (next.trim().length < MIN_CHARS) {
      seq.current++;
      setOpen(false);
      setResults([]);
      setStatus("idle");
    }
    onValueChange(next);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      e.stopPropagation();
      pick(results[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  const showList = open && results.length > 0;
  return (
    <div className="overflow-hidden rounded-[18px] border-2 border-border bg-card shadow-hard-2">
      <input
        id={id ?? field.id}
        role="combobox"
        aria-label={ariaLabel}
        aria-invalid={field["aria-invalid"]}
        aria-describedby={field["aria-describedby"]}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className="h-[60px] w-full bg-transparent px-5 text-xl font-bold text-foreground caret-coral outline-none placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring"
      />
      {showList ? (
        <m.ul
          id={listId}
          role="listbox"
          aria-label="Places"
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          className="overflow-hidden border-t-2 border-border"
        >
          {results.map((p, i) => (
            <li
              key={`${p.name}|${p.region ?? ""}|${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(p)}
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
                <span className="block truncate font-bold">{p.name}</span>
                {p.region ? <span className="block truncate text-xs text-muted-foreground">{p.region}</span> : null}
              </span>
            </li>
          ))}
        </m.ul>
      ) : null}
      {status === "empty" && open ? (
        <p role="status" className="border-t-2 border-border px-5 py-3 text-[13px] font-semibold text-muted-foreground">No places found. Keep typing, or use it as written.</p>
      ) : null}
      {status === "error" ? (
        <p role="status" className="border-t-2 border-border px-5 py-3 text-[13px] font-semibold text-muted-foreground">Place search isn&apos;t available right now. We&apos;ll use what you typed.</p>
      ) : null}
    </div>
  );
}
