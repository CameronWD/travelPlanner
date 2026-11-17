import type { CSSProperties, ReactNode } from "react";
import { skyBands, type SceneKey } from "@/lib/weather/theme";
import { rainAngleDeg } from "@/lib/weather/scene-math";

// Every scene is drawn on a 236-unit-tall canvas (the regular card's height)
// and scales with the card, so the compact card shows the same picture. Two
// canvases: the subject, anchored to the card's right edge, and a wide world
// strip anchored left, for the layers that cross the whole card.
const H = 236;
const MOTIF_W = 240;
const WORLD_W = 2400;
// The daylight arc owns the card's bottom band; nothing that matters sits below.
const GROUND = 176;

const INK = "hsl(var(--on-accent))";
const tok = (name: string) => `hsl(var(--${name}))`;
const vars = (v: Record<string, string | number>) => v as CSSProperties;

type Circle = readonly [cx: number, cy: number, r: number];
type Box = readonly [x: number, y: number, w: number, h: number, rx: number];
interface Shape { circles: readonly Circle[]; boxes: readonly Box[] }

const PUFF: Shape = { circles: [[24, 32, 16], [50, 24, 22], [76, 32, 15]], boxes: [[0, 30, 100, 20, 10]] };
const LONG: Shape = { circles: [[28, 22, 13], [62, 16, 17], [100, 18, 15], [134, 23, 11]], boxes: [[0, 20, 160, 16, 8]] };
const HEAVY: Shape = { circles: [[26, 42, 18], [56, 30, 28], [90, 38, 22], [108, 48, 12]], boxes: [[0, 40, 120, 24, 12]] };

function parts({ circles, boxes }: Shape) {
  return (
    <>
      {circles.map(([cx, cy, r], i) => <circle key={`c${i}`} cx={cx} cy={cy} r={r} />)}
      {boxes.map(([x, y, w, h, rx], i) => <rect key={`b${i}`} x={x} y={y} width={w} height={h} rx={rx} />)}
    </>
  );
}

// The cards' recipe in SVG: the shapes' union outlined in ink (a 4-unit stroke
// under the fill leaves 2 outside), with a hard ink copy offset behind it.
function Cutout({ shape, fill, x = 0, y = 0, s = 1, shadow = 3, outline = true }: {
  shape: Shape; fill: string; x?: number; y?: number; s?: number; shadow?: number; outline?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {shadow ? <g transform={`translate(${shadow / s} ${shadow / s})`} fill={INK}>{parts(shape)}</g> : null}
      {outline ? <g fill={INK} stroke={INK} strokeWidth={4 / s}>{parts(shape)}</g> : null}
      <g fill={tok(fill)}>{parts(shape)}</g>
    </g>
  );
}

function Pan({ tile, seconds, children }: { tile: number; seconds: number; children: ReactNode }) {
  const copies = Math.ceil(WORLD_W / tile) + 1;
  return (
    <g className="wx-pan" style={vars({ "--wx-pan-by": `${-tile}px`, animationDuration: `${seconds}s` })}>
      {Array.from({ length: copies }, (_, k) => <g key={k} transform={`translate(${k * tile} 0)`}>{children}</g>)}
    </g>
  );
}

function Bob({ x, y, dx, dy = 0, seconds, children }: { x: number; y: number; dx: number; dy?: number; seconds: number; children: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="wx-bob" style={vars({ "--wx-bob-x": `${dx}px`, "--wx-bob-y": `${dy}px`, animationDuration: `${seconds}s` })}>{children}</g>
    </g>
  );
}

// One fall loop from `top` to `bottom`, phased so that at rest (and under
// reduced motion) the piece sits at y0. Leaning rain drifts left as it drops.
const phase = (y0: number, top: number, bottom: number, seconds: number) => `${(-((y0 - top) / (bottom - top)) * seconds).toFixed(2)}s`;

function fall(y0: number, top: number, bottom: number, seconds: number, lean = 0): CSSProperties {
  const k = -Math.tan((lean * Math.PI) / 180);
  const fromY = top - y0;
  const toY = bottom - y0;
  return vars({
    "--wx-fx": `${(k * fromY).toFixed(1)}px`, "--wx-fy": `${fromY}px`,
    "--wx-tx": `${(k * toY).toFixed(1)}px`, "--wx-ty": `${toY}px`,
    animationDuration: `${seconds}s`, animationDelay: phase(y0, top, bottom, seconds),
  });
}

