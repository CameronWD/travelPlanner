import type { Hue } from "@/lib/hues";

/**
 * Blessed hex values for Leaflet. divIcon markers are HTML strings and polylines take a colour
 * string, so Tailwind can't reach them. This is the ONLY lib file allowed hex literals; each
 * value mirrors a token in app/globals.css (comment = token). Keep them in step.
 */
const HUE_HEX: Record<Hue, { light: string; dark: string }> = {
  sky:    { light: "#8AD6F5", dark: "#8CC0D6" },
  sun:    { light: "#FFD166", dark: "#E6C57A" },
  leaf:   { light: "#A6D96A", dark: "#A1C57A" },
  lilac:  { light: "#C7A2FF", dark: "#B5A0E2" },
  pink:   { light: "#FF9EC4", dark: "#E6A0BA" },
  teal:   { light: "#5BC0BE", dark: "#6FB8B4" },
  coral:  { light: "#FF6B4A", dark: "#E8866C" },
  indigo: { light: "#7F94FF", dark: "#8192DE" },
  stone:  { light: "#D6CFC2", dark: "#BCB7AE" },
};

export function hueHex(hue: Hue, dark = false): string {
  return (HUE_HEX[hue] ?? HUE_HEX.stone)[dark ? "dark" : "light"];
}

/** Non-hue map colours. Tiles stay CARTO light / dark (cartoTiles). */
export const MAP_INK = {
  light: {
    ink: "#1D1D1B",        // --foreground: pin outline, pin glyph, route casing, home pin fill
    paper: "#FFFBF3",      // --background: home glyph, cluster text, label halo
    shadow: "#1D1D1B",     // --shadow-ink: 2px hard pin shadow
    now: "#FF6B4A",        // --coral: today / selected / "you are here"
    missing: "#B8391D",    // --coral-text: missing-connection dashes
    muted: "#6B6660",      // --muted-foreground: past legs, rough (undated) legs
    card: "#FFFBF3",       // --background: wishlist "want to go" pin fill
  },
  dark: {
    ink: "#1C1A17",        // --on-accent (dark): pin outline + glyph on a dark-theme fill
    paper: "#EDE6D8",      // --foreground (dark): home pin fill, route line, cluster fill
    shadow: "#0D0C0A",     // --shadow-ink (dark)
    now: "#E8866C",        // --coral (dark)
    missing: "#E8866C",    // --coral-text (dark)
    muted: "#A59D8F",      // --muted-foreground (dark)
    card: "#2C2924",       // --card (dark)
  },
} as const;

export type MapTheme = "light" | "dark";
export const mapInk = (dark: boolean) => MAP_INK[dark ? "dark" : "light"];

/**
 * Polyline styles. Draw the casing first, then the line on top.
 * Chapter-coloured legs: { ...line, color: chapterColourSwatch(ch, dark) }. No chapter: paper line on ink casing.
 */
export function routeStyles(dark: boolean) {
  const k = mapInk(dark);
  return {
    casing:  { color: dark ? k.shadow : k.ink, weight: 7, opacity: 1, lineCap: "round", lineJoin: "round" },
    line:    { color: k.paper, weight: 3.5, opacity: 1, lineCap: "round", lineJoin: "round" },
    flight:  { color: dark ? k.paper : k.ink, weight: 2.5, opacity: 1, dashArray: "10 8", lineCap: "round" },
    rough:   { color: k.muted, weight: 3, opacity: 1, dashArray: "2 8", lineCap: "round" },
    missing: { color: k.missing, weight: 3, opacity: 1, dashArray: "1 8", lineCap: "round" },
    past:    { color: k.muted, weight: 3, opacity: 0.7, lineCap: "round" },
    returnLeg: { color: dark ? k.paper : k.ink, weight: 2.5, opacity: 0.8, dashArray: "6 6", lineCap: "round" },
  } as const;
}
