import type { CSSProperties, ReactNode } from "react";
import { skyBands, type SceneKey } from "@/lib/weather/theme";
import { rainAngleDeg, sceneClip, sceneFade, SCATTER_W, SCENE_H as H, STRIP_TOP, type CardSize } from "@/lib/weather/scene-math";

// Every scene is drawn on a 236-unit-tall canvas and scales with the card, so
// the compact card shows the same picture. Two canvases: the subject, anchored
// to the card's right edge, and a wide world strip anchored left, for the
// layers that cross the whole card.
//
// Nothing drawn may touch the words. Layers that move are clipped (the
// `--wx-clip` polygon from lib/weather/scene-math.ts) out of the text block
// and the daylight strip. Pieces that stay put, bobbing clouds included, are
// placed clear of both and say where with `data-box` (x y w h, in their own
// canvas's units, motion included), which the tests check at the narrowest
// card of each height.
const MOTIF_W = 240;
const WORLD_W = 2400;

const INK = "hsl(var(--on-accent))";
const tok = (name: string) => `hsl(var(--${name}))`;
const vars = (v: Record<string, string | number>) => v as CSSProperties;

type Circle = readonly [cx: number, cy: number, r: number];
type Rect = readonly [x: number, y: number, w: number, h: number, rx: number];
interface Shape { circles: readonly Circle[]; boxes: readonly Rect[] }
type Box = readonly [x: number, y: number, w: number, h: number];

const PUFF: Shape = { circles: [[24, 32, 16], [50, 24, 22], [76, 32, 15]], boxes: [[0, 30, 100, 20, 10]] };
const LONG: Shape = { circles: [[28, 22, 13], [62, 16, 17], [100, 18, 15], [134, 23, 11]], boxes: [[0, 20, 160, 16, 8]] };
const HEAVY: Shape = { circles: [[26, 42, 18], [56, 30, 28], [90, 38, 22], [108, 48, 12]], boxes: [[0, 40, 120, 24, 12]] };

const r1 = (n: number) => Math.round(n * 10) / 10;
// Whole units, rounded outward, so a box never claims less than it covers.
const boxAttr = (boxes: readonly Box[]) =>
  boxes.map(([x, y, w, h]) => [Math.floor(x), Math.floor(y), Math.ceil(x + w) - Math.floor(x), Math.ceil(y + h) - Math.floor(y)].join(" ")).join(";");

function Still({ boxes, children }: { boxes: readonly Box[]; children: ReactNode }) {
  return <g data-box={boxAttr(boxes)}>{children}</g>;
}

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

function cutoutBox(shape: Shape, x: number, y: number, s: number, shadow: number): Box {
  const x0 = Math.min(...shape.circles.map(([cx, , r]) => cx - r), ...shape.boxes.map(([bx]) => bx));
  const y0 = Math.min(...shape.circles.map(([, cy, r]) => cy - r), ...shape.boxes.map(([, by]) => by));
  const x1 = Math.max(...shape.circles.map(([cx, , r]) => cx + r), ...shape.boxes.map(([bx, , w]) => bx + w));
  const y1 = Math.max(...shape.circles.map(([, cy, r]) => cy + r), ...shape.boxes.map(([, by, , h]) => by + h));
  return [x + s * x0 - 2, y + s * y0 - 2, s * (x1 - x0) + 4 + shadow, s * (y1 - y0) + 4 + shadow];
}