function Layer({ name, world = false, children }: { name: string; world?: boolean; children: ReactNode }) {
  const w = world ? WORLD_W : MOTIF_W;
  return (
    <svg
      data-layer={name}
      viewBox={`0 0 ${w} ${H}`}
      className={world ? "absolute left-0 top-0 h-full w-auto max-w-none aspect-[2400/236]" : "absolute right-0 top-0 h-full w-auto max-w-none aspect-[240/236]"}
    >
      {children}
    </svg>
  );
}

function Sky({ bands }: { bands: string[] }) {
  const edges = bands.length === 3 ? [0, 62, 82, 100] : [0, 62, 100];
  return (
    <svg data-layer="sky" viewBox="0 0 100 100" preserveAspectRatio="none" shapeRendering="crispEdges" className="absolute inset-0 size-full">
      {bands.map((band, i) => <rect key={band} x={0} y={edges[i]} width={100} height={edges[i + 1] - edges[i]} fill={tok(band)} />)}
    </svg>
  );
}

function Sun({ cx, cy, r, fill, rays }: { cx: number; cy: number; r: number; fill: string; rays: 1 | 2 }) {
  const ring = (count: number, inner: number, outer: number, offset: number) =>
    Array.from({ length: count }, (_, i) => {
      const a = ((i + offset) / count) * Math.PI * 2;
      return <line key={i} x1={cx + Math.cos(a) * inner} y1={cy + Math.sin(a) * inner} x2={cx + Math.cos(a) * outer} y2={cy + Math.sin(a) * outer} />;
    });
  return (
    <>
      <g stroke={INK} strokeLinecap="round" className="wx-turn">
        <g strokeWidth={4} className="wx-breathe">{ring(12, r + 10, r + 24, 0)}</g>
        {rays === 2 ? <g strokeWidth={3} className="wx-breathe" style={{ animationDelay: "-1.6s" }}>{ring(12, r + 10, r + 16, 0.5)}</g> : null}
      </g>
      <circle cx={cx + 3} cy={cy + 3} r={r + 1} fill={INK} />
      <circle cx={cx} cy={cy} r={r} fill={tok(fill)} stroke={INK} strokeWidth={2} />
    </>
  );
}

const RAIN_FRONT: readonly (readonly [number, number])[] = [[78, 92], [100, 128], [122, 104], [144, 150], [164, 96], [186, 134], [206, 112], [134, 72], [196, 78], [224, 146]];
const RAIN_BACK: readonly (readonly [number, number])[] = [[88, 114], [112, 82], [132, 152], [154, 120], [176, 88], [198, 154], [218, 100], [70, 140]];
const RAIN_TOP = 60;

function Rain({ lean, front = RAIN_FRONT, back = RAIN_BACK }: { lean: number; front?: typeof RAIN_FRONT; back?: typeof RAIN_BACK }) {
  const rad = (lean * Math.PI) / 180;
  const drop = (len: number) => <line x1={0} y1={0} x2={0} y2={len} className="wx-drop" />;
  const landX = (x0: number, y0: number) => x0 - Math.tan(rad) * (GROUND - 10 - y0) - 13 * Math.sin(rad);
  return (
    <>
      <g stroke={tok("wx-cloud")} strokeWidth={2} strokeLinecap="round">
        {back.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}><g className="wx-fall" style={fall(y, RAIN_TOP, GROUND - 6, 1.3, lean)}>{drop(10)}</g></g>
        ))}
      </g>
      <g stroke={INK} strokeWidth={3} strokeLinecap="round">
        {front.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}><g className="wx-fall" style={fall(y, RAIN_TOP, GROUND - 10, 0.9, lean)}>{drop(13)}</g></g>
        ))}
      </g>
      <g stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none">
        {front.map(([x, y], i) => (
          <g key={i} transform={`translate(${landX(x, y).toFixed(1)} ${GROUND + 2})`}>
            <path d="M-3 -1 L-7 -5 M0 -2 V-8 M3 -1 L7 -5" className="wx-splash" style={{ animationDuration: "0.9s", animationDelay: phase(y, RAIN_TOP, GROUND - 10, 0.9) }} />
          </g>
        ))}
      </g>
    </>
  );
}

