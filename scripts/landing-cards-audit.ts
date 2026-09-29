/**
 * Landing phone-cards audit — `npm run audit:landing-cards`. Proves the phone
 * sample-card spread on the Landing at "/" covers its card area (spec
 * 2026-09-29 one-landing, Task 3): at 360×640, 390×844 and 430×932, neither
 * half of `[data-testid="sample-cards-phone"]` has an empty vertical band
 * taller than 60px, at least one piece is clipped by the bottom edge, and
 * the coral countdown sits wholly inside the area.
 *
 * Rects come from getBoundingClientRect(), which includes each piece's
 * rotation — the box that is actually visible. The judging lives in
 * scripts/landing-cards-audit/checks.ts (unit-tested).
 *
 * PREREQUISITES — as for the layout audit:
 *   - a running `next dev` at BASE_URL (default http://localhost:3000). Never
 *     `next start`: it loads .env.production.local. Local hosts only.
 *   - Playwright + Chromium, NOT a project dependency; resolved globally:
 *       NODE_PATH=/usr/local/lib/node_modules npm run audit:landing-cards
 *   - Signed out (a fresh context is): "/" must render the Landing.
 *
 * Screenshots go to `${OUT_DIR}/landing-cards-<w>x<h>.png` (default `.verify`).
 *
 * VERBOSE=1 also prints each piece's rect, relative to the area.
 *
 * Exit codes: 0 every check passed; 1 a check failed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { resolvePlaywright } from "./lib/audit-browser";
import { assertLocalBaseUrl } from "./layout-audit/config";
import { maxEmptyBand, type Box } from "./landing-cards-audit/checks";

const VIEWPORTS: Array<[number, number]> = [[360, 640], [390, 844], [430, 932]];
const MAX_BAND_PX = 60;
const SETTLE_MS = 1500;

async function main(): Promise<void> {
  const { chromium } = resolvePlaywright("audit:landing-cards");
  const baseUrl = assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3000").origin;
  const outDir = process.env.OUT_DIR ?? ".verify";
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  let failed = false;
  try {
    for (const [width, height] of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(SETTLE_MS);
      // No named helpers inside evaluate: tsx (esbuild keepNames) would wrap
      // them in a __name() call that does not exist in the page.
      const m = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="sample-cards-phone"]');
        if (!root) return null;
        const a = root.getBoundingClientRect();
        const pieces = Array.from(root.querySelectorAll("[data-piece]")).map((el) => {
          const r = el.getBoundingClientRect();
          return { name: el.getAttribute("data-piece") ?? "", x: r.x, y: r.y, width: r.width, height: r.height };
        });
        return { area: { x: a.x, y: a.y, width: a.width, height: a.height }, pieces };
      });
      const label = `${width}x${height}`;
      await page.screenshot({ path: path.join(outDir, `landing-cards-${label}.png`) });
      await context.close();

      if (!m) {
        console.log(`FAIL ${label}: no [data-testid="sample-cards-phone"] on /`);
        failed = true;
        continue;
      }
      const area: Box = m.area;
      const bottom = area.y + area.height;
      const left = maxEmptyBand(area, m.pieces, "left");
      const right = maxEmptyBand(area, m.pieces, "right");
      const clipped = m.pieces.filter((p) => p.y + p.height > bottom).map((p) => p.name);
      const coral = m.pieces.find((p) => p.name === "countdown");
      const coralInside =
        !!coral && coral.x >= area.x && coral.y >= area.y && coral.x + coral.width <= area.x + area.width && coral.y + coral.height <= bottom;
      const ok = left <= MAX_BAND_PX && right <= MAX_BAND_PX && clipped.length > 0 && coralInside;
      if (!ok) failed = true;
      console.log(
        `${ok ? "PASS" : "FAIL"} ${label}: area ${Math.round(area.width)}x${Math.round(area.height)}; ` +
          `left band ${Math.round(left)}px, right band ${Math.round(right)}px (max ${MAX_BAND_PX}); ` +
          `clipped by bottom: ${clipped.length ? clipped.join(", ") : "none"}; coral inside: ${coralInside}`,
      );
      if (process.env.VERBOSE) {
        for (const p of m.pieces) {
          const y = Math.round(p.y - area.y);
          console.log(`    ${p.name.padEnd(9)} x ${Math.round(p.x - area.x)}–${Math.round(p.x - area.x + p.width)}  y ${y}–${y + Math.round(p.height)}`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
