import { HUE_CLASSES, LEGACY_TO_HUE, type Hue } from "@/lib/hues";

/**
 * Per-stop colour bands, keyed by stop.sortOrder. Shared by MonthGrid and the
 * plan editor's StopCard so a stop reads the same hue on the calendar and the
 * itinerary. Routed through the Playground hue ramp (lib/hues.ts) via the
 * same LEGACY_TO_HUE mapping chapter colours use, so a stop and a chapter
 * that "look like sky" really are the same hue.
 */
const STOP_LEGACY = ["sky", "amber", "emerald", "violet", "rose", "teal"] as const;
const STOP_HUES: readonly Hue[] = STOP_LEGACY.map((legacy) => LEGACY_TO_HUE[legacy]);

// Left-border rail class. The ramp has no dedicated "border" variant, so this
// borrows the same --color-hue-* token the fill/dot/chip classes already use
// (bg-hue-sky etc., defined in app/globals.css) via Tailwind v4's border-side
// utilities, which read off the same colour namespace. Written out in full,
// one per STOP_LEGACY/STOP_HUES entry in order, so Tailwind's text-based
// scanner sees each class literally (no `border-l-hue-${hue}` template).
const BORDER: readonly string[] = [
  "border-l-hue-sky",   // sky
  "border-l-hue-sun",   // amber -> sun
  "border-l-hue-leaf",  // emerald -> leaf
  "border-l-hue-lilac", // violet -> lilac
  "border-l-hue-pink",  // rose -> pink
  "border-l-hue-teal",  // teal
];
const DOT: readonly string[] = STOP_HUES.map((hue) => HUE_CLASSES[hue].dot);
// Soft tinted pill + hue-coloured text (no ink border) to match the original
// "bg-sky-100 text-sky-700 dark:…" pastel pill, not the heavier bordered chip.
const PILL: readonly string[] = STOP_HUES.map((hue) => `${HUE_CLASSES[hue].soft} ${HUE_CLASSES[hue].text}`);

const idx = (i: number) => ((i % STOP_HUES.length) + STOP_HUES.length) % STOP_HUES.length;

export function stopBandBorderClass(index: number): string { return BORDER[idx(index)]; }
export function stopDotClass(index: number): string { return DOT[idx(index)]; }
export function stopPillClass(index: number): string { return PILL[idx(index)]; }