// A still cloud that bobs in place; its box covers the whole bob.
function Cloud({ shape, fill, x, y, s, shadow = 3, dx = 0, dy = 0, seconds = 10 }: {
  shape: Shape; fill: string; x: number; y: number; s: number; shadow?: number; dx?: number; dy?: number; seconds?: number;
}) {
  const [bx, by, bw, bh] = cutoutBox(shape, x, y, s, shadow);
  return (
    <Still boxes={[[bx + Math.min(0, dx), by + Math.min(0, dy), bw + Math.abs(dx), bh + Math.abs(dy)]]}>
      <Bob x={x} y={y} dx={dx} dy={dy} seconds={seconds}><Cutout shape={shape} fill={fill} s={s} shadow={shadow} /></Bob>
    </Still>
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

function Layer({ name, world = false, moving = false, children }: { name: string; world?: boolean; moving?: boolean; children: ReactNode }) {
  const w = world ? WORLD_W : MOTIF_W;
  const svg = (
    <svg
      data-layer={name}
      data-anchor={world ? "left" : "right"}
      viewBox={`0 0 ${w} ${H}`}
      className={world ? "absolute left-0 top-0 h-full w-auto max-w-none aspect-[2400/236]" : "absolute right-0 top-0 h-full w-auto max-w-none aspect-[240/236]"}
    >
      {children}
    </svg>
  );
  return moving ? <div data-clip className="absolute inset-0" style={{ clipPath: "var(--wx-clip)", maskImage: "var(--wx-fade)", WebkitMaskImage: "var(--wx-fade)" }}>{svg}</div> : svg;
}

// The last band starts at the daylight strip, so the strip is one flat colour.
function Sky({ bands }: { bands: string[] }) {
  const edges = bands.length === 3 ? [0, 62, (STRIP_TOP / H) * 100, 100] : [0, 62, 100];
  return (
    <svg data-layer="sky" viewBox="0 0 100 100" preserveAspectRatio="none" shapeRendering="crispEdges" className="absolute inset-0 size-full">
      {bands.map((band, i) => <rect key={band} x={0} y={edges[i]} width={100} height={edges[i + 1] - edges[i]} fill={tok(band)} />)}
    </svg>
  );
}

// Rays run from r + 4 to r + reach and breathe up to 1.08 times; the box
// covers the largest breath.
function Sun({ cx, cy, r, reach, fill, rays }: { cx: number; cy: number; r: number; reach: number; fill: string; rays: 1 | 2 }) {
  const ring = (count: number, inner: number, outer: number, offset: number) =>
    Array.from({ length: count }, (_, i) => {
      const a = ((i + offset) / count) * Math.PI * 2;
      return <line key={i} x1={r1(cx + Math.cos(a) * inner)} y1={r1(cy + Math.sin(a) * inner)} x2={r1(cx + Math.cos(a) * outer)} y2={r1(cy + Math.sin(a) * outer)} />;
    });
  const R = (r + reach) * 1.08 + 2;
  return (
    <Still boxes={[[cx - R, cy - R, 2 * R, 2 * R]]}>
      <g stroke={INK} strokeLinecap="round" className="wx-turn">
        <g strokeWidth={4} className="wx-breathe">{ring(12, r + 4, r + reach, 0)}</g>
        {rays === 2 ? <g strokeWidth={3} className="wx-breathe" style={{ animationDelay: "-1.6s" }}>{ring(12, r + 4, r + reach * 0.6, 0.5)}</g> : null}
      </g>
      <circle cx={cx + 3} cy={cy + 3} r={r + 1} fill={INK} />
      <circle cx={cx} cy={cy} r={r} fill={tok(fill)} stroke={INK} strokeWidth={2} />
    </Still>
  );
}

const RAIN_FRONT: readonly (readonly [number, number])[] = [[118, 108], [140, 140], [162, 116], [184, 150], [206, 104], [228, 132], [128, 158], [196, 128], [150, 100], [218, 160]];
const RAIN_BACK: readonly (readonly [number, number])[] = [[110, 130], [132, 104], [154, 150], [176, 120], [198, 146], [220, 112], [146, 126], [232, 150]];
const RAIN_TOP = 100;
const LANDING = STRIP_TOP - 2;

function Rain({ lean, front = RAIN_FRONT, back = RAIN_BACK }: { lean: number; front?: typeof RAIN_FRONT; back?: typeof RAIN_BACK }) {
  const rad = (lean * Math.PI) / 180;
  const drop = (len: number) => <line x1={0} y1={0} x2={0} y2={len} className="wx-drop" />;
  const landX = (x0: number, y0: number) => x0 - Math.tan(rad) * (LANDING - 13 - y0) - 13 * Math.sin(rad);
  return (
    <>
      <g stroke={tok("wx-cloud")} strokeWidth={2} strokeLinecap="round">
        {back.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}><g className="wx-fall" style={fall(y, RAIN_TOP, LANDING - 10, 1.3, lean)}>{drop(10)}</g></g>
        ))}
      </g>
      <g stroke={INK} strokeWidth={3} strokeLinecap="round">
        {front.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}><g className="wx-fall" style={fall(y, RAIN_TOP, LANDING - 13, 0.9, lean)}>{drop(13)}</g></g>
        ))}
      </g>
      <g stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none">
        {front.map(([x, y], i) => (
          <g key={i} transform={`translate(${landX(x, y).toFixed(1)} ${LANDING})`}>
            <path d="M-3 -1 L-7 -5 M0 -2 V-8 M3 -1 L7 -5" className="wx-splash" style={{ animationDuration: "0.9s", animationDelay: phase(y, RAIN_TOP, LANDING - 13, 0.9) }} />
          </g>
        ))}
      </g>
    </>
  );
}

