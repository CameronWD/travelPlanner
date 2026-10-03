import type { Hue } from "@/lib/hues";
import { HUE_CLASSES } from "@/lib/hues";
import type { SketchModel } from "@/lib/trips/route-sketch";
import { cn } from "@/lib/cn";

const DOT_FILL: Record<Hue, string> = {
  sky: "bg-hue-sky", sun: "bg-hue-sun", leaf: "bg-hue-leaf", lilac: "bg-hue-lilac", pink: "bg-hue-pink",
  teal: "bg-hue-teal", coral: "bg-hue-coral", indigo: "bg-hue-indigo", stone: "bg-hue-stone",
};

export interface CoverRouteSketchProps {
  model: SketchModel;
  size: "hero" | "small";
  hue: Hue;
  /** Rendered inner-box width in px (small only): the edge chip needs ≥ 80. */
  boxPx?: number;
  /** Share After (SHARE.md §3): the whole trip has happened — draw it solid, not dashed. */
  solid?: boolean;
}

/**
 * TRIP_COVER.md §3 "Drawing": map-fill ground, faint grid, dashed polyline in
 * viewBox units, HTML dots positioned by %. Everything aria-hidden — the
 * card's link name carries the meaning.
 */
export function CoverRouteSketch({ model, size, hue, boxPx, solid }: CoverRouteSketchProps) {
  const hero = size === "hero";
  const vbH = hero ? 133 : 100;
  const grid = hero ? 16 : 12;
  const pts = model.points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = model.points.length - 1;
  const showChip = model.chip && (hero || (boxPx ?? 92) >= 80);
  return (
    <div data-cover-sketch aria-hidden="true" className={cn("relative size-full", HUE_CLASSES[hue].soft)}>
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: `${grid}px ${grid}px`,
        }}
      />
      <svg viewBox={`0 0 100 ${vbH}`} preserveAspectRatio="none" className="absolute inset-0 size-full text-foreground">
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.6} strokeDasharray={solid ? undefined : "3 2.5"} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {model.dotIndices.map((i) => {
        const p = model.points[i];
        const kind = i === 0 ? "first" : i === last ? "last" : "mid";
        const big = kind !== "mid";
        const px = hero ? (big ? 14 : 10) : big ? 10 : 7;
        return (
          <span
            key={i}
            data-dot={kind}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border",
              kind === "first" ? "bg-sun" : kind === "last" ? (hue === "coral" ? "bg-coral" : DOT_FILL[hue]) : "bg-card",
            )}
            style={{ left: `${p.x}%`, top: `${(p.y / vbH) * 100}%`, width: px, height: px }}
          />
        );
      })}
      {showChip ? (
        <span className="absolute bottom-[5px] left-[5px] whitespace-nowrap shrink-0 rounded-full border-[1.5px] border-border bg-card px-[6px] py-px text-[9px] font-extrabold text-foreground">
          {model.chip}
        </span>
      ) : null}
    </div>
  );
}
