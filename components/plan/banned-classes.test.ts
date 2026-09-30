import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIRS = ["components/plan", "lib/plan"];
// Every file this phase touches outside those folders. Each task appends its own.
const FILES = [
  "components/trip/card-actions.tsx",
  "components/trip/day-picker-menu.tsx",
  "components/trip/fit-titles.ts",
  "components/trip/itinerary-manager.tsx",
  "components/trip/transport-form-dialog.tsx",
  "components/trip/hard-end-date-control.tsx",
  "components/trip/route-map.tsx",
  "app/(app)/trips/[tripId]/plan/page.tsx",
  "components/trip/stop-form-dialog.tsx",
  "components/shell/app-paths.ts",
  "server/actions/stops.ts",
  "lib/validations/stop.ts",
];
const BANNED = [/shadow-soft/, /border-border\/70/, /bg-card\/40/];
const RAW_HEX = /["'\s]#[0-9a-fA-F]{6}\b/;

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const targets = [...DIRS.flatMap(walk), ...FILES].filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

describe("Phase 3 ban scan (handoff ground rules)", () => {
  it.each(targets)("%s has no soft shadows, 70% borders, translucent cards or raw hex", (file) => {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    for (const re of BANNED) expect(src).not.toMatch(re);
    expect(src).not.toMatch(RAW_HEX);
  });
});