// A low-discrepancy (R2) sequence: even cover without rows or columns, and the
// same on server and client.
const scatter = (n: number, w: number, h: number) =>
  Array.from({ length: n }, (_, i) => [Math.round(((0.5 + 0.7548776662 * i) % 1) * w), Math.round(((0.5 + 0.5698402910 * i) % 1) * h)] as const);

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
const SNOW_NEAR: readonly (readonly [number, number, "disc" | "star"])[] = [[96, 52, "star"], [132, 156, "disc"], [176, 18, "disc"], [206, 98, "star"], [226, 166, "disc"], [154, 76, "disc"], [116, 120, "star"]];

function Tree({ x, base, s }: { x: number; base: number; s: number }) {
  return (
    <Still boxes={[[x - 16 * s - 1, base - 40 * s - 1, 32 * s + 2, 40 * s + 1]]}>
      <g transform={`translate(${x} ${base}) scale(${s})`}>
        <polygon points="0,-40 -9,-25 -5,-25 -13,-12 -7,-12 -16,0 16,0 7,-12 13,-12 5,-25 9,-25" fill={INK} />
        <path d="M-5 -25 L0 -28 L5 -25 M-7 -12 L0 -16 L7 -12" stroke={tok("wx-cloud")} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </Still>
  );
}

type Point = readonly [number, number];
const quad = (a: Point, c: Point, b: Point, t: number): Point => [
  (1 - t) ** 2 * a[0] + 2 * t * (1 - t) * c[0] + t ** 2 * b[0],
  (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * c[1] + t ** 2 * b[1],
];

// A hill is a quadratic rise standing on the daylight strip, filled to it and
// outlined only along its crest, so no ink line runs along the strip. Its
// boxes are 8-unit slices from the crest to the strip, taken from the curve.
function Hill({ from, control, to, fill }: { from: Point; control: Point; to: Point; fill: string }) {
  const crest = `M${from[0]} ${from[1]} Q${control[0]} ${control[1]} ${to[0]} ${to[1]}`;
  const samples = Array.from({ length: 65 }, (_, i) => quad(from, control, to, i / 64));
  const boxes: Box[] = [];
  for (let x = Math.floor(from[0] / 8) * 8; x < to[0]; x += 8) {
    const ys = samples.filter(([sx]) => sx >= x - 1 && sx <= x + 9).map(([, sy]) => sy);
    if (!ys.length) continue;
    const top = Math.min(...ys, STRIP_TOP) - 1;
    boxes.push([x - 1, top, 10, Math.max(Math.max(...ys) + 1, STRIP_TOP) - top]);
  }
  return (
    <Still boxes={boxes}>
      <path d={`${crest} V${STRIP_TOP} H${from[0]} Z`} fill={tok(fill)} />
      <path d={crest} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    </Still>
  );
}

function farHills(peaks: number, top: number, dip: number) {
  const step = WORLD_W / peaks;
  let d = `M0 ${top + dip / 2}`;
  for (let i = 0; i < peaks; i++) d += ` Q${i * step + step / 2} ${i % 2 ? top + dip : top - dip / 2} ${(i + 1) * step} ${top + dip / 2}`;
  return d;
}

// Buildings stand on the daylight strip: [x, width, wall top, roof height];
// a roof taller than it is wide is a spire.
type Building = readonly [x: number, w: number, top: number, roof: number];
function Town({ buildings, fill, outline }: { buildings: readonly Building[]; fill: string; outline: boolean }) {
  const shape = ([x, w, top, roof]: Building) => roof ? `M${x} ${STRIP_TOP} V${top} L${x + w / 2} ${top - roof} L${x + w} ${top} V${STRIP_TOP}` : `M${x} ${STRIP_TOP} V${top} H${x + w} V${STRIP_TOP}`;
  return (
    <Still boxes={buildings.map(([x, w, top, roof]) => [x - 1, top - roof - 2, w + 2, STRIP_TOP - (top - roof) + 2])}>
      {buildings.map((b) => (
        <g key={b[0]}>
          <path d={`${shape(b)} Z`} fill={tok(fill)} />
          {outline ? <path d={shape(b)} fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" /> : null}
        </g>
      ))}
    </Still>
  );
}

const FAR_TOWN: readonly Building[] = [[74, 26, 122, 10], [100, 22, 112, 0], [122, 30, 124, 14], [156, 34, 116, 0], [194, 18, 104, 44], [214, 28, 120, 12]];
const NEAR_TOWN: readonly Building[] = [[76, 28, 150, 12], [108, 22, 144, 0], [134, 32, 154, 14], [170, 26, 148, 0], [196, 34, 142, 14], [228, 16, 152, 0]];

const BOLT = "M22 0 L2 38 L18 38 L10 70 L40 26 L24 26 L32 0 Z";

function Pill({ x, y, w, h, fill, outline = false, shadow = 0 }: { x: number; y: number; w: number; h: number; fill: string; outline?: boolean; shadow?: number }) {
  return (
    <>
      {shadow ? <rect x={x + shadow} y={y + shadow} width={w} height={h} rx={h / 2} fill={INK} /> : null}
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={tok(fill)} stroke={outline ? INK : undefined} strokeWidth={outline ? 2 : undefined} />
    </>
  );
}

// The curl hooks downward, under its own line.
function Streak({ x, y, len, width }: { x: number; y: number; len: number; width: number }) {
  const d = `M${x} ${y} H${x + len} a8 8 0 1 1 -8 8`;
  return (
    <>
      <path d={d} stroke={INK} strokeWidth={width + 3} />
      <path d={d} stroke={tok("wx-cloud")} strokeWidth={width} />
    </>
  );
}

// Every other star twinkles across a phone-width card (up to about 580
// units at compact height); past that, every fifth, which keeps the night
// scene near twenty animations however wide the card.
const twinkles = (x: number, i: number) => i % (x < 600 ? 2 : 5) === 0;

function Star({ x, y, r, seconds }: { x: number; y: number; r: number; seconds: number | null }) {
  const shape = r > 2
    ? <path d={`M${x} ${y - r * 2} Q${x} ${y} ${x + r * 2} ${y} Q${x} ${y} ${x} ${y + r * 2} Q${x} ${y} ${x - r * 2} ${y} Q${x} ${y} ${x} ${y - r * 2} Z`} />
    : <circle cx={x} cy={y} r={r} />;
  if (seconds == null) return shape;
  return <g className="wx-twinkle" style={{ animationDuration: `${seconds}s`, animationDelay: `${(-(x % 5)).toFixed(1)}s` }}>{shape}</g>;
}

// A flat burst behind the storm cloud, lit by the flash: never over the words.
function Burst({ cx, cy, outer, inner }: { cx: number; cy: number; outer: number; inner: number }) {
  const points = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? inner : outer;
    return `${r1(cx + Math.cos(a) * r)},${r1(cy + Math.sin(a) * r)}`;
  }).join(" ");
  return (
    <Still boxes={[[cx - outer, cy - outer, 2 * outer, 2 * outer]]}>
      <polygon points={points} fill={tok("wx-cloud")} className="wx-flash" />
    </Still>
  );
}

