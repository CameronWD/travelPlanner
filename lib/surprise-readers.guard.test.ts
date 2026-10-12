import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Drift guard (ADR 0072): every reader of Item/Accommodation rows must go
 * through `lib/surprise-visibility.ts`'s `where` fragments, and every reader
 * of an Attachment's bytes must go through `lib/surprise-guard.ts`'s access
 * check, or a Surprise's inside leaks to whoever it's hidden from. New
 * readers are easy to add and easy to forget to wire up, so this is checked
 * by import rather than by behaviour: no mocking a Prisma client convincingly
 * enough to prove omission across ~30 call sites, in the style of
 * `lib/trip-shell-reads.test.ts:53-73`.
 */

const root = process.cwd();

function src(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

// ── Every reader imports the visibility loader ───────────────────────────
const VISIBILITY_READERS = [
  "app/(app)/trips/[tripId]/plan/page.tsx",
  "lib/day-view-loader.ts",
  "app/(app)/trips/[tripId]/calendar/page.tsx",
  "app/(app)/trips/[tripId]/summary/page.tsx",
  "app/(app)/trips/[tripId]/print/page.tsx",
  "app/(app)/trips/[tripId]/budget/page.tsx",
  "lib/budget-loader.ts",
  "lib/money-due-count.ts",
  "app/(app)/trips/[tripId]/wishlist/page.tsx",
  "app/(app)/trips/[tripId]/files/page.tsx",
  "server/actions/search.ts",
  "server/actions/ai.ts",
  "app/(app)/trips/[tripId]/layout.tsx",
  "lib/nav-counts.ts",
  "lib/desktop-home-loader.ts",
  "lib/travelling-home-loader.ts",
  "lib/past-home-loader.ts",
  "lib/next-steps-loader.ts",
  "lib/flags-loader.ts",
  "server/actions/reminders.ts",
  "server/actions/activity.ts",
  "app/(app)/trips/[tripId]/activity/page.tsx",
  "app/share/[token]/page.tsx",
  "app/api/calendar/[token]/route.ts",
  "lib/digest-dispatch.ts",
  "lib/mcp/reads/trip-plan.ts",
  "lib/mcp/reads/costs.ts",
  "lib/mcp/reads/attachments.ts",
  "lib/mcp/tools/reads.ts",
];

describe("drift guard: every reader imports lib/surprise-visibility", () => {
  it.each(VISIBILITY_READERS)("%s", (file) => {
    expect(src(file)).toMatch(/from "@\/lib\/surprise-visibility"/);
  });
});

// ── Every attachment-bytes reader imports the guard ──────────────────────
const GUARD_READERS = [
  "app/api/attachments/[id]/route.ts",
  "lib/mcp/reads/attachment-content.ts",
  "lib/mcp/real-plan.ts",
];

describe("drift guard: every attachment-content reader imports lib/surprise-guard", () => {
  it.each(GUARD_READERS)("%s", (file) => {
    expect(src(file)).toMatch(/from "@\/lib\/surprise-guard"/);
  });
});

// ── New readers are caught by name ───────────────────────────────────────
/**
 * Walks every `page.tsx` under app/(app)/trips/[tripId]/** and fails if one
 * queries Items or Accommodation directly without importing the loader. A
 * page added later that reaches for `db.item.findMany`/
 * `db.accommodation.findMany` on its own, instead of through the loader,
 * fails here instead of quietly showing a surprised Traveller what's inside.
 */
function collectPageFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) collectPageFiles(p, out);
    else if (entry === "page.tsx") out.push(p);
  }
  return out;
}

describe("drift guard: no new reader of Item/Accommodation rows without the loader", () => {
  const tripRoot = path.join(root, "app", "(app)", "trips", "[tripId]");
  const pageFiles = collectPageFiles(tripRoot);

  it("walks a real set of trip pages", () => {
    expect(pageFiles.length).toBeGreaterThan(5);
  });

  it.each(pageFiles.map((f) => path.relative(root, f)))("%s", (file) => {
    const text = src(file);
    const queriesDirectly = /db\.item\.findMany|db\.accommodation\.findMany/.test(text);
    if (!queriesDirectly) return;
    expect(
      text,
      `${file} calls db.item.findMany or db.accommodation.findMany directly but does not import @/lib/surprise-visibility`,
    ).toMatch(/from "@\/lib\/surprise-visibility"/);
  });
});
