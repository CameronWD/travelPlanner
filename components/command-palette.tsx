"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Package,
  Train,
  Building2,
  Search,
  WifiOff,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/ui/theme-provider";
import { searchTrip, listMyTrips } from "@/server/actions/search";
import type { SearchHit } from "@/server/actions/search";
import { DISCREET_COOKIE } from "@/lib/discreet";
import { cn } from "@/lib/cn";

// ── Cookie helpers (same pattern as discreet-toggle.tsx) ──────────────────────

const YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}
function readCookie(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

// ── Static "Go to" pages ──────────────────────────────────────────────────────

function tripPages(tripId: string): Array<{ label: string; href: string }> {
  const base = `/trips/${tripId}`;
  return [
    { label: "Home", href: base },
    { label: "Plan", href: `${base}/plan` },
    { label: "Calendar", href: `${base}/calendar` },
    { label: "Today", href: `${base}/today` },
    { label: "Wishlist", href: `${base}/wishlist` },
    { label: "Budget", href: `${base}/budget` },
    { label: "Summary", href: `${base}/summary` },
    { label: "Checklists", href: `${base}/checklists` },
    { label: "Files", href: `${base}/files` },
    { label: "Journal", href: `${base}/journal` },
    { label: "Activity", href: `${base}/activity` },
    { label: "Settings", href: `${base}/settings` },
  ];
}

// ── Hit type icons ────────────────────────────────────────────────────────────

function HitIcon({ type }: { type: SearchHit["type"] }) {
  switch (type) {
    case "stop":
      return <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
    case "item":
      return <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
    case "transport":
      return <Train className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
    case "accommodation":
      return <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
  }
}

// ── Reusable command button ───────────────────────────────────────────────────

const CommandButton = React.forwardRef<
  HTMLButtonElement,
  {
    onActivate: () => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
    children: React.ReactNode;
    className?: string;
  }
>(({ onActivate, onKeyDown, children, className }, ref) => (
  <button
    ref={ref}
    type="button"
    role="option"
    aria-selected="false"
    onMouseDown={(e) => {
      // Prevent the input losing focus before click fires.
      e.preventDefault();
    }}
    onClick={onActivate}
    onKeyDown={onKeyDown}
    className={cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground",
      "hover:bg-muted focus:bg-muted focus:outline-none",
      "transition-colors",
      className,
    )}
  >
    {children}
  </button>
));
CommandButton.displayName = "CommandButton";

// ── Section heading ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pt-0">
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tripId: string | null;
}

// ── Inner component — mounts fresh each time the palette opens ────────────────
// By mounting only when open=true, all state (query, hits) starts at its
// initial value on each open without needing setState inside an effect body.

interface CommandPaletteInnerProps {
  onOpenChange: (o: boolean) => void;
  tripId: string | null;
}

