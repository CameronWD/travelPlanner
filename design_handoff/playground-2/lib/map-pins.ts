import { CATEGORIES } from "@/lib/categories";
import { hueHex, mapInk } from "@/lib/map-palette";

/**
 * Map pins. Same export names as before (CATEGORY_PIN_HEX, pinHex) so the Globe and Wishlist
 * maps keep compiling; both now take an optional `dark` flag. `pinHtml` builds the Playground
 * sticker pin for L.divIcon({ html, className: "", iconSize, iconAnchor }).
 */
export const CATEGORY_PIN_HEX: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, hueHex(c.hue, false)]),
);
const CATEGORY_PIN_HEX_DARK: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, hueHex(c.hue, true)]),
);

export function pinHex(category: string, dark = false): string {
  const t = dark ? CATEGORY_PIN_HEX_DARK : CATEGORY_PIN_HEX;
  return t[category] ?? t.OTHER;
}

export type PinVariant = "category" | "stop" | "home" | "now" | "wish" | "cluster";

export interface PinOptions {
  variant: PinVariant;
  /** Fill for category/stop pins (pinHex or chapterColourSwatch). */
  fill?: string;
  /** Short text inside: stop number, cluster count. Escape before passing. */
  label?: string;
  /** Inline SVG string for a glyph (lucide icon at 14px, stroke = currentColor). */
  glyph?: string;
  selected?: boolean;
  dark?: boolean;
}

/** Sizes: 28px (category, stop, wish), 32px (home, now), 34px (cluster). Anchor = centre. */
export function pinSize(variant: PinVariant): number {
  return variant === "cluster" ? 34 : variant === "home" || variant === "now" ? 32 : 28;
}

export function pinHtml({ variant, fill, label, glyph, selected, dark = false }: PinOptions): string {
  const k = mapInk(dark);
  const s = pinSize(variant);
  const bg =
    variant === "home" ? (dark ? k.paper : k.ink)
    : variant === "now" ? k.now
    : variant === "wish" ? k.card
    : variant === "cluster" ? (dark ? k.paper : k.ink)
    : fill ?? pinHex("OTHER", dark);
  const fg = variant === "home" || variant === "cluster" ? (dark ? k.ink : k.paper) : variant === "wish" ? (dark ? k.paper : k.ink) : k.ink;
  const border = variant === "wish" ? `2px dashed ${dark ? k.paper : k.ink}` : `2px solid ${k.ink}`;
  const radius = variant === "home" ? "9px" : "50%";
  const lift = selected ? "transform:translate(-1px,-1px) scale(1.15);" : "";
  const ring = selected ? `,0 0 0 3px ${k.now}` : "";
  const shadow = variant === "wish" ? "none" : `2px 2px 0 ${k.shadow}${ring}`;
  const inner = glyph ?? (label ? `<span style="font:800 12px/1 var(--font-sans),system-ui,sans-serif;letter-spacing:-0.02em">${label}</span>` : "");
  return `<div style="width:${s}px;height:${s}px;box-sizing:border-box;border-radius:${radius};background:${bg};color:${fg};border:${border};box-shadow:${shadow};display:grid;place-items:center;${lift}transition:transform 120ms cubic-bezier(.2,.8,.2,1)">${inner}</div>`;
}
