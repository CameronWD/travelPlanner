/**
 * The Playground categorical ramp. One ramp, two uses:
 *  - item categories (lib/categories.ts) — fixed mapping, 6 hues + stone
 *  - chapter colours (lib/chapter-colours.ts) — user picks any of the 8 hues
 * Class strings are written out in full so Tailwind's scanner sees them (no `bg-hue-${x}`).
 * Hex values for Leaflet live in lib/map-palette.ts.
 */
export const HUES = ["sky", "sun", "leaf", "lilac", "pink", "teal", "coral", "indigo", "stone"] as const;
export type Hue = (typeof HUES)[number];

export interface HueClasses {
  /** Chip / pill: fill + ink outline + ink text. */
  chip: string;
  /** Leading dot inside a chip or legend (10px). */
  dot: string;
  /** Hue as text or icon on paper/card. */
  text: string;
  /** Large tinted areas (chapter band background, day header). */
  soft: string;
  /** Solid fill only (bars, rails). */
  fill: string;
}

export const HUE_CLASSES: Record<Hue, HueClasses> = {
  sky:    { chip: "border-2 border-border bg-hue-sky text-on-accent",    dot: "border-2 border-border bg-hue-sky",    text: "text-hue-sky-text",    soft: "bg-hue-sky/25",    fill: "bg-hue-sky" },
  sun:    { chip: "border-2 border-border bg-hue-sun text-on-accent",    dot: "border-2 border-border bg-hue-sun",    text: "text-hue-sun-text",    soft: "bg-hue-sun/25",    fill: "bg-hue-sun" },
  leaf:   { chip: "border-2 border-border bg-hue-leaf text-on-accent",   dot: "border-2 border-border bg-hue-leaf",   text: "text-hue-leaf-text",   soft: "bg-hue-leaf/25",   fill: "bg-hue-leaf" },
  lilac:  { chip: "border-2 border-border bg-hue-lilac text-on-accent",  dot: "border-2 border-border bg-hue-lilac",  text: "text-hue-lilac-text",  soft: "bg-hue-lilac/25",  fill: "bg-hue-lilac" },
  pink:   { chip: "border-2 border-border bg-hue-pink text-on-accent",   dot: "border-2 border-border bg-hue-pink",   text: "text-hue-pink-text",   soft: "bg-hue-pink/25",   fill: "bg-hue-pink" },
  teal:   { chip: "border-2 border-border bg-hue-teal text-on-accent",   dot: "border-2 border-border bg-hue-teal",   text: "text-hue-teal-text",   soft: "bg-hue-teal/25",   fill: "bg-hue-teal" },
  coral:  { chip: "border-2 border-border bg-hue-coral text-on-accent",  dot: "border-2 border-border bg-hue-coral",  text: "text-hue-coral-text",  soft: "bg-hue-coral/20",  fill: "bg-hue-coral" },
  indigo: { chip: "border-2 border-border bg-hue-indigo text-on-accent", dot: "border-2 border-border bg-hue-indigo", text: "text-hue-indigo-text", soft: "bg-hue-indigo/25", fill: "bg-hue-indigo" },
  stone:  { chip: "border-2 border-border bg-hue-stone text-on-accent",  dot: "border-2 border-border bg-hue-stone",  text: "text-hue-stone-text",  soft: "bg-hue-stone/40",  fill: "bg-hue-stone" },
};

/** Legacy Tailwind colour names (what the DB and older code store) → ramp hue. */
export const LEGACY_TO_HUE: Record<string, Hue> = {
  sky: "sky", amber: "sun", emerald: "leaf", violet: "lilac", rose: "pink",
  teal: "teal", orange: "coral", indigo: "indigo", stone: "stone",
};

export function hueClasses(hueOrLegacy: string): HueClasses {
  return HUE_CLASSES[(LEGACY_TO_HUE[hueOrLegacy] ?? hueOrLegacy) as Hue] ?? HUE_CLASSES.stone;
}
