"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, m, useReducedMotion, type Variants } from "motion/react";
import { LayoutMotion } from "@/components/ui/layout-motion";
import { PresenceDiv } from "@/components/plan/presence";
import { useMotionTiming } from "@/components/plan/use-motion-timing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { scrollToId } from "@/lib/scroll-to";
import { cn } from "@/lib/cn";

/** How a stop last opened or closed: a Show/Hide toggle folds (P2); a jump cross-fades (S7). */
type OpenVia = "toggle" | "jump";

interface DayByDayState {
  /** In the order they were opened, so the last is the most recent. */
  openIds: readonly string[];
  via: OpenVia;
  toggle: (id: string) => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  /** Open a stop (leaving the others as they are) and scroll to it once it has committed. */
  jumpTo: (id: string) => void;
}

const DayByDayContext = createContext<DayByDayState | null>(null);

function useDayByDay(): DayByDayState {
  const ctx = useContext(DayByDayContext);
  if (!ctx) throw new Error("Day by day pieces must sit inside DayByDayProvider");
  return ctx;
}

/** Holds the set of open stops (every width) and the stop in view for the index. */
export function DayByDayProvider({ initialOpenId, children }: { initialOpenId: string | null; children: ReactNode }) {
  const [open, setOpen] = useState<{ ids: readonly string[]; via: OpenVia }>({
    ids: initialOpenId ? [initialOpenId] : [],
    via: "toggle",
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  // An object, not the id, so jumping to the same stop twice scrolls twice.
  const [scrollTarget, setScrollTarget] = useState<{ id: string } | null>(null);
  const reduced = useReducedMotion();
  // A ref, so a late reduced-motion flip never replays the last scroll.
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  // Scroll after commit, so the target is measured with the page as it will stay.
  useEffect(() => {
    if (scrollTarget) scrollToId(`share-stop-${scrollTarget.id}`, { reduced: !!reducedRef.current });
  }, [scrollTarget]);

  const toggle = (id: string) =>
    setOpen((prev) => ({ ids: prev.ids.includes(id) ? prev.ids.filter((x) => x !== id) : [...prev.ids, id], via: "toggle" }));
  // A jump swaps without animating heights, so the scroll below measures the page as it will stay.
  const jumpTo = (id: string) => {
    setOpen((prev) => ({ ids: prev.ids.includes(id) ? prev.ids : [...prev.ids, id], via: "jump" }));
    setScrollTarget({ id });
  };

  return (
    <DayByDayContext.Provider value={{ openIds: open.ids, via: open.via, toggle, activeId, setActiveId, jumpTo }}>
      {children}
    </DayByDayContext.Provider>
  );
}

const EASE_POP: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];

/**
 * MOTION.md S7. A Show/Hide toggle folds like Plan P2: height 0 ↔ auto
 * (320ms, pop), the content fading in 60ms after the height starts, the
 * rows below riding the animated height. A jump (stop index, mobile
 * picker) cross-fades instead (out 120ms, in 180ms): the leaving block pops
 * out of the flow at once so the scroll lands where the page will stay.
 * Exits read `via` through AnimatePresence's `custom`, since a leaving child
 * keeps the props it last rendered with.
 */
function useFoldVariants(): Variants {
  const { t } = useMotionTiming();
  return {
    hidden: (via: OpenVia) => (via === "jump" ? { opacity: 0 } : { height: 0, opacity: 0 }),
    shown: (via: OpenVia) =>
      via === "jump"
        ? { opacity: 1, transition: t({ duration: 0.18, ease: EASE_POP }) }
        : {
            height: "auto",
            opacity: 1,
            transition: t({ height: { duration: 0.32, ease: EASE_POP }, opacity: { delay: 0.06, duration: 0.18 } }),
          },
    gone: (via: OpenVia) =>
      via === "jump"
        ? { opacity: 0, transition: t({ duration: 0.12, ease: EASE_EXIT }, "exit") }
        : { height: 0, opacity: 0, transition: t({ duration: 0.2, ease: EASE_EXIT }, "exit") },
  };
}

function Chevron({ open }: { open: boolean }) {
  const { t } = useMotionTiming();
  return (
    <m.span
      aria-hidden
      data-motion="chevron"
      className="inline-flex"
      initial={{ rotate: open ? 0 : 180 }}
      animate={{ rotate: open ? 180 : 0 }}
      transition={t({ duration: 0.18, ease: EASE_POP })}
    >
      <ChevronDown className="size-4" />
    </m.span>
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
  const { openIds, via, toggle } = useDayByDay();
  const variants = useFoldVariants();
  const isOpen = openIds.includes(stopId);
  const motionProps = { variants, custom: via, initial: "hidden", animate: "shown", exit: "gone" } as const;

  return (
    <AnimatePresence initial={false} custom={via} mode={via === "jump" ? "popLayout" : "sync"}>
      {isOpen ? (
        <PresenceDiv
          key="open"
          {...motionProps}
          data-stop-open={stopId}
          className="relative overflow-hidden rounded-[22px] border-2 border-border bg-card shadow-hard-4"
        >
          {open}
          <button
            type="button"
            aria-expanded="true"
            aria-label={`Hide ${name}`}
            onClick={() => toggle(stopId)}
            className="pressable absolute right-3 top-3 inline-flex h-9 items-center gap-1 rounded-full border-2 border-border bg-card px-3 text-[13px] font-bold tap-target"
          >
            Hide
            <Chevron open />
          </button>
        </PresenceDiv>
      ) : (
        <PresenceDiv
          key="folded"
          {...motionProps}
          data-stop-folded={stopId}
          className={cn(
            "grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 overflow-hidden rounded-[18px] border-2 border-border bg-card px-4 py-3 sm:flex sm:gap-3",
            dashed && "border-dashed",
          )}
        >
          {folded}
          <button
            type="button"
            aria-expanded="false"
            aria-label={`Show ${name}`}
            onClick={() => toggle(stopId)}
            className="pressable col-start-3 row-start-1 inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[13px] font-bold tap-target sm:col-auto sm:row-auto"
          >
            Show
            <Chevron open={false} />
          </button>
        </PresenceDiv>
      )}
    </AnimatePresence>
  );
}

export function StopIndex({
  stops,
  className,
}: {
  stops: { id: string; name: string; dotClass: string; dates: string }[];
  className?: string;
}) {
  const { openIds, activeId, setActiveId, jumpTo } = useDayByDay();
  const active = activeId ?? openIds.at(-1) ?? null;
  const { t } = useMotionTiming();

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
          className="pressable relative flex min-h-10 items-start gap-2.5 rounded-xl border-2 border-transparent px-3 py-2.5 text-left text-sm font-bold leading-5 tap-target"
        >
          {/* MOTION.md S8: one highlight that moves between rows. */}
          {active === s.id && (
            <LayoutMotion>
              <m.span
                aria-hidden
                data-slot="stop-index-active"
                layoutId="share-stop-index-active"
                transition={t({ duration: 0.18, ease: EASE_POP })}
                className="absolute -inset-[2px] rounded-xl border-2 border-border bg-teal/15"
              />
            </LayoutMotion>
          )}
          <span aria-hidden className={cn("relative mt-1 size-3 shrink-0 rounded-full border-2 border-border", s.dotClass)} />
          <span className="relative min-w-0 flex-1 overflow-hidden text-ellipsis">{s.name}</span>
          <span className="relative ml-auto shrink-0 whitespace-nowrap text-xs font-semibold leading-5 tabular-nums text-muted-foreground">
            {s.dates}
          </span>
        </button>
      ))}
    </nav>
  );
}

export function StopPicker({ stops, className }: { stops: { id: string; name: string }[]; className?: string }) {
  const { openIds, jumpTo } = useDayByDay();
  const openName = stops.find((s) => s.id === openIds.at(-1))?.name;

  return (
    <div className={cn("min-w-0", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="pressable inline-flex min-h-11 max-w-full items-center gap-1 rounded-full border-2 border-border bg-card px-4 py-1.5 text-left text-sm font-bold"
          >
            <span className="min-w-0">{openName ?? "Stops"}</span>
            <ChevronDown aria-hidden className="size-4 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        {/* Portalled to <body>, outside the page's light root: force light here too. */}
        <DropdownMenuContent align="end" data-theme="light" className="light">
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
