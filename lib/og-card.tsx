import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";
import { WORDMARK_VIEWBOX, WORDMARK_ASPECT, WORDMARK_TRANSFORM, WORDMARK_WORD_D, WORDMARK_DOT_D } from "@/components/ui/logo-paths";

/**
 * Open Graph card, 1200×630, rendered by Satori (next/og). Sanctioned inline-style + hex file
 * (ADR 0060); values pinned to globals.css HSL by og-card.test.ts.
 * Only the site-wide default card ships here — the per-trip share card is a logged gap.
 * Font: app/fonts/BricolageGrotesque-ExtraBold.ttf and PlusJakartaSans-Bold.ttf (OFL, Google
 * Fonts; Satori needs .ttf/.otf/.woff, not .woff2).
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_COLOURS: Record<"paper" | "ink" | "muted" | "coral" | "sun" | "teal" | "lilac" | "card", string> = {
  paper: "#FFFCF5",
  ink: "#1D1D1B",
  muted: "#6B6761",
  card: "#FFFFFF",
  coral: "#FF6D4D",
  sun: "#FFD166",
  teal: "#5ABFBD",
  lilac: "#C8A3FF",
};

function Wordmark({ h, color = OG_COLOURS.ink }: { h: number; color?: string }) {
  return (
    <svg width={h * WORDMARK_ASPECT} height={h} viewBox={WORDMARK_VIEWBOX}>
      <g transform={WORDMARK_TRANSFORM}><path fill={color} d={WORDMARK_WORD_D} /><path fill={OG_COLOURS.coral} d={WORDMARK_DOT_D} /></g>
    </svg>
  );
}

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path d="M24 5 L43 38 Q44.5 41 41 41 H30 L24 47 L18 41 H7 Q3.5 41 5 38 Z" fill={OG_COLOURS.coral} stroke={OG_COLOURS.ink} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 20 L32 41 H30 L24 47 L18 41 H16 Z" fill={OG_COLOURS.ink} />
      <path d="M18 5 L24 12 L30 5" fill="none" stroke={OG_COLOURS.ink} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Root / non-share pages. Static content, same system. */
export function DefaultOgCard(): ReactElement {
  return (
    <div style={{ width: 1200, height: 630, display: "flex", background: OG_COLOURS.coral, padding: 64, fontFamily: "Jakarta", color: OG_COLOURS.ink, position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, background: OG_COLOURS.paper, border: `4px solid ${OG_COLOURS.ink}`, borderRadius: 40, boxShadow: `12px 12px 0 ${OG_COLOURS.ink}`, padding: "52px 60px" }}>
        <Wordmark h={48} />
        <div style={{ display: "flex", marginTop: "auto", fontFamily: "Bricolage", fontSize: 100, lineHeight: 0.92, letterSpacing: "-0.045em", maxWidth: 760 }}>Plan the trip together.</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 32, fontWeight: 700, color: OG_COLOURS.muted }}>Stops, beds, trains and the shared pot, in one place.</div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 96, display: "flex", transform: "rotate(8deg)" }}><Mark size={190} /></div>
    </div>
  );
}

export async function ogFonts() {
  const [bricolage, jakarta] = await Promise.all([
    readFile(join(process.cwd(), "app/fonts/BricolageGrotesque-ExtraBold.ttf")),
    readFile(join(process.cwd(), "app/fonts/PlusJakartaSans-Bold.ttf")),
  ]);
  return [
    { name: "Bricolage", data: bricolage, weight: 800 as const, style: "normal" as const },
    { name: "Jakarta", data: jakarta, weight: 700 as const, style: "normal" as const },
  ];
}
