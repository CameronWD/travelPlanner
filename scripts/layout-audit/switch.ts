/**
 * What moves when a Traveller goes from one page of a trip to another by
 * tapping a link (client-side navigation through the App Router).
 *
 * Each pair is measured twice on a fresh page: as is, and with every React
 * Server Component response held back 1.5s (`held`), so the page being left
 * stays up while the new one is on its way and the swap itself is what is
 * measured. The target is visited once beforehand, because `next dev`
 * compiles a route on its first visit and does not prefetch.
 */

import type { BrowserContext } from "playwright";

import { settle } from "../lib/audit-browser";
import { CLS_INIT_JS, holdBackRsc, pushJs, readShifts, resetShifts, summariseShifts, type ClsResult } from "./loading";

export interface SwitchPair {
  from: string;
  to: string;
}

const TRIP_SECTIONS = ["home", "plan", "day", "budget", "calendar", "wishlist", "checklists", "files", "journal", "summary", "activity", "settings"];

export const SWITCH_PAIRS: SwitchPair[] = [
  ...TRIP_SECTIONS.slice(1).flatMap((to, i) => [
    { from: TRIP_SECTIONS[i], to },
    { from: to, to: TRIP_SECTIONS[i] },
  ]),
  { from: "trips", to: "home" },
  { from: "home", to: "trips" },
  { from: "globe", to: "trips" },
  { from: "account", to: "trips" },
  { from: "day", to: "day-next" },
  { from: "day-next", to: "day" },
];

type Shifts = Pick<ClsResult, "cls" | "total" | "shifts" | "largest">;

export interface SwitchResult extends Shifts {
  /** `switch/<from>-<to>/<profile>` — what LAYOUT_AUDIT_ONLY matches. */
  id: string;
  from: string;
  to: string;
  profile: string;
  held?: Shifts;
  error?: string;
}

const HELD_BACK_MS = 1500;
const AFTER_SETTLE_MS = 1500;

async function switchOnce(context: BrowserContext, fromUrl: string, toPath: string, hold: boolean): Promise<Shifts> {
  const page = await context.newPage();
  try {
    await page.addInitScript({ content: CLS_INIT_JS });
    await page.goto(fromUrl, { waitUntil: "load", timeout: 60_000 });
    await settle(page);
    await page.waitForTimeout(AFTER_SETTLE_MS);
    await resetShifts(page);
    const holdBack = holdBackRsc(HELD_BACK_MS);
    if (hold) await page.route("**/*", holdBack);
    try {
      if (!(await page.evaluate<boolean>(pushJs(toPath)))) throw new Error("window.next.router is not available, so a client-side navigation could not be driven");
      await page.waitForURL((u) => u.pathname === toPath, { timeout: 30_000 });
      await settle(page);
      await page.waitForTimeout(AFTER_SETTLE_MS);
      return summariseShifts(await readShifts(page));
    } finally {
      if (hold) await page.unroute("**/*", holdBack).catch(() => {});
    }
  } finally {
    await page.close().catch(() => {});
  }
}

/** Goes from `fromUrl` to `toPath` by client-side navigation on fresh pages
 * of `context` (Chromium) and returns the layout shifts of the swap. */
export async function measureSwitch(
  context: BrowserContext,
  fromUrl: string,
  toPath: string,
  meta: { from: string; to: string; profile: string },
): Promise<SwitchResult> {
  const id = `switch/${meta.from}-${meta.to}/${meta.profile}`;
  try {
    const warm = await context.newPage();
    try {
      await warm.goto(new URL(toPath, fromUrl).href, { waitUntil: "load", timeout: 60_000 });
      await settle(warm);
    } finally {
      await warm.close().catch(() => {});
    }
    const plain = await switchOnce(context, fromUrl, toPath, false);
    const held = await switchOnce(context, fromUrl, toPath, true);
    return { id, ...meta, ...plain, held };
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).split("\nCall log:")[0].replace(/\s+/g, " ").trim().slice(0, 500);
    return { id, ...meta, cls: 0, total: 0, shifts: 0, largest: [], error };
  }
}

export function mergeSwitch(prev: SwitchResult[], next: SwitchResult[]): SwitchResult[] {
  const rerun = new Map(next.map((r) => [r.id, r]));
  const seen = new Set(prev.map((r) => r.id));
  return [...prev.map((r) => rerun.get(r.id) ?? r), ...next.filter((r) => !seen.has(r.id))];
}
