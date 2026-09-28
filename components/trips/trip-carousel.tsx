"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export const CARD_GAP_PX = 18;
export const CARD_GAP_MOBILE_PX = 12;

interface CarouselState {
  trackRef: React.RefObject<HTMLDivElement | null>;
  pages: number;
  page: number;
  canPrev: boolean;
  canNext: boolean;
  overflows: boolean;
  scrollByCard: (dir: 1 | -1) => void;
}

const Ctx = React.createContext<CarouselState | null>(null);

function useCarousel(): CarouselState {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("Carousel parts must sit inside <TripCarousel>");
  return c;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Provider: arrows live in the header, the track and dots below — all share this state (TRIPS_PAGE.md §3–4). */
export function TripCarousel({ children }: { children: React.ReactNode }) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = React.useState({ pages: 1, page: 0, canPrev: false, canNext: false, overflows: false });

  const measure = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    const overflows = scrollWidth > clientWidth + 1;
    const pages = Math.max(1, Math.ceil(scrollWidth / Math.max(1, clientWidth)));
    const page = Math.min(pages - 1, Math.round(scrollLeft / Math.max(1, clientWidth)));
    setMetrics({ pages, page, overflows, canPrev: scrollLeft > 1, canNext: scrollLeft + clientWidth < scrollWidth - 1 });
  }, []);

  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    measure();
    // Scroll reads only scrollLeft/clientWidth/scrollWidth (no layout write), so measuring
    // on every scroll event is cheap; no rAF throttle (tests assert synchronously after scroll).
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [measure]);

  // Steps to the next/previous CARD, not by a fixed width+gap: cards aren't
  // all the same width (the hero is roughly double a standard card — TRIPS_PAGE.md
  // §3–4), so a fixed step under- or overshoots and skips cards. Instead, land
  // on whichever card's own `offsetLeft` is just past the current scroll
  // position in the requested direction (I4).
  const scrollByCard = React.useCallback((dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    const scrollLeft = el.scrollLeft;
    const target =
      dir === 1
        ? children.find((c) => c.offsetLeft > scrollLeft + 1)
        : [...children].reverse().find((c) => c.offsetLeft < scrollLeft - 1);
    if (!target) return;
    el.scrollTo({ left: target.offsetLeft, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const value = React.useMemo<CarouselState>(() => ({ trackRef, ...metrics, scrollByCard }), [metrics, scrollByCard]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const ARROW =
  "grid size-11 shrink-0 place-items-center rounded-[12px] border-2 bg-card transition-colors " +
  "enabled:border-border enabled:text-foreground enabled:shadow-hard-1 " +
  "disabled:border-border-soft disabled:text-border-soft disabled:shadow-none " +
  "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Two 44×44 arrows; hidden entirely when every card fits. */
export function CarouselArrows() {
  const { overflows, canPrev, canNext, scrollByCard } = useCarousel();
  if (!overflows) return null;
  return (
    <div className="flex gap-2.5">
      <button type="button" className={ARROW} aria-label="Previous trips" disabled={!canPrev} onClick={() => scrollByCard(-1)}>
        <ChevronLeft className="size-[18px]" aria-hidden="true" />
      </button>
      <button type="button" className={ARROW} aria-label="Next trips" disabled={!canNext} onClick={() => scrollByCard(1)}>
        <ChevronRight className="size-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The scroll-snap row. Children are the cards (each `snap-start shrink-0`). */
export function CarouselTrack({ children, className }: { children: React.ReactNode; className?: string }) {
  const { trackRef, scrollByCard } = useCarousel();
  return (
    <div
      ref={trackRef}
      role="region"
      aria-label="Your trips"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); scrollByCard(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); scrollByCard(-1); }
      }}
      className={cn(
        "flex snap-x snap-mandatory gap-[18px] overflow-x-auto pb-1.5 [scroll-padding-left:0] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-ring",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One dot per page; hidden with a single page. */
export function CarouselDots({ className }: { className?: string }) {
  const { pages, page, overflows } = useCarousel();
  if (!overflows || pages <= 1) return null;
  return (
    <div data-carousel-dots aria-hidden="true" className={cn("flex h-2 items-center gap-1.5", className)}>
      {Array.from({ length: pages }, (_, i) => (
        <span
          key={i}
          data-carousel-dot
          className={cn("h-2 rounded-full transition-[width]", i === page ? "w-[22px] bg-primary" : "w-2 bg-border-soft")}
        />
      ))}
    </div>
  );
}
