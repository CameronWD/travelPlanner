import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";
import { WORDMARK_VIEWBOX, WORDMARK_ASPECT, WORDMARK_TRANSFORM, WORDMARK_WORD_D, WORDMARK_DOT_D } from "@/components/ui/logo-paths";

/**
 * Open Graph card, 1200×630, rendered by Satori (next/og). Sanctioned inline-style + hex file
 * (ADR 0060); values pinned to globals.css HSL by og-card.test.ts.
 * The site-wide default card, and the Share link's hero card (SHARE.md §3).
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

export interface ShareOgCardProps {
  name: string;
  subLine: string;
  sketch: { points: { x: number; y: number }[]; vbH: number; solid: boolean } | null;
}

/**
 * A Share link's preview (SHARE.md §3): the page's coral hero — pill, trip
 * name, sub line — with the cover polaroid. The cover is always the route
 * sketch (or the Mark), never the uploaded photo: there is no public photo route.
 */
export function ShareOgCard({ name, subLine, sketch }: ShareOgCardProps): ReactElement {
  return (
    <div style={{ width: 1200, height: 630, display: "flex", background: OG_COLOURS.coral, padding: 64, fontFamily: "Jakarta", color: OG_COLOURS.ink, position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: 680 }}>
        <div style={{ display: "flex", background: OG_COLOURS.card, border: `3px solid ${OG_COLOURS.ink}`, borderRadius: 999, padding: "6px 18px", fontSize: 22, letterSpacing: "0.08em" }}>SHARED TRIP</div>
        <div style={{ display: "flex", marginTop: 36, fontFamily: "Bricolage", fontSize: 96, lineHeight: 0.9, letterSpacing: "-0.05em", maxWidth: 680 }}>{name}</div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 34, fontWeight: 700 }}>{subLine}</div>
      </div>
      <div style={{ position: "absolute", right: 90, top: 90, display: "flex", transform: "rotate(4deg)", background: OG_COLOURS.card, border: `4px solid ${OG_COLOURS.ink}`, borderRadius: 16, padding: "14px 14px 40px", boxShadow: `12px 12px 0 ${OG_COLOURS.ink}` }}>
        <div style={{ width: 280, height: 373, display: "flex", alignItems: "center", justifyContent: "center", background: OG_COLOURS.paper, border: `3px solid ${OG_COLOURS.ink}` }}>
          {sketch ? (
            <svg viewBox={`0 0 100 ${sketch.vbH}`} width={280} height={373}>
              <polyline
                points={sketch.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={OG_COLOURS.ink}
                strokeWidth={1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
                {...(sketch.solid ? {} : { strokeDasharray: "3 2.5" })}
              />
            </svg>
          ) : (
            <Mark size={160} />
          )}
        </div>
      </div>
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
