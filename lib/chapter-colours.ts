import { z } from "zod";

export interface ChapterColourMeta {
  value: string;
  label: string;
  /** Tailwind classes for chips/headers (light + dark). */
  chipClass: string;
  /** Hex for inline styles (Leaflet markers/polylines). */
  swatch: string;
}

export const CHAPTER_COLOURS = [
  { value: "sky",     label: "Sky",     swatch: "#0ea5e9", chipClass: "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  { value: "amber",   label: "Amber",   swatch: "#f59e0b", chipClass: "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  { value: "emerald", label: "Emerald", swatch: "#10b981", chipClass: "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  { value: "violet",  label: "Violet",  swatch: "#8b5cf6", chipClass: "border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  { value: "rose",    label: "Rose",    swatch: "#f43f5e", chipClass: "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300" },
  { value: "teal",    label: "Teal",    swatch: "#14b8a6", chipClass: "border-teal-200 bg-teal-100 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300" },
  { value: "orange",  label: "Orange",  swatch: "#f97316", chipClass: "border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  { value: "indigo",  label: "Indigo",  swatch: "#6366f1", chipClass: "border-indigo-200 bg-indigo-100 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
] as const satisfies readonly ChapterColourMeta[];

export type ChapterColour = (typeof CHAPTER_COLOURS)[number]["value"];
export const CHAPTER_COLOUR_VALUES = CHAPTER_COLOURS.map((c) => c.value) as [ChapterColour, ...ChapterColour[]];
export const chapterColourSchema = z.enum(CHAPTER_COLOUR_VALUES);

const BY_VALUE = new Map<string, ChapterColourMeta>(CHAPTER_COLOURS.map((c) => [c.value, c]));

export function chapterColourMeta(value: string): ChapterColourMeta {
  return BY_VALUE.get(value) ?? CHAPTER_COLOURS[0];
}
export function chapterColourSwatch(value: string): string {
  return chapterColourMeta(value).swatch;
}

/** First palette colour not already used; cycles to the first when all are used. */
export function nextChapterColour(used: readonly string[]): ChapterColour {
  const usedSet = new Set(used);
  const free = CHAPTER_COLOUR_VALUES.find((v) => !usedSet.has(v));
  return free ?? CHAPTER_COLOUR_VALUES[0];
}
