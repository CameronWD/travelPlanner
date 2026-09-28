import { cn } from "@/lib/cn";

/**
 * The trips page frame (TRIPS_PAGE.md §2, §8; spec P7), shared by page.tsx
 * and loading.tsx (I3) — the loading skeleton must carry the exact same
 * frame padding as the loaded page, or it double-pads under `<main>`'s own
 * padding for the instant before `[data-trips-shell]` on the real page kicks
 * in. Pulled out of page.tsx so loading.tsx (and its test) don't drag in the
 * page's data-loading imports (guards, db) just for a class string.
 *
 * The app layout's `<main>` drops its own padding for this page
 * ([data-trips-shell]); the page pads itself: phones 4/18/110px, tablets
 * like any page, ≥1280 `32px 0 32px 40px` locked to one screen unless the
 * viewport is shorter than 820px.
 */
export const FRAME = cn(
  "flex flex-col gap-3.5 pl-[18px] pr-0 pt-1 pb-[calc(var(--tp-tab-bar-h)+1rem+env(safe-area-inset-bottom))]",
  "md:gap-[18px] md:px-6 md:py-8",
  "xl:min-h-0 xl:pl-10 xl:pr-0 xl:py-8 xl:h-dvh xl:overflow-hidden",
  "xl:[@media(max-height:819px)]:h-auto xl:[@media(max-height:819px)]:overflow-visible",
);