function CommandPaletteInner({ onOpenChange, tripId }: CommandPaletteInnerProps) {
  const router = useRouter();
  const { toggleTheme } = useTheme();

  const [query, setQuery] = React.useState("");
  const [myTrips, setMyTrips] = React.useState<Array<{ id: string; name: string }>>([]);
  // hits is initialised to [] on each mount (i.e. each open) — no effect reset needed.
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  // Stale-guard: track the query for which we started the latest search.
  const latestQueryRef = React.useRef<string>("");

  const inputRef = React.useRef<HTMLInputElement>(null);

  // ── Load trips once on mount (= once on open) ───────────────────────────────
  React.useEffect(() => {
    listMyTrips()
      .then(setMyTrips)
      .catch(() => {/* silent — non-critical */});
  }, []);

  // ── Online/offline listener ─────────────────────────────────────────────────
  React.useEffect(() => {
    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ── Debounced search ────────────────────────────────────────────────────────
  // setHits is only called from the async callback — never synchronously in the
  // effect body — so react-hooks/set-state-in-effect is satisfied.
  React.useEffect(() => {
    const trimmed = query.trim();

    if (!tripId || !trimmed || !isOnline) {
      // Nothing to search; hits stay at their current value ([] on first render,
      // or cleared by the stale-guard once the query becomes non-empty again).
      return;
    }

    latestQueryRef.current = trimmed;
    const capturedQuery = trimmed;

    const searchTimer = setTimeout(async () => {
      try {
        const results = await searchTrip(tripId, capturedQuery);
        // Stale-guard: only apply if this is still the latest query.
        if (latestQueryRef.current === capturedQuery) {
          setHits(results);
        }
      } catch {
        // Silent — search is best-effort.
      }
    }, 150);

    return () => {
      clearTimeout(searchTimer);
    };
  }, [query, tripId, isOnline]);

  // ── Navigation helpers ──────────────────────────────────────────────────────
  function go(href: string) {
    router.push(href);
    onOpenChange(false);
  }

  function toggleDiscreet() {
    const current = readCookie(DISCREET_COOKIE);
    if (current) {
      clearCookie(DISCREET_COOKIE);
    } else {
      setCookie(DISCREET_COOKIE, "1");
    }
    router.refresh();
    onOpenChange(false);
  }

  // ── Filtered command lists ──────────────────────────────────────────────────
  const q = query.toLowerCase();

  const gotoPages = tripId
    ? tripPages(tripId).filter(({ label }) =>
        label.toLowerCase().includes(q),
      )
    : [];

  const switchTrips = myTrips.filter(
    ({ name, id }) =>
      id !== tripId && name.toLowerCase().includes(q),
  );

  interface DoCmd { label: string; onActivate: () => void }
  const allDoCmds: DoCmd[] = [
    { label: "Globe", onActivate: () => go("/globe") },
    { label: "New trip", onActivate: () => go("/trips/new") },
    ...(tripId
      ? [
          { label: "Add Item", onActivate: () => go(`/trips/${tripId}/wishlist`) },
          { label: "Add Stop", onActivate: () => go(`/trips/${tripId}/plan`) },
        ]
      : []),
    {
      label: "Toggle theme",
      onActivate: () => {
        toggleTheme();
        onOpenChange(false);
      },
    },
    {
      label: "Toggle Discreet",
      onActivate: toggleDiscreet,
    },
  ];
  const doCmds = allDoCmds.filter(({ label }) =>
    label.toLowerCase().includes(q),
  );

  const showFind = Boolean(tripId);
  const trimmedQuery = query.trim();

  // Hits for the current query: if the query changed but results haven't
  // arrived yet, show the previous hits until the stale-guard replaces them,
  // EXCEPT when the query is empty/conditions not met (show nothing).
  const visibleHits = (!tripId || !trimmedQuery || !isOnline) ? [] : hits;

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  const listboxRef = React.useRef<HTMLDivElement>(null);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const buttons = Array.from(
        listboxRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? [],
      );
      if (buttons.length === 0) return;
      if (e.key === "ArrowDown") {
        buttons[0].focus();
      } else {
        buttons[buttons.length - 1].focus();
      }
    }
  }

  function handleButtonKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const buttons = Array.from(
        listboxRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? [],
      );
      const idx = buttons.indexOf(e.currentTarget);
      if (idx === -1) return;
      if (e.key === "ArrowDown") {
        const next = buttons[idx + 1];
        if (next) next.focus();
        else inputRef.current?.focus();
      } else {
        const prev = buttons[idx - 1];
        if (prev) prev.focus();
        else inputRef.current?.focus();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.click();
    }
  }

  // ── Sections to render ──────────────────────────────────────────────────────
  const hasGoto = gotoPages.length > 0 || switchTrips.length > 0;
  const hasDo = doCmds.length > 0;

  return (
    <>
      {/* Search input */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          autoFocus
          placeholder="Search commands…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label="Command search"
          aria-autocomplete="list"
          aria-controls="command-listbox"
        />
      </div>

      {/* Results */}
      <div
        ref={listboxRef}
        id="command-listbox"
        role="listbox"
        aria-label="Commands"
        className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto p-2"
      >
        {/* Go to section */}
        {hasGoto && (
          <div role="group" aria-label="Go to">
            <SectionLabel>Go to</SectionLabel>
            {gotoPages.map(({ label, href }) => (
              <CommandButton
                key={href}
                onActivate={() => go(href)}
                onKeyDown={handleButtonKeyDown}
              >
                {label}
              </CommandButton>
            ))}
            {switchTrips.map(({ id, name }) => (
              <CommandButton
                key={id}
                onActivate={() => go(`/trips/${id}`)}
                onKeyDown={handleButtonKeyDown}
              >
                <span className="text-muted-foreground">Switch →</span>
                {name}
              </CommandButton>
            ))}
          </div>
        )}

        {/* Do section */}
        {hasDo && (
          <div role="group" aria-label="Do">
            <SectionLabel>Do</SectionLabel>
            {doCmds.map(({ label, onActivate }) => (
              <CommandButton
                key={label}
                onActivate={onActivate}
                onKeyDown={handleButtonKeyDown}
              >
                {label}
              </CommandButton>
            ))}
          </div>
        )}

        {/* Find section */}
        {showFind && (
          <div role="group" aria-label="Find">
            <SectionLabel>Find</SectionLabel>
            {!isOnline && (
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                <WifiOff className="size-4 shrink-0" aria-hidden />
                Search needs a connection.
              </div>
            )}
            {isOnline && trimmedQuery === "" && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                Type to search this trip…
              </div>
            )}
            {isOnline && trimmedQuery !== "" && visibleHits.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                No results for &ldquo;{trimmedQuery}&rdquo;
              </div>
            )}
            {isOnline && visibleHits.map((hit) => (
              <CommandButton
                key={hit.id}
                onActivate={() => go(hit.href)}
                onKeyDown={handleButtonKeyDown}
              >
                <HitIcon type={hit.type} />
                <span className="flex-1 truncate">{hit.label}</span>
                {hit.sublabel && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {hit.sublabel}
                  </span>
                )}
              </CommandButton>
            ))}
          </div>
        )}

        {/* Nothing at all */}
        {!hasGoto && !hasDo && !showFind && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No commands found.
          </div>
        )}
      </div>
    </>
  );
}

// ── Shell — owns open/close state, renders inner only when open ───────────────

export function CommandPalette({ open, onOpenChange, tripId }: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent bare hideClose>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        {open && (
          <CommandPaletteInner onOpenChange={onOpenChange} tripId={tripId} />
        )}
      </DialogContent>
    </Dialog>
  );
}