// Scattered layers in the world strip only cover the widest card they meet
// (about 680 units); anything further right would animate unseen.
const SCATTER_W = 680;

// A low-discrepancy (R2) sequence: even cover without rows or columns, and the
// same on server and client.
const scatter = (n: number, w: number, h: number) =>
  Array.from({ length: n }, (_, i) => [Math.round(((0.5 + 0.7548776662 * i) % 1) * w), Math.round(((0.5 + 0.5698402910 * i) % 1) * h)] as const);
// Flakes whose rest spot lands behind the temperature and condition are
// dropped, so a still scene (reduced motion) never parks one on the text.
const clearOfText = ([x, y]: readonly [number, number]) => x > 300 || y > 140;

function Flake({ r }: { r: number }) {
  return <circle r={r} fill={tok("wx-cloud")} stroke={INK} strokeWidth={r > 3 ? 2 : 1.5} />;
}

function StarFlake({ size }: { size: number }) {
  const arms = [0, 60, 120].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return `M${(-Math.cos(a) * size).toFixed(1)} ${(-Math.sin(a) * size).toFixed(1)} L${(Math.cos(a) * size).toFixed(1)} ${(Math.sin(a) * size).toFixed(1)}`;
  }).join(" ");
  return (
    <g fill="none" strokeLinecap="round">
      <path d={arms} stroke={INK} strokeWidth={5} />
      <path d={arms} stroke={tok("wx-cloud")} strokeWidth={2.5} />
    </g>
  );
}

// A whole layer falls as one group: drawn twice, one canvas height apart, so
// the loop has no seam, with two animations however many flakes it holds.
function Drift({ seconds, sway, children }: { seconds: number; sway: number; children: ReactNode }) {
  return (
    <g className="wx-fall" style={vars({ "--wx-fy": "0px", "--wx-ty": `${H}px`, animationDuration: `${seconds}s` })}>
      <g className="wx-sway" style={{ animationDuration: `${sway}s` }}>
        {children}
        <g transform={`translate(0 ${-H})`}>{children}</g>
      </g>
    </g>
  );
}

function Falling({ at, seconds, sway, children }: { at: readonly [number, number]; seconds: number; sway: number; children: ReactNode }) {
  const [x, y] = at;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="wx-fall" style={fall(y, -14, H + 14, seconds)}>
        <g className="wx-sway" style={{ animationDuration: `${sway}s`, animationDelay: `${(-(x % 7) / 2).toFixed(1)}s` }}>{children}</g>
      </g>
    </g>
  );
}

const SNOW_MID: readonly (readonly [number, number])[] = [[86, 20], [118, 70], [150, 30], [182, 92], [214, 44], [100, 132], [140, 112], [196, 150], [228, 116], [70, 84], [166, 160]];
const SNOW_NEAR: readonly (readonly [number, number, "disc" | "star"])[] = [[96, 52, "star"], [132, 156, "disc"], [176, 18, "disc"], [206, 98, "star"], [226, 176, "disc"], [154, 76, "disc"], [116, 190, "star"]];

function Tree({ x, base, s }: { x: number; base: number; s: number }) {
  return (
    <g transform={`translate(${x} ${base}) scale(${s})`}>
      <polygon points="0,-40 -9,-25 -5,-25 -13,-12 -7,-12 -16,0 16,0 7,-12 13,-12 5,-25 9,-25" fill={INK} />
      <path d="M-5 -25 L0 -28 L5 -25 M-7 -12 L0 -16 L7 -12" stroke={tok("wx-cloud")} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  );
}

function hills(peaks: number, top: number, dip: number) {
  const step = WORLD_W / peaks;
  let d = `M0 ${top + dip / 2}`;
  for (let i = 0; i < peaks; i++) d += ` Q${i * step + step / 2} ${i % 2 ? top + dip : top - dip / 2} ${(i + 1) * step} ${top + dip / 2}`;
  return `${d} V${H + 4} H0 Z`;
}

