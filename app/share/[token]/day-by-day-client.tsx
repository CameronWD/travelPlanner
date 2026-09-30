"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { scrollToId } from "@/lib/scroll-to";
import { cn } from "@/lib/cn";

interface DayByDayState {
  openId: string | null;
  setOpenId: (id: string | null) => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  /** Open a stop and scroll to it once the swap has committed. */
  jumpTo: (id: string) => void;
}

const DayByDayContext = createContext<DayByDayState | null>(null);

function useDayByDay(): DayByDayState {
  const ctx = useContext(DayByDayContext);
  if (!ctx) throw new Error("Day by day pieces must sit inside DayByDayProvider");
  return ctx;
}

/** Holds the one open stop (every width) and the stop in view for the index. */
export function DayByDayProvider({ initialOpenId, children }: { initialOpenId: string | null; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [activeId, setActiveId] = useState<string | null>(null);
  // An object, not the id, so jumping to the same stop twice scrolls twice.
  const [scrollTarget, setScrollTarget] = useState<{ id: string } | null>(null);
  const reduced = useReducedMotion();
  // A ref, so a late reduced-motion flip never replays the last scroll.
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  // Scroll after commit: the previously open stop folding above the target
  // moves it, so measuring before the swap lands short.
  useEffect(() => {
    if (scrollTarget) scrollToId(`share-stop-${scrollTarget.id}`, { reduced: !!reducedRef.current });
  }, [scrollTarget]);

  const jumpTo = (id: string) => {
    setOpenId(id);
    setScrollTarget({ id });
  };

  return (
    <DayByDayContext.Provider value={{ openId, setOpenId, activeId, setActiveId, jumpTo }}>
      {children}
    </DayByDayContext.Provider>
  );
}

export function StopBlock({
  stopId,
  name,
  dashed,
  folded,
  open,
}: {
  stopId: string;
  name: string;
  dashed: boolean;
  folded: ReactNode;
  open: ReactNode;
}) {
  const { openId, setOpenId } = useDayByDay();

  if (openId === stopId) {
    return (
      <div
        data-stop-open={stopId}
        className="relative overflow-hidden rounded-[22px] border-2 border-border bg-card shadow-hard-4"
      >
        {open}
        <button
          type="button"
          aria-expanded="true"
          aria-label={`Hide ${name}`}
          onClick={() => setOpenId(null)}
          className="pressable absolute right-3 top-3 inline-flex h-9 items-center gap-1 rounded-full border-2 border-border bg-card px-3 text-[13px] font-bold tap-target"
        >
          Hide
          <ChevronUp aria-hidden className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-stop-folded={stopId}
      className={cn(
        "flex items-center gap-3 rounded-[18px] border-2 border-border bg-card px-4 py-3",
        dashed && "border-dashed",
      )}
    >
      {folded}
      <button
        type="button"
        aria-expanded="false"
        aria-label={`Show ${name}`}
        onClick={() => setOpenId(stopId)}
        className="pressable inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[13px] font-bold tap-target"
      >
        Show
        <ChevronDown aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function StopIndex({
  stops,
  className,
}: {
  stops: { id: string; name: string; dotClass: string; dates: string }[];
  className?: string;
}) {
  const { openId, activeId, setActiveId, jumpTo } = useDayByDay();
  const active = activeId ?? openId;

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        const id = hit?.target.getAttribute("data-share-stop");
        if (id) setActiveId(id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    document.querySelectorAll("[data-share-stop]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [setActiveId]);

  return (
    <nav aria-label="Stops" className={cn("flex-col gap-1", className)}>
      {stops.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-current={active === s.id ? "true" : undefined}
          onClick={() => jumpTo(s.id)}
          className={cn(
            "pressable flex h-10 items-center gap-2.5 rounded-xl border-2 px-3 text-left text-sm font-bold tap-target",
            active === s.id ? "border-border bg-teal/15" : "border-transparent",
          )}
        >
          <span aria-hidden className={cn("size-3 shrink-0 rounded-full border-2 border-border", s.dotClass)} />
          <span className="min-w-0 truncate">{s.name}</span>
          <span className="ml-auto shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-muted-foreground">
            {s.dates}
          </span>
        </button>
      ))}
    </nav>
  );
}

export function StopPicker({ stops, className }: { stops: { id: string; name: string }[]; className?: string }) {
  const { openId, jumpTo } = useDayByDay();
  const openName = stops.find((s) => s.id === openId)?.name;

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="pressable inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border bg-card px-4 text-sm font-bold"
          >
            {openName ?? "Stops"}
            <ChevronDown aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {stops.map((s) => (
            <DropdownMenuItem key={s.id} onSelect={() => jumpTo(s.id)} className="min-h-11 font-bold">
              {s.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