function draw(scene: SceneKey, lean: number): ReactNode {
  switch (scene) {
    case "sunny":
      return (
        <>
          <Layer name="far-clouds" world moving>
            <Pan tile={900} seconds={150}>
              <Cutout shape={LONG} fill="wx-cloud" x={100} y={146} s={0.55} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-cloud" x={560} y={124} s={0.45} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="sun"><Sun cx={189} cy={96} r={28} reach={18} fill="wx-sun-disc" rays={2} /></Layer>
        </>
      );
    case "partly":
      return (
        <>
          <Layer name="far-clouds" world moving>
            <Pan tile={760} seconds={140}>
              <Cutout shape={LONG} fill="wx-cloud-back" x={80} y={110} s={0.7} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-cloud-back" x={430} y={146} s={0.55} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="sun"><Sun cx={182} cy={69} r={14} reach={8} fill="wx-sunny" rays={1} /></Layer>
          <Layer name="near-cloud"><Cloud shape={LONG} fill="wx-cloud" x={106} y={60} s={0.75} dx={8} seconds={9} /></Layer>
        </>
      );
    case "overcast":
      return (
        <>
          <Layer name="far-clouds" world moving>
            <Pan tile={800} seconds={200}>
              <Cutout shape={LONG} fill="wx-fog" x={40} y={114} s={0.9} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-fog" x={420} y={88} s={0.7} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-fog" x={640} y={136} s={0.6} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="mid-clouds" world moving>
            <Pan tile={640} seconds={70}>
              <Cutout shape={PUFF} fill="wx-cloud-back" x={360} y={136} s={0.5} shadow={2} />
              <Cutout shape={LONG} fill="wx-cloud-back" x={520} y={140} s={0.5} shadow={2} />
            </Pan>
          </Layer>
          <Layer name="near-clouds">
            <Cloud shape={PUFF} fill="wx-cloud-back" x={152} y={136} s={0.5} shadow={2} dx={-4} seconds={11} />
            <Cloud shape={PUFF} fill="wx-cloud" x={125} y={46} s={1.1} dy={-2} seconds={8} />
          </Layer>
        </>
      );
    case "fog":
      return (
        <>
          <Layer name="far-fog" world moving>
            <Pan tile={900} seconds={160}>
              <Pill x={60} y={44} w={260} h={14} fill="wx-cloud" />
              <Pill x={420} y={82} w={180} h={14} fill="wx-cloud" />
              <Pill x={660} y={58} w={200} h={12} fill="wx-cloud" />
            </Pan>
          </Layer>
          <Layer name="far-town"><Town buildings={FAR_TOWN} fill="wx-overcast" outline={false} /></Layer>
          <Layer name="mid-fog" world moving>
            <Pan tile={700} seconds={100}>
              <Pill x={20} y={140} w={240} h={14} fill="wx-cloud-back" outline />
              <Pill x={380} y={146} w={200} h={14} fill="wx-cloud-back" outline />
            </Pan>
          </Layer>
          <Layer name="near-town"><Town buildings={NEAR_TOWN} fill="wx-overcast" outline /></Layer>
          <Layer name="near-fog" world moving>
            <Pan tile={560} seconds={60}>
              <Pill x={340} y={148} w={200} h={14} fill="wx-cloud" outline shadow={2} />
              <Pill x={300} y={108} w={150} h={14} fill="wx-cloud" />
            </Pan>
          </Layer>
        </>
      );
    case "rain":
      return (
        <>
          <Layer name="far-clouds" world moving>
            <Pan tile={720} seconds={120}>
              <Cutout shape={LONG} fill="wx-wind" x={60} y={52} s={0.8} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-wind" x={420} y={70} s={0.6} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="rain" moving><Rain lean={lean} /></Layer>
          <Layer name="near-cloud"><Cloud shape={HEAVY} fill="wx-cloud" x={108} y={44} s={1.05} dx={-2} dy={2} seconds={10} /></Layer>
        </>
      );
    case "snow":
      return (
        <>
          <Layer name="far-clouds" world moving>
            <Pan tile={680} seconds={240}>
              <Cutout shape={LONG} fill="wx-cloud" x={250} y={50} s={0.8} shadow={0} outline={false} />
              <Cutout shape={PUFF} fill="wx-cloud" x={520} y={62} s={0.6} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="far-snow" world moving>
            <Drift seconds={16} sway={5}>
              {scatter(Math.round((31 * SCATTER_W) / 680), SCATTER_W, H).map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><Flake r={2.2} /></g>)}
            </Drift>
          </Layer>
          <Layer name="far-hills" world>
            <Still boxes={[[0, 157, WORLD_W, STRIP_TOP - 157]]}>
              <path d={`${farHills(14, 160, 4)} V${STRIP_TOP} H0 Z`} fill={tok("wx-cloud-back")} />
              <path d={farHills(14, 160, 4)} fill="none" stroke={INK} strokeWidth={2} />
            </Still>
          </Layer>
          <Layer name="mid-snow" moving>
            <Drift seconds={10} sway={4}>
              {SNOW_MID.map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><Flake r={3.5} /></g>)}
            </Drift>
          </Layer>
          <Layer name="near-hill">
            <Hill from={[60, STRIP_TOP - 1]} control={[180, 162]} to={[244, 124]} fill="wx-cloud" />
            <Tree x={200} base={146} s={1} />
            <Tree x={226} base={136} s={0.72} />
          </Layer>
          <Layer name="near-snow" moving>
            {SNOW_NEAR.map(([x, y, kind], i) => (
              <Falling key={i} at={[x, y]} seconds={6 + (i % 2)} sway={3}>{kind === "star" ? <StarFlake size={7} /> : <Flake r={5.5} />}</Falling>
            ))}
          </Layer>
        </>
      );
    case "storm":
      return (
        <>
          <Layer name="flash"><Burst cx={170} cy={100} outer={54} inner={38} /></Layer>
          <Layer name="far-clouds" world moving>
            <Pan tile={680} seconds={90}>
              <Cutout shape={LONG} fill="wx-snow" x={40} y={52} s={0.8} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-snow" x={380} y={84} s={0.6} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="rain" moving><Rain lean={lean} front={RAIN_FRONT.filter((_, i) => i % 2 === 0)} back={RAIN_BACK.filter((_, i) => i % 2 === 1)} /></Layer>
          <Layer name="bolt">
            <Still boxes={[[150, 104, 40 * 0.8 + 4, 70 * 0.8 + 4]]}>
              <g transform="translate(150 104) scale(0.8)">
                <path d={BOLT} fill={INK} transform="translate(3 3)" />
                <path d={BOLT} fill={tok("wx-sunny")} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
              </g>
            </Still>
          </Layer>
          <Layer name="near-cloud"><Cloud shape={HEAVY} fill="wx-cloud-storm" x={111} y={44} s={1.02} dx={-2} dy={2} seconds={9} /></Layer>
        </>
      );
    case "wind":
      return (
        <>
          <Layer name="far-gusts" world moving>
            <g fill="none" stroke={tok("wx-cloud")} strokeWidth={2.5} strokeLinecap="round">
              <Pan tile={600} seconds={14}><path d="M40 58 H200" /><path d="M330 134 H450" /></Pan>
            </g>
          </Layer>
          <Layer name="near-cloud"><Cloud shape={PUFF} fill="wx-cloud" x={124} y={48} s={1} dx={-14} seconds={4} /></Layer>
          <Layer name="near-gusts" world moving>
            <g fill="none" strokeLinecap="round">
              <Pan tile={700} seconds={7}><Streak x={300} y={143} len={190} width={3} /></Pan>
              <Pan tile={820} seconds={4.5}><Streak x={560} y={146} len={240} width={4} /></Pan>
            </g>
          </Layer>
        </>
      );
    case "heat":
      return (
        <>
          <Layer name="sun"><Sun cx={196} cy={69} r={14} reach={8} fill="wx-sunny" rays={2} /></Layer>
          <Layer name="shimmer" world moving>
            <g fill="none" stroke={tok("wx-partly")} strokeWidth={3} strokeLinecap="round" strokeDasharray="46 38">
              {[[140, 3.2, 0], [149, 4.4, 30], [158, 5.6, 60]].map(([y, s, offset]) => (
                <Pan key={y} tile={80} seconds={s}><path d={`M0 ${y} q10 -5 20 0 t20 0 t20 0 t20 0`} strokeDashoffset={offset} /></Pan>
              ))}
            </g>
          </Layer>
        </>
      );
    case "night":
      return (
        <>
          <Layer name="stars" world moving>
            <Bob x={0} y={0} dx={-12} seconds={40}>
              <g fill={tok("wx-night-text")}>
                {scatter(Math.round((24 * SCATTER_W) / 680), SCATTER_W, 150).map(([x, y], i) => (
                  <Star key={i} x={x + 8} y={y + 8} r={i % 4 === 0 ? 3 : 1.5} seconds={twinkles(x, i) ? 2.4 + (i % 3) * 0.6 : null} />
                ))}
              </g>
            </Bob>
          </Layer>
          <Layer name="wisps" world moving>
            <Pan tile={1000} seconds={180}>
              <Cutout shape={LONG} fill="wx-night-track" x={120} y={78} s={0.8} shadow={0} outline={false} />
              <Cutout shape={LONG} fill="wx-night-track" x={640} y={112} s={0.6} shadow={0} outline={false} />
            </Pan>
          </Layer>
          <Layer name="moon">
            <Still boxes={[[159, 46, 75, 73]]}>
              <circle cx={193} cy={87} r={30} fill={tok("coral")} />
              <circle cx={190} cy={84} r={30} fill={tok("wx-sunny")} />
              <circle cx={206} cy={73} r={26} fill={tok("wx-night")} />
            </Still>
          </Layer>
        </>
      );
  }
}

export function Scene({ scene, isDay, gustsKph, size }: { scene: SceneKey; isDay: boolean; gustsKph: number | null; size: CardSize }) {
  const lean = rainAngleDeg(gustsKph);
  return (
    <div
      aria-hidden="true"
      data-scene={scene}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={vars({ "--wx-rain-angle": `${lean}deg`, "--wx-clip": sceneClip(scene, size), "--wx-fade": sceneFade(scene, size) })}
    >
      <Sky bands={skyBands(scene, isDay)} />
      {draw(scene, lean)}
    </div>
  );
}