function Pill({ x, y, w, h, fill, outline = false, shadow = 0 }: { x: number; y: number; w: number; h: number; fill: string; outline?: boolean; shadow?: number }) {
  return (
    <>
      {shadow ? <rect x={x + shadow} y={y + shadow} width={w} height={h} rx={h / 2} fill={INK} /> : null}
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={tok(fill)} stroke={outline ? INK : undefined} strokeWidth={outline ? 2 : undefined} />
    </>
  );
}

const FAR_TOWN = "M40 184 V146 L56 132 L72 146 V138 H88 V124 H94 V138 L110 124 L126 138 V150 H140 V134 L156 120 L172 134 V150 H190 V112 H194 L203 72 L212 112 H216 V146 H226 V130 H232 V146 H244 V184 Z";
const NEAR_TOWN = "M70 184 V164 L84 152 L98 164 V158 H112 V148 H117 V158 H130 V166 L146 150 L162 166 V160 H176 V154 L188 144 L200 154 V168 H244 V184 Z";

const BOLT = "M22 0 L2 38 L18 38 L10 70 L40 26 L24 26 L32 0 Z";

function Streak({ x, y, len, width }: { x: number; y: number; len: number; width: number }) {
  const d = `M${x} ${y} H${x + len} a10 10 0 1 0 -10 -10`;
  return (
    <>
      <path d={d} stroke={INK} strokeWidth={width + 3} />
      <path d={d} stroke={tok("wx-cloud")} strokeWidth={width} />
    </>
  );
}

function Star({ x, y, r, seconds }: { x: number; y: number; r: number; seconds: number | null }) {
  const shape = r > 2
    ? <path d={`M${x} ${y - r * 2} Q${x} ${y} ${x + r * 2} ${y} Q${x} ${y} ${x} ${y + r * 2} Q${x} ${y} ${x - r * 2} ${y} Q${x} ${y} ${x} ${y - r * 2} Z`} />
    : <circle cx={x} cy={y} r={r} />;
  if (seconds == null) return shape;
  return <g className="wx-twinkle" style={{ animationDuration: `${seconds}s`, animationDelay: `${(-(x % 5)).toFixed(1)}s` }}>{shape}</g>;
}

