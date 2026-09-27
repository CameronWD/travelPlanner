import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { SceneKey } from "@/lib/weather/theme";

const MOTION = "motion-reduce:animate-none";

/** Cloud recipe (WEATHER_CARD §5): outlined layer, then the same shapes inset 2px without a border. */
export function Cloud({ fill, className, drift = false }: { fill: string; className?: string; drift?: boolean }) {
  const outline = "absolute rounded-full border-2 border-border bg-border";
  const inner = cn("absolute rounded-full", fill);
  return (
    <div className={cn("absolute h-[92px] w-[170px]", drift && `wx-drift ${MOTION}`, className)}>
      <span className={outline} style={{ left: 0, top: 40, width: 160, height: 50 }} />
      <span className={outline} style={{ left: 30, top: 10, width: 60, height: 60 }} />
      <span className={outline} style={{ left: 75, top: 0, width: 70, height: 70 }} />
      <span className={inner} style={{ left: 2, top: 42, width: 156, height: 46 }} />
      <span className={inner} style={{ left: 32, top: 12, width: 56, height: 56 }} />
      <span className={inner} style={{ left: 77, top: 2, width: 66, height: 66 }} />
    </div>
  );
}

function BackCloud({ className }: { className?: string }) {
  const outline = "absolute rounded-full border-2 border-border bg-border";
  const inner = "absolute rounded-full bg-wx-cloud-back";
  return (
    <div className={cn("absolute h-[60px] w-[110px]", className)}>
      <span className={outline} style={{ left: 0, top: 26, width: 100, height: 32 }} />
      <span className={outline} style={{ left: 22, top: 4, width: 44, height: 44 }} />
      <span className={inner} style={{ left: 2, top: 28, width: 96, height: 28 }} />
      <span className={inner} style={{ left: 24, top: 6, width: 40, height: 40 }} />
    </div>
  );
}

// Drops, snow and stars are laid out in the handoff's 420px-wide card, and the
// clouds/sun/moon they sit with are anchored from the right. Anchor these from
// the right too (right = 420 − x − width) so they stay with the cloud on wider
// cards (tablet full-width, desktop) instead of drifting left.
const HANDOFF_W = 420;
const DROP_W = 4;
const RAIN_DROPS = [[230, 106], [252, 132], [274, 110], [296, 140], [318, 108], [340, 134], [360, 152]];
const SNOW_DOTS = [[228, 14, 10], [262, 38, 14], [300, 10, 18], [330, 44, 8], [360, 22, 12], [392, 60, 16], [246, 76, 8], [286, 92, 12], [340, 84, 10], [372, 104, 14], [316, 128, 8], [396, 140, 10]];
const FOG_PILLS = [[190, -20, 24], [150, 40, 56], [170, -30, 88], [110, 60, 120]];
const WIND_BARS = [[150, 30, 40], [110, 60, 80], [170, 20, 120]];
const STARS = [[250, 20, 3], [290, 60, 4], [330, 30, 3], [380, 70, 3], [270, 120, 4], [350, 140, 3], [400, 110, 4], [240, 170, 3]];

export function Scene({ scene }: { scene: SceneKey }) {
  const wrap = (children: ReactNode) => (
    <div aria-hidden="true" data-scene={scene} className="pointer-events-none absolute inset-0 overflow-hidden">{children}</div>
  );
  switch (scene) {
    case "sunny":
      return wrap(<>
        <span className={cn("absolute size-[176px] rounded-full border-[3px] border-dashed border-border wx-spin", MOTION)} style={{ right: -34, top: -34 }} />
        <span className="absolute size-[120px] rounded-full border-2 border-border bg-wx-sun-disc" style={{ right: -6, top: -6 }} />
      </>);
    case "partly":
      return wrap(<>
        <span className="absolute size-[110px] rounded-full border-2 border-border bg-wx-sunny" style={{ right: 30, top: -10 }} />
        <Cloud fill="bg-wx-cloud" drift className="right-[-20px] top-[50px]" />
      </>);
    case "overcast":
      return wrap(<>
        <BackCloud className="right-[92px] top-[74px]" />
        <Cloud fill="bg-wx-cloud" drift className="right-[-10px] top-[14px]" />
      </>);
    case "fog":
      return wrap(FOG_PILLS.map(([w, r, t], i) => (
        <span key={i} className="absolute h-5 rounded-full border-2 border-border bg-wx-cloud" style={{ width: w, right: r, top: t }} />
      )));
    case "rain":
      return wrap(<>
        <Cloud fill="bg-wx-cloud" drift className="right-[-10px] top-[10px]" />
        {RAIN_DROPS.map(([x, y], i) => (
          <span key={i} className={cn("absolute h-[18px] w-1 rounded-sm bg-border wx-rain", MOTION)} style={{ right: HANDOFF_W - x - DROP_W, top: y, transform: "rotate(18deg)", animationDelay: `${(i * 0.17) % 1.2}s` }} />
        ))}
      </>);
    case "snow":
      return wrap(SNOW_DOTS.map(([x, y, s], i) => (
        <span key={i} className={cn("absolute rounded-full border-2 border-border bg-wx-cloud wx-snow", MOTION)} style={{ right: HANDOFF_W - x - s, top: y, width: s, height: s, animationDelay: `${(i * 0.25) % 3}s` }} />
      )));
    case "storm":
      return wrap(<>
        <Cloud fill="bg-wx-cloud-storm" drift className="right-[-10px] top-[10px]" />
        <span className="absolute h-[78px] w-12 bg-border" style={{ right: 60, top: 96, transform: "translate(4px, 4px)", clipPath: "polygon(55% 0,0 58%,40% 58%,25% 100%,100% 36%,58% 36%,80% 0)" }} />
        <span className="absolute h-[78px] w-12 bg-wx-sunny" style={{ right: 60, top: 96, clipPath: "polygon(55% 0,0 58%,40% 58%,25% 100%,100% 36%,58% 36%,80% 0)" }} />
      </>);
    case "wind":
      return wrap(WIND_BARS.map(([w, r, t], i) => (
        <span key={i} className="absolute" style={{ right: r, top: t, width: w, height: 26 }}>
          <span className="absolute left-0 top-[10px] h-1.5 rounded-[3px] bg-border" style={{ width: w - 14 }} />
          <span className="absolute right-0 top-0 size-[26px] rounded-full border-[6px] border-border border-b-transparent border-l-transparent" style={{ transform: "rotate(45deg)" }} />
        </span>
      )));
    case "heat":
      return wrap(<>
        <span className="absolute size-[200px] rounded-full border-[3px] border-dashed border-border" style={{ right: -46, top: -46 }} />
        <span className="absolute size-[156px] rounded-full border-[3px] border-dashed border-border" style={{ right: -24, top: -24 }} />
        <span className="absolute size-[108px] rounded-full border-2 border-border bg-wx-sunny" style={{ right: 0, top: 0 }} />
      </>);
    case "night":
      return wrap(<>
        {STARS.map(([x, y, s], i) => (
          <span key={i} className="absolute rounded-full bg-wx-night-text" style={{ right: HANDOFF_W - x - s, top: y, width: s, height: s }} />
        ))}
        <span className="absolute size-24 rounded-full bg-wx-sunny" style={{ right: 28, top: 22 }} />
        <span className="absolute size-[84px] rounded-full bg-wx-night" style={{ right: 28 - 18, top: 22 - 12 }} />
      </>);
  }
}
