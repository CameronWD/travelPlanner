import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { walkSources } from "@/test/helpers/walk-sources";

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
  "app/(app)/trips/[tripId]/checklists/page.tsx",
  "app/(app)/trips/[tripId]/checklists/checklists-layout.tsx",
  "components/trip/reminders-card.tsx",
  "app/(app)/trips/[tripId]/settings/page.tsx",
  "components/trip/settings/chapters-switch.tsx",
  "app/(app)/trips/[tripId]/calendar/page.tsx",
  "app/(app)/trips/[tripId]/wishlist/page.tsx",
  "components/trip/calendar-views.tsx",
  "components/trip/wishlist-board.tsx",
  "components/trip/wishlist-header-actions.tsx",
  "components/trip/day/tonight-card.tsx",
  "components/trip/help-guide.tsx",
  "lib/help-guide.ts",
  "lib/scroll-to.ts",
  "lib/transport.ts",
];
const BANNED = [/shadow-soft/, /border-border\/70/, /bg-card\/40/];
const RAW_HEX = /["'\s]#[0-9a-fA-F]{6}\b/;

const targets = [
  ...DIRS.filter((d) => existsSync(d)).flatMap((d) => walkSources(d, { skipTests: true })),
  ...FILES,
].filter(
  (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
);

describe("Phase 3 ban scan (handoff ground rules)", () => {
  it.each(targets)("%s has no soft shadows, 70% borders, translucent cards or raw hex", (file) => {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    for (const re of BANNED) expect(src).not.toMatch(re);
    expect(src).not.toMatch(RAW_HEX);
  });
});
