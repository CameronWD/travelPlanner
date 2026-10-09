"use client";

import type { Route } from "next";
import * as React from "react";
import { useAppRouter } from "@/components/navigation/use-app-router";
import { MapPin, Package, Train, Building2, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/components/ui/use-online-status";
import { searchTrip, listMyTrips } from "@/server/actions/search";
import type { SearchHit } from "@/server/actions/search";
import { useTripSlug } from "@/components/trip/use-trip-href";
import { OPEN_SHARE_EVENT } from "@/components/trip/share-events";
import { tripPath } from "@/lib/trip-path";
import { cn } from "@/lib/cn";

/**
 * The Search results model (CONTEXT.md "Search"): three groups — Go to, Do,
 * Find — shared by the full-screen palette dialog and the sidebar's inline
 * field, so both offer exactly the same destinations and actions.
 */

// ── Model ─────────────────────────────────────────────────────────────────────

export interface CommandItem {
  /** Stable key, unique across all groups. */
  key: string;
  label: string;
  /** Muted lead-in shown before the label, e.g. "Switch →". */
  prefix?: string;
  /** Where the command navigates. */
  href?: Route;
  /** A window event to dispatch instead of navigating (e.g. open the Share chooser). */
  event?: string;
  hit?: SearchHit;
}

interface CommandGroup {
  id: "goto" | "do" | "find";
  label: "Go to" | "Do" | "Find";
  items: CommandItem[];
  /** A non-selectable line under the heading (offline, empty, no results). */
  notice?: { text: string; offline?: boolean };
}

function tripPages(tripRef: string): Array<{ label: string; href: Route }> {
  return [
    { label: "Home", href: tripPath(tripRef) },
    { label: "Plan", href: tripPath(tripRef, "/plan") },
    { label: "Days", href: tripPath(tripRef, "/day") },
    { label: "Calendar", href: tripPath(tripRef, "/calendar") },
    { label: "Wishlist", href: tripPath(tripRef, "/wishlist") },
    { label: "Money", href: tripPath(tripRef, "/budget") },
    { label: "Summary", href: tripPath(tripRef, "/summary") },
    { label: "Checklists", href: tripPath(tripRef, "/checklists") },
    { label: "Files", href: tripPath(tripRef, "/files") },
    { label: "Journal", href: tripPath(tripRef, "/journal") },
    { label: "Activity", href: tripPath(tripRef, "/activity") },
    { label: "Settings", href: tripPath(tripRef, "/settings") },
  ];
}

export interface UseCommandResultsOptions {
  /**
   * Whether the surface is showing. Trips load (and reload) each time this
   * turns true, and no search runs while it is false. Default true.
   */
  enabled?: boolean;
  /**
   * Show the Find group before anything is typed ("Type to search this
   * trip…"). The dialog does; the inline field shows only Go to and Do until
   * you type. Default true.
   */
  findWhenEmpty?: boolean;
}

export interface CommandResults {
  groups: CommandGroup[];
  /** Every selectable item, in display order — index = option position. */
  options: CommandItem[];
}

export function useCommandResults(
  query: string,
  tripId: string | null,
  { enabled = true, findWhenEmpty = true }: UseCommandResultsOptions = {},
): CommandResults {
  const isOnline = useOnlineStatus();
  const tripRef = useTripSlug(tripId ?? "");
  const [myTrips, setMyTrips] = React.useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  // Stale-guard: the query for which the latest search started.
  const latestQueryRef = React.useRef<string>("");

  // ── Trips, loaded each time the surface opens ───────────────────────────────
  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    listMyTrips()
      .then((trips) => {
        if (live) setMyTrips(trips);
      })
      .catch(() => {/* silent — non-critical */});
    return () => {
      live = false;
    };
  }, [enabled]);

  // ── Debounced Find ──────────────────────────────────────────────────────────
  // setHits only runs in the async callback, never synchronously in the body.
  const trimmed = query.trim();
  React.useEffect(() => {
    if (!enabled || !tripId || !trimmed || !isOnline) return;

    latestQueryRef.current = trimmed;
    const captured = trimmed;
    const timer = setTimeout(async () => {
      try {
        const results = await searchTrip(tripId, captured);
        if (latestQueryRef.current === captured) setHits(results);
      } catch {
        // Silent — search is best-effort.
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [enabled, trimmed, tripId, isOnline]);

  return React.useMemo(() => {
    const q = query.toLowerCase();
    const groups: CommandGroup[] = [];

    const gotoItems: CommandItem[] = [
      ...(tripId
        ? tripPages(tripRef)
            .filter(({ label }) => label.toLowerCase().includes(q))
            .map(({ label, href }) => ({ key: `page:${href}`, label, href }))
        : []),
      ...myTrips
        .filter(({ id, name }) => id !== tripId && name.toLowerCase().includes(q))
        .map(({ id, name, slug }) => ({
          key: `trip:${id}`,
          label: name,
          prefix: "Switch →",
          href: tripPath(slug),
        })),
    ];
    if (gotoItems.length > 0) groups.push({ id: "goto", label: "Go to", items: gotoItems });

    const doCandidates: CommandItem[] = [
      { key: "do:globe", label: "Globe", href: "/globe" },
      { key: "do:new-trip", label: "New trip", href: "/trips/new" },
      ...(tripId
        ? [
            { key: "do:add-item", label: "Add Item", href: tripPath(tripRef, "/wishlist?add=item") },
            { key: "do:add-stop", label: "Add stop", href: tripPath(tripRef, "/plan?add=stop") },
            { key: "do:share", label: "Share", event: OPEN_SHARE_EVENT },
          ]
        : []),
    ];
    const doItems = doCandidates.filter(({ label }) => label.toLowerCase().includes(q));
    if (doItems.length > 0) groups.push({ id: "do", label: "Do", items: doItems });

    // Find: the current Trip's real plan only — so only inside a Trip.
    if (tripId && (findWhenEmpty || trimmed !== "")) {
      if (!isOnline) {
        groups.push({
          id: "find",
          label: "Find",
          items: [],
          notice: { text: "Search needs a connection.", offline: true },
        });
      } else if (trimmed === "") {
        groups.push({ id: "find", label: "Find", items: [], notice: { text: "Type to search this trip…" } });
      } else if (hits.length === 0) {
        groups.push({
          id: "find",
          label: "Find",
          items: [],
          notice: { text: `No results for “${trimmed}”` },
        });
      } else {
        groups.push({
          id: "find",
          label: "Find",
          items: hits.map((hit) => ({ key: `hit:${hit.type}:${hit.id}`, label: hit.label, href: hit.href, hit })),
        });
      }
    }

    return { groups, options: groups.flatMap((g) => g.items) };
  }, [query, trimmed, tripId, tripRef, myTrips, hits, isOnline, findWhenEmpty]);
}

/** Runs a command, then calls `onDone` (close the dialog, collapse the field). */
export function useRunCommand(onDone: () => void): (item: CommandItem) => void {
  const router = useAppRouter();
  return React.useCallback(
    (item: CommandItem) => {
      if (item.event) window.dispatchEvent(new Event(item.event));
      else if (item.href) router.push(item.href);
      onDone();
    },
    [router, onDone],
  );
}

// ── View ──────────────────────────────────────────────────────────────────────

function HitIcon({ type }: { type: SearchHit["type"] }) {
  const cls = "size-4 shrink-0 text-muted-foreground";
  switch (type) {
    case "stop":
      return <MapPin className={cls} aria-hidden />;
    case "item":
      return <Package className={cls} aria-hidden />;
    case "transport":
      return <Train className={cls} aria-hidden />;
    case "accommodation":
      return <Building2 className={cls} aria-hidden />;
  }
}

export function commandOptionId(idPrefix: string, index: number): string {
  return `${idPrefix}-option-${index}`;
}

interface CommandResultsProps {
  groups: CommandGroup[];
  onSelect: (item: CommandItem) => void;
  /** Index into the flattened options of the active (highlighted) one; -1 for none. */
  activeIndex?: number;
  /** Listbox id; options get `${id}-option-${n}`. */
  id: string;
  className?: string;
  /**
   * The dialog moves real focus through its options; the inline field keeps
   * focus in the input (aria-activedescendant), so its options are not tab
   * stops.
   */
  focusableOptions?: boolean;
  onOptionKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  emptyText?: string;
}

export const CommandResults = React.forwardRef<HTMLDivElement, CommandResultsProps>(
  function CommandResults(
    { groups, onSelect, activeIndex = -1, id, className, focusableOptions = true, onOptionKeyDown, emptyText = "No commands found." },
    ref,
  ) {
    let index = 0;
    return (
      <div ref={ref} id={id} role="listbox" aria-label="Search results" className={className}>
        {groups.map((group) => (
          <div key={group.id} role="group" aria-label={group.label}>
            <div
              aria-hidden="true"
              className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {group.label}
            </div>
            {group.notice && (
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                {group.notice.offline && <WifiOff className="size-4 shrink-0" aria-hidden />}
                {group.notice.text}
              </div>
            )}
            {group.items.map((item) => {
              const i = index++;
              const active = i === activeIndex;
              return (
                <button
                  key={item.key}
                  id={commandOptionId(id, i)}
                  type="button"
                  role="option"
                  aria-selected={active}
                  tabIndex={focusableOptions ? undefined : -1}
                  data-active={active || undefined}
                  onMouseDown={(e) => {
                    // Keep focus in the input so click fires before any blur.
                    e.preventDefault();
                  }}
                  onClick={() => onSelect(item)}
                  onKeyDown={onOptionKeyDown}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground",
                    "hover:bg-muted focus:bg-muted focus:outline-none data-[active]:bg-muted",
                    "transition-colors",
                  )}
                >
                  {item.hit && <HitIcon type={item.hit.type} />}
                  {item.prefix && <span className="text-muted-foreground">{item.prefix}</span>}
                  <span className={cn(item.hit && "flex-1 truncate")}>{item.label}</span>
                  {item.hit?.sublabel && (
                    <span className="shrink-0 text-xs text-muted-foreground">{item.hit.sublabel}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</div>
        )}
      </div>
    );
  },
);
