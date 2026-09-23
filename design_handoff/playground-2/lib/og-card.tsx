import type { ReactElement } from "react";
import { WORDMARK_VIEWBOX, WORDMARK_ASPECT, WORDMARK_TRANSFORM, WORDMARK_WORD_D, WORDMARK_DOT_D } from "@/components/ui/logo-paths";

/**
 * Open Graph card, 1200×630, rendered by Satori (next/og). Satori can't read CSS variables or
 * Tailwind, so this is a sanctioned inline-style + hex file (values mirror globals.css).
 * Dynamic for share links (trip name, dates, nights, stops, chapter hues). NEVER costs.
 * Font: add BricolageGrotesque-ExtraBold.ttf and PlusJakartaSans-Bold.ttf to app/fonts/
 * (OFL, Google Fonts; Satori needs .ttf/.otf/.woff, not .woff2).
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;

const C = { paper: "#FFFBF3", ink: "#1D1D1B", muted: "#6B6660", coral: "#FF6B4A", sun: "#FFD166", teal: "#5BC0BE", lilac: "#C7A2FF", card: "#FFFFFF" };

function Wordmark({ h, color = C.ink }: { h: number; color?: string }) {
  return (
    <svg width={h * WORDMARK_ASPECT} height={h} viewBox={WORDMARK_VIEWBOX}>
      <g transform={WORDMARK_TRANSFORM}><path fill={color} d={WORDMARK_WORD_D} /><path fill={C.coral} d={WORDMARK_DOT_D} /></g>
    </svg>
  );
}

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path d="M24 5 L43 38 Q44.5 41 41 41 H30 L24 47 L18 41 H7 Q3.5 41 5 38 Z" fill={C.coral} stroke={C.ink} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 20 L32 41 H30 L24 47 L18 41 H16 Z" fill={C.ink} />
      <path d="M18 5 L24 12 L30 5" fill="none" stroke={C.ink} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export interface OgTrip {
  name: string;
  /** Pre-formatted, e.g. "12 – 24 Oct 2026". */
  dates: string;
  nights: number;
  /** Ordered stop names; the card shows the first 5 and "+N". */
  stops: { name: string; hex: string }[];
  /** e.g. "In 23 days", "Day 4 of 12", "Back home". From describePhase(). */
  phase?: string;
}

export function ShareOgCard({ trip }: { trip: OgTrip }): ReactElement {
  const shown = trip.stops.slice(0, 5);
  const more = trip.stops.length - shown.length;
  const size = trip.name.length > 28 ? 84 : trip.name.length > 18 ? 104 : 124;
  return (
    <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: C.paper, padding: "56px 64px", fontFamily: "Jakarta", color: C.ink, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Wordmark h={40} />
        {trip.phase ? <div style={{ display: "flex", padding: "10px 20px", borderRadius: 999, border: `3px solid ${C.ink}`, background: C.sun, fontSize: 26, fontWeight: 700 }}>{trip.phase}</div> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 18, maxWidth: 900 }}>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: size, lineHeight: 0.92, letterSpacing: "-0.045em" }}>{trip.name}</div>
        <div style={{ display: "flex", gap: 22, fontSize: 32, fontWeight: 700, color: C.muted }}>
          <span>{trip.dates}</span><span>·</span><span>{trip.nights} nights</span><span>·</span><span>{trip.stops.length} stops</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 34, flexWrap: "wrap" }}>
        {shown.map((s, i) => (
          <div key={s.name + i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px 10px 12px", borderRadius: 999, border: `3px solid ${C.ink}`, background: s.hex, fontSize: 26, fontWeight: 700, boxShadow: `4px 4px 0 ${C.ink}` }}>
              <div style={{ display: "flex", width: 30, height: 30, borderRadius: 999, background: C.ink, color: C.paper, alignItems: "center", justifyContent: "center", fontSize: 17 }}>{i + 1}</div>
              {s.name}
            </div>
            {i < shown.length - 1 ? <div style={{ display: "flex", width: 22, height: 3, background: C.ink }} /> : null}
          </div>
        ))}
        {more > 0 ? <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: C.muted, marginLeft: 6 }}>+{more} more</div> : null}
      </div>
      <div style={{ position: "absolute", right: 64, top: 150, display: "flex", transform: "rotate(8deg)" }}><Mark size={170} /></div>
    </div>
  );
}

/** Root / non-share pages. Static content, same system. */
export function DefaultOgCard(): ReactElement {
  return (
    <div style={{ width: 1200, height: 630, display: "flex", background: C.coral, padding: 64, fontFamily: "Jakarta", color: C.ink, position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, background: C.paper, border: `4px solid ${C.ink}`, borderRadius: 40, boxShadow: `12px 12px 0 ${C.ink}`, padding: "52px 60px" }}>
        <Wordmark h={48} />
        <div style={{ display: "flex", marginTop: "auto", fontFamily: "Bricolage", fontSize: 100, lineHeight: 0.92, letterSpacing: "-0.045em", maxWidth: 760 }}>Plan the trip together.</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 32, fontWeight: 700, color: C.muted }}>Stops, beds, trains and the shared pot, in one place.</div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 96, display: "flex", transform: "rotate(8deg)" }}><Mark size={190} /></div>
    </div>
  );
}

export async function ogFonts() {
  const [bricolage, jakarta] = await Promise.all([
    fetch(new URL("../app/fonts/BricolageGrotesque-ExtraBold.ttf", import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL("../app/fonts/PlusJakartaSans-Bold.ttf", import.meta.url)).then((r) => r.arrayBuffer()),
  ]);
  return [
    { name: "Bricolage", data: bricolage, weight: 800 as const, style: "normal" as const },
    { name: "Jakarta", data: jakarta, weight: 700 as const, style: "normal" as const },
  ];
}
