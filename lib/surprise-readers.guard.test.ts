import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Drift guard (ADR 0072, amended 2026-10-15): every reader of Item/
 * Accommodation rows that does not go through `readPlan` must import
 * `lib/surprise-visibility.ts`, and every reader of an Attachment's bytes must
 * import `lib/surprise-guard.ts`, or a Surprise's inside leaks to whoever it's
 * hidden from. Checked by import, not behaviour.
 *
 * This guard shrinks as readers move onto `readPlan` (lib/plan-reads.ts): a
 * page that calls `readPlan` is covered by its required viewer argument, so it
 * leaves this list. The eight pages and routes Tasks 13–17 migrate (Plan,
 * Calendar, Summary, Print, Budget, Wishlist, Share, the Calendar feed) are
 * already off it. server/actions/forks.ts stays: only getComparison moves onto
 * readPlan, and its other readers (the promote preview) keep the loader.
 */

const root = process.cwd();

function src(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

// ── Readers that never route through readPlan import the visibility loader ──
// lib/nav-counts.ts and lib/next-steps-loader.ts are not listed: they read
// through lib/flags-loader.ts's loadFlagRows (listed), which applies it.
const VISIBILITY_READERS = [
  "lib/day-view-loader.ts",
  "lib/budget-loader.ts",
  "lib/money-due-count.ts",
  "app/(app)/trips/[tripId]/files/page.tsx",
  "server/actions/search.ts",
  "server/actions/ai.ts",
  "app/(app)/trips/[tripId]/layout.tsx",
  "lib/desktop-home-loader.ts",
  "lib/travelling-home-loader.ts",
  "lib/past-home-loader.ts",
  "lib/flags-loader.ts",
  "lib/reminder-reads.ts",
  "lib/activity-reads.ts",
  "app/(app)/trips/[tripId]/activity/page.tsx",
  "lib/digest-dispatch.ts",
  "lib/mcp/reads/trip-plan.ts",
  "lib/mcp/reads/costs.ts",
  "lib/mcp/reads/attachments.ts",
  "lib/mcp/tools/reads.ts",
  "server/actions/forks.ts",
];

describe("drift guard: every non-readPlan reader imports lib/surprise-visibility", () => {
  it.each(VISIBILITY_READERS)("%s", (file) => {
    expect(src(file)).toMatch(/from "@\/lib\/surprise-visibility"/);
  });
});

// ── Every attachment-bytes reader imports the guard ──────────────────────
// lib/mcp/real-plan.ts's per-kind Surprise check moved into lib/guards.ts's
// requireRowAccess (d0e2f18d, spec 2026-10-14 card C), so the guard's import
// now lives there and real-plan.ts is pinned to delegate to it.
const GUARD_READERS = [
  "app/api/attachments/[id]/route.ts",
  "lib/mcp/reads/attachment-content.ts",
  "lib/guards.ts",
];

describe("drift guard: every attachment-content reader imports lib/surprise-guard", () => {
  it.each(GUARD_READERS)("%s", (file) => {
    expect(src(file)).toMatch(/from "@\/lib\/surprise-guard"/);
  });

  it("lib/mcp/real-plan.ts goes through requireRowAccess", () => {
    expect(src("lib/mcp/real-plan.ts")).toMatch(/import \{[^}]*\brequireRowAccess\b[^}]*\} from "@\/lib\/guards"/);
  });
});
