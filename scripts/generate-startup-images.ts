import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MARK_BODY_D, MARK_DOOR_D, MARK_POLES_D } from "@/components/ui/logo";
import { WORDMARK_VIEWBOX, WORDMARK_ASPECT, WORDMARK_TRANSFORM, WORDMARK_WORD_D, WORDMARK_DOT_D } from "@/lib/wordmark";
import { FORCED_THEME, noFlashScript } from "@/components/ui/theme-provider";
import {
  STARTUP_SIZES,
  STARTUP_THEMES,
  LAUNCH_TARGET,
  LOADER_MARK_SIZE as MARK_SIZE,
  LOADER_WORD_HEIGHT as WORD_HEIGHT,
  LOADER_GAP as GAP,
  LOADER_TOP_BAR as TOP_BAR,
  LOADER_CENTRE_OF_VIEWPORT,
  startupImageName,
  type StartupSize,
} from "@/lib/startup-images";

const CORAL = "#FF6B4A";

function svgFor(size: StartupSize): string {
  const { background, ink } = STARTUP_THEMES.light;
  const centreY = size.safeTop + TOP_BAR + LOADER_CENTRE_OF_VIEWPORT * size.height;
  const groupHeight = MARK_SIZE + GAP + WORD_HEIGHT;
  const top = centreY - groupHeight / 2;
  const wordWidth = WORD_HEIGHT * WORDMARK_ASPECT;
  const markX = (size.width - MARK_SIZE) / 2;
  const wordX = (size.width - wordWidth) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width * size.ratio}" height="${size.height * size.ratio}" viewBox="0 0 ${size.width} ${size.height}">
<rect width="${size.width}" height="${size.height}" fill="${background}"/>
<svg x="${markX}" y="${top}" width="${MARK_SIZE}" height="${MARK_SIZE}" viewBox="0 0 48 48">
<path d="${MARK_BODY_D}" fill="${CORAL}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>
<path d="${MARK_DOOR_D}" fill="${ink}"/>
<path d="${MARK_POLES_D}" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/>
</svg>
<svg x="${wordX}" y="${top + MARK_SIZE + GAP}" width="${wordWidth}" height="${WORD_HEIGHT}" viewBox="${WORDMARK_VIEWBOX}">
<g transform="${WORDMARK_TRANSFORM}"><path fill="${ink}" d="${WORDMARK_WORD_D}"/><path fill="${CORAL}" d="${WORDMARK_DOT_D}"/></g>
</svg>
</svg>`;
}

function launchPage(): string {
  const { light, dark } = STARTUP_THEMES;
  const groupHeight = MARK_SIZE + GAP + WORD_HEIGHT;
  const wordWidth = WORD_HEIGHT * WORDMARK_ASPECT;
  const target = LAUNCH_TARGET;
  return `<!DOCTYPE html>
<html lang="en" style="background:${light.background}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="${light.background}">
<title>Teepee</title>
<style>
html{background:${light.background}!important;color:${light.ink}}
html.dark{background:${dark.background}!important;color:${dark.ink}}
body{margin:0;min-height:100dvh}
.group{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top) + ${TOP_BAR}px + ${LOADER_CENTRE_OF_VIEWPORT * 100}dvh - ${groupHeight / 2}px);display:flex;flex-direction:column;align-items:center;gap:${GAP}px}
.idle{display:inline-flex}
a{display:none;margin-top:12px;font:600 16px/1.4 system-ui,-apple-system,sans-serif;color:inherit}
a.show{display:block}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes tp-build-draw { from { stroke-dasharray: 1 2; stroke-dashoffset: 1; } to { stroke-dasharray: 1 2; stroke-dashoffset: 0; } }
@keyframes tp-build-fill { from { fill-opacity: 0; } to { fill-opacity: 1; } }
@keyframes tp-build-door { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes tp-build-word { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: none; } }
@keyframes tp-build-dot { 0% { opacity: 0; transform: translateY(-35px); } 40% { opacity: 1; transform: translateY(0); } 65% { transform: translateY(-10px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes tp-build-idle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
.tp-build-outline { animation: tp-build-draw 450ms ease-out both, tp-build-fill 300ms ease-out 300ms both; }
.tp-build-door { transform-box: fill-box; transform-origin: bottom; animation: tp-build-door 300ms cubic-bezier(0.2, 0.8, 0.2, 1) 450ms both; }
.tp-build-poles { animation: tp-build-draw 250ms ease-out 650ms both; }
.tp-build-word { animation: tp-build-word 250ms ease-out 800ms both; }
.tp-build-dot { animation: tp-build-dot 300ms ease-out 1000ms both; }
.tp-build-idle { animation: tp-build-idle 1.6s ease-in-out 1300ms infinite; }
@media (prefers-reduced-motion: reduce) {
  .tp-build-outline, .tp-build-door, .tp-build-poles, .tp-build-word, .tp-build-dot, .tp-build-idle { animation: none; }
}
</style>
<script>${noFlashScript(FORCED_THEME)}</script>
<noscript><meta http-equiv="refresh" content="0;url=${target}"></noscript>
</head>
<body>
<div role="status" class="group">
<span class="tp-build-idle idle">
<svg width="${MARK_SIZE}" height="${MARK_SIZE}" viewBox="0 0 48 48" aria-hidden="true">
<path class="tp-build-outline" pathLength="1" d="${MARK_BODY_D}" fill="${CORAL}" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
<path class="tp-build-door" d="${MARK_DOOR_D}" fill="currentColor"/>
<path class="tp-build-poles" pathLength="1" d="${MARK_POLES_D}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
</svg>
</span>
<svg width="${wordWidth}" height="${WORD_HEIGHT}" viewBox="${WORDMARK_VIEWBOX}" aria-hidden="true">
<g transform="${WORDMARK_TRANSFORM}"><path class="tp-build-word" fill="currentColor" d="${WORDMARK_WORD_D}"/><path class="tp-build-dot" fill="${CORAL}" d="${WORDMARK_DOT_D}"/></g>
</svg>
<span class="sr-only">Loading</span>
<a id="open" href="${target}">Open Teepee</a>
</div>
<script>
location.replace('${target}');
setTimeout(function(){document.getElementById('open').className='show';},10000);
</script>
</body>
</html>
`;
}

async function main() {
  writeFileSync(join(process.cwd(), "public", "launch.html"), launchPage());
  const outDir = join(process.cwd(), "public", "splash");
  mkdirSync(outDir, { recursive: true });
  for (const size of STARTUP_SIZES) {
    const png = await sharp(Buffer.from(svgFor(size))).png({ compressionLevel: 9, palette: true }).toBuffer();
    writeFileSync(join(outDir, startupImageName(size)), png);
  }
}

main();
