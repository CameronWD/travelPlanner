import { z } from "zod";
import { HUE_CLASSES, LEGACY_TO_HUE } from "@/lib/hues";
import { hueHex } from "@/lib/map-palette";

/**
 * Chapter colours. The stored `value`s are unchanged (no migration); each maps onto the
 * Playground hue ramp. Chapters always show their name next to the colour, so the 8 hues
 * only need to be distinguishable side by side, not memorable.
 */
export interface ChapterColourMeta {
  value: string;
  label: string;
  /** Chip / header classes (light + dark come from the tokens). */
  chipClass: string;
  /** Leading dot inside a chip. */
  dotClass: string;
  /** Chapter band rail (8px) on the plan editor. */
  railClass: string;
  /** Hex for Leaflet, light theme. */
  swatch: string;
  /** Hex for Leaflet, dark theme. */
  swatchDark: string;
}

const make = <V extends string>(value: V, label: string): ChapterColourMeta & { value: V } => {
  const hue = LEGACY_TO_HUE[value];
  const c = HUE_CLASSES[hue];
  return { value, label, chipClass: c.chip, dotClass: c.dot, railClass: c.fill, swatch: hueHex(hue, false), swatchDark: hueHex(hue, true) };
};

export const CHAPTER_COLOURS = [
  make("sky", "Sky"),
  make("amber", "Sun"),
  make("emerald", "Leaf"),
  make("violet", "Lilac"),
  make("rose", "Pink"),
  make("teal", "Teal"),
  make("orange", "Coral"),
  make("indigo", "Indigo"),
] as const;

const VALUES = ["sky", "amber", "emerald", "violet", "rose", "teal", "orange", "indigo"] as const;
export type ChapterColour = (typeof VALUES)[number];
export const CHAPTER_COLOUR_VALUES = [...VALUES] as [ChapterColour, ...ChapterColour[]];
export const chapterColourSchema = z.enum(CHAPTER_COLOUR_VALUES);

const BY_VALUE = new Map<string, ChapterColourMeta>(CHAPTER_COLOURS.map((c) => [c.value, c]));

export function chapterColourMeta(value: string): ChapterColourMeta {
  return BY_VALUE.get(value) ?? CHAPTER_COLOURS[0];
}
export function chapterColourSwatch(value: string, dark = false): string {
  const m = chapterColourMeta(value);
  return dark ? m.swatchDark : m.swatch;
}

/** First palette colour not already used; cycles to the first when all are used. */
export function nextChapterColour(used: readonly string[]): ChapterColour {
  const usedSet = new Set(used);
  return CHAPTER_COLOUR_VALUES.find((v) => !usedSet.has(v)) ?? CHAPTER_COLOUR_VALUES[0];
}