function draw(scene: SceneKey, lean: number): ReactNode {
  switch (scene) {
    case "sunny":
      return (
        <>
          <Layer name="far-clouds" world>
            <Pan tile={900} seconds={150}>
              <Cutout shape={LONG} fill="wx-cloud" x={100} y={146} s={0.55} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-cloud" x={560} y={128} s={0.45} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="sun"><Sun cx={176} cy={60} r={40} fill="wx-sun-disc" rays={2} /></Layer>
        </>
      );
    case "partly":
      return (
        <>
          <Layer name="far-clouds" world>
            <Pan tile={760} seconds={140}>
              <Cutout shape={LONG} fill="wx-cloud-back" x={80} y={110} s={0.7} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-cloud-back" x={430} y={146} s={0.55} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="back-cloud">
            <Bob x={170} y={10} dx={-8} seconds={12}><Cutout shape={PUFF} fill="wx-cloud-back" s={0.62} shadow={2} /></Bob>
          </Layer>
          <Layer name="sun"><Sun cx={150} cy={60} r={34} fill="wx-sunny" rays={1} /></Layer>
          <Layer name="near-clouds">
            <Bob x={92} y={66} dx={10} seconds={9}><Cutout shape={PUFF} fill="wx-cloud" s={1.35} /></Bob>
          </Layer>
        </>
      );
    case "overcast":
      return (
        <>
          <Layer name="far-clouds" world>
            <Pan tile={800} seconds={200}>
              <Cutout shape={LONG} fill="wx-fog" x={40} y={114} s={0.9} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-fog" x={420} y={88} s={0.7} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-fog" x={640} y={140} s={0.6} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="mid-clouds" world>
            <Pan tile={640} seconds={70}>
              <Cutout shape={PUFF} fill="wx-cloud-back" x={120} y={140} s={0.7} shadow={2} />
              <Cutout shape={LONG} fill="wx-cloud-back" x={400} y={150} s={0.55} shadow={2} />
            </Pan>
          </Layer>
          <Layer name="near-clouds">
            <Bob x={40} y={92} dx={-6} seconds={11}><Cutout shape={PUFF} fill="wx-cloud-back" s={0.7} shadow={2} /></Bob>
            <Bob x={80} y={12} dx={10} seconds={8}><Cutout shape={PUFF} fill="wx-cloud" s={1.45} /></Bob>
          </Layer>
        </>
      );
    case "fog":
      return (
        <>
          <Layer name="far-fog" world>
            <Pan tile={900} seconds={160}>
              <Pill x={60} y={44} w={260} h={14} fill="wx-cloud" />
              <Pill x={420} y={82} w={180} h={14} fill="wx-cloud" />
              <Pill x={660} y={58} w={200} h={12} fill="wx-cloud" />
            </Pan>
          </Layer>
          <Layer name="far-town"><path d={FAR_TOWN} fill={tok("wx-overcast")} /></Layer>
          <Layer name="mid-fog" world>
            <Pan tile={700} seconds={100}>
              <Pill x={20} y={146} w={240} h={14} fill="wx-cloud-back" outline />
              <Pill x={380} y={152} w={200} h={14} fill="wx-cloud-back" outline />
            </Pan>
          </Layer>
          <Layer name="near-town"><path d={NEAR_TOWN} fill={tok("wx-overcast")} stroke={INK} strokeWidth={2} strokeLinejoin="round" /></Layer>
          <Layer name="near-fog" world>
            <rect x={0} y={GROUND} width={WORLD_W} height={H - GROUND} fill={tok("wx-cloud")} />
            <Pan tile={560} seconds={60}>
              <Pill x={30} y={166} w={300} h={20} fill="wx-cloud" outline shadow={3} />
              <Pill x={300} y={108} w={150} h={14} fill="wx-cloud" />
            </Pan>
          </Layer>
        </>
      );
    case "rain":
      return (
        <>
          <Layer name="far-clouds" world>
            <Pan tile={720} seconds={120}>
              <Cutout shape={LONG} fill="wx-wind" x={60} y={16} s={0.8} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-wind" x={420} y={44} s={0.6} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="rain"><Rain lean={lean} /></Layer>
          <Layer name="near-clouds">
            <Bob x={56} y={6} dx={6} seconds={10}><Cutout shape={HEAVY} fill="wx-cloud" s={1.4} /></Bob>
          </Layer>
        </>
      );
    case "snow":
      return (
        <>
          <Layer name="far-clouds" world>
            <Pan tile={SCATTER_W} seconds={240}>
              <Cutout shape={LONG} fill="wx-cloud" x={250} y={4} s={0.8} shadow={0} outline={false} />
              <Cutout shape={PUFF} fill="wx-cloud" x={520} y={26} s={0.6} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="far-snow" world>
            <Drift seconds={16} sway={5}>
              {scatter(31, SCATTER_W, H).filter(clearOfText).map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><Flake r={2.2} /></g>)}
            </Drift>
          </Layer>
          <Layer name="far-hills" world><path d={hills(14, 178, 12)} fill={tok("wx-cloud-back")} stroke={INK} strokeWidth={2} /></Layer>
          <Layer name="mid-snow">
            <Drift seconds={10} sway={4}>
              {SNOW_MID.map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><Flake r={3.5} /></g>)}
            </Drift>
          </Layer>
          <Layer name="near-hill">
            <path d="M58 240 Q122 166 244 176 V240 Z" fill={INK} transform="translate(3 3)" />
            <path d="M58 240 Q122 166 244 176 V240 Z" fill={tok("wx-cloud")} stroke={INK} strokeWidth={2} />
            <Tree x={178} base={184} s={1} />
            <Tree x={206} base={182} s={0.72} />
          </Layer>
          <Layer name="near-snow">
            {SNOW_NEAR.map(([x, y, kind], i) => (
              <Falling key={i} at={[x, y]} seconds={6 + (i % 2)} sway={3}>{kind === "star" ? <StarFlake size={7} /> : <Flake r={5.5} />}</Falling>
            ))}
          </Layer>
        </>
      );
    case "storm":
      return (
        <>
          <svg data-layer="flash" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
            <rect width={100} height={100} fill={tok("wx-cloud")} className="wx-flash" />
          </svg>
          <Layer name="far-clouds" world>
            <Pan tile={680} seconds={90}>
              <Cutout shape={LONG} fill="wx-snow" x={40} y={30} s={0.8} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-snow" x={380} y={70} s={0.6} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="rain"><Rain lean={lean} front={RAIN_FRONT.filter((_, i) => i % 2 === 0)} back={RAIN_BACK.filter((_, i) => i % 2 === 1)} /></Layer>
          <Layer name="bolt">
            <g transform="translate(138 84)">
              <path d={BOLT} fill={INK} transform="translate(3 3)" />
              <path d={BOLT} fill={tok("wx-sunny")} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
            </g>
          </Layer>
          <Layer name="near-clouds">
            <Bob x={56} y={4} dx={5} seconds={9}><Cutout shape={HEAVY} fill="wx-cloud-storm" s={1.4} /></Bob>
          </Layer>
        </>
      );
    case "wind":
      return (
        <>
          <Layer name="far-gusts" world>
            <g fill="none" stroke={tok("wx-cloud")} strokeWidth={2.5} strokeLinecap="round">
              <Pan tile={600} seconds={14}><path d="M40 58 H200" /><path d="M330 134 H450" /></Pan>
            </g>
          </Layer>
          <Layer name="near-clouds">
            <Bob x={110} y={26} dx={-14} seconds={4}><Cutout shape={PUFF} fill="wx-cloud" s={1} /></Bob>
          </Layer>
          <Layer name="near-gusts" world>
            <g fill="none" strokeLinecap="round">
              <Pan tile={700} seconds={7}><Streak x={60} y={164} len={190} width={3} /></Pan>
              <Pan tile={820} seconds={4.5}><Streak x={200} y={174} len={240} width={4} /></Pan>
            </g>
          </Layer>
        </>
      );
    case "heat":
      return (
        <>
          <Layer name="sun"><Sun cx={182} cy={50} r={38} fill="wx-sunny" rays={2} /></Layer>
          <Layer name="shimmer" world>
            <g fill="none" stroke={tok("wx-partly")} strokeWidth={3} strokeLinecap="round" strokeDasharray="46 38">
              {[[150, 3.2, 0], [162, 4.4, 30], [174, 5.6, 60]].map(([y, s, offset]) => (
                <Pan key={y} tile={80} seconds={s}><path d={`M0 ${y} q10 -5 20 0 t20 0 t20 0 t20 0`} strokeDashoffset={offset} /></Pan>
              ))}
            </g>
          </Layer>
        </>
      );
    case "night":
      return (
        <>
          <Layer name="stars" world>
            <g fill={tok("wx-night-text")}>
              {scatter(24, SCATTER_W, 150).map(([x, y], i) => <Star key={i} x={x + 8} y={y + 8} r={i % 4 === 0 ? 3 : 1.5} seconds={i % 2 ? null : 2.4 + (i % 3) * 0.6} />)}
            </g>
          </Layer>
          <Layer name="wisps" world>
            <Pan tile={1000} seconds={180}>
              <Cutout shape={LONG} fill="wx-night-track" x={120} y={78} s={0.8} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-night-track" x={640} y={112} s={0.6} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="moon">
            <circle cx={181} cy={67} r={34} fill={tok("coral")} />
            <circle cx={178} cy={64} r={34} fill={tok("wx-sunny")} />
            <circle cx={196} cy={52} r={30} fill={tok("wx-night")} />
          </Layer>
        </>
      );
  }
}

export function Scene({ scene, isDay, gustsKph }: { scene: SceneKey; isDay: boolean; gustsKph: number | null }) {
  const lean = rainAngleDeg(gustsKph);
  return (
    <div
      aria-hidden="true"
      data-scene={scene}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={vars({ "--wx-rain-angle": `${lean}deg` })}
    >
      <Sky bands={skyBands(scene, isDay)} />
      {draw(scene, lean)}
    </div>
  );
}
