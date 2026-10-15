import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { SCOPE_PAGES, SCOPE_TABLES, revalidateAccount, revalidateAllTripHomes, revalidateTrip, revalidateTripsList, type TripPage } from "./revalidate";

beforeEach(() => revalidatePathMock.mockClear());

describe("revalidateTrip", () => {
  it("money revalidates the pages that read Costs, by id path, once each", () => {
    revalidateTrip("t1", "money", "money");
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/trips/t1/budget");
    expect(paths).toContain("/trips/t1");
    expect(new Set(paths).size).toBe(paths.length);
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/trips/t1", "layout");
  });
  it("the day pages go through the route pattern", () => {
    revalidateTrip("t1", "journal");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/[tripId]/day/[date]", "page");
  });
  it("trip and travellers are layout-wide (NAV-02) and nothing else is", () => {
    revalidateTrip("t1", "plan", "travellers");
    expect(revalidatePathMock.mock.calls).toEqual([["/trips/t1", "layout"]]);
    revalidatePathMock.mockClear();
    revalidateTrip("t1", "trip");
    expect(revalidatePathMock.mock.calls).toEqual([["/trips/t1", "layout"], ["/trips"]]);
  });
  it("account is root-layout-wide; the trips list is one path", () => {
    revalidateAccount();
    revalidateTripsList();
    expect(revalidatePathMock.mock.calls).toEqual([["/", "layout"], ["/trips"]]);
  });
  it("revalidateAllTripHomes revalidates every Trip Home through the route pattern", () => {
    revalidateAllTripHomes();
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/[tripId]", "page");
  });
});

/**
 * Which tables each page under /trips/{id} reads. Keep in step with the pages'
 * loaders (readPlan, getDay, readTripShell, …). "" is Home.
 *
 * Verified against each page's loader (task 4, 2026-10-15):
 * - "/calendar", "/summary", "/print" read the real plan directly
 *   (`readPlan(tripId, user.id, null)`), never `resolvePlanParam` — grepping
 *   their page.tsx files for `resolvePlanParam`/`readFork` finds nothing, so
 *   they never read the `fork` table. Dropped from the brief's draft list
 *   (an inert correction: `plan` scope already includes all three via their
 *   stop/item/transport/accommodation/chapter reads).
 * - "/wishlist" DOES call `resolvePlanParam(tripId, plan)`
 *   (app/(app)/trips/[tripId]/wishlist/page.tsx), which conditionally reads
 *   `fork` via `readFork` — added (also inert: `plan` scope already includes
 *   it via stop/item).
 */
const PAGE_READS: Record<TripPage, readonly string[]> = {
  "": ["trip", "stop", "item", "transport", "accommodation", "cost", "exchangeRate", "chapter", "checklistItem", "reminder"],
  "/plan": ["stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate", "fork", "attachment", "note", "dayTitle", "reminder", "tripMember"],
  "/budget": ["stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate", "fork"],
  "/calendar": ["stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate", "dayTitle"],
  "/summary": ["stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate", "trip"],
  "/print": ["stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate"],
  "/compare": ["fork", "stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate"],
  "/day": ["accommodation", "attachment", "chapter", "cost", "dayTitle", "item", "journalEntry", "stop", "transport", "trip"],
  "/journal": ["journalEntry", "attachment", "trip", "tripMember"],
  "/checklists": ["checklistItem", "packingTemplate", "trip", "tripMember", "stop", "reminder"],
  "/wishlist": ["trip", "item", "cost", "note", "vote", "stop", "attachment", "tripMember", "fork"],
  "/files": ["attachment", "item", "stop", "transport", "accommodation"],
  "/settings": ["trip", "tripMember", "invite", "shareLink", "calendarFeed", "digest", "chapter"],
};

describe("scope coverage", () => {
  it("every page that reads a table is in each scope that writes it", () => {
    const misses: string[] = [];
    for (const [scope, tables] of Object.entries(SCOPE_TABLES) as [keyof typeof SCOPE_TABLES, readonly string[]][]) {
      const pages = SCOPE_PAGES[scope];
      if (pages === "layout") continue;
      for (const [page, reads] of Object.entries(PAGE_READS) as [TripPage, readonly string[]][]) {
        if (tables.some((t) => reads.includes(t)) && !pages.includes(page)) misses.push(`${scope} → ${page || "Home"}`);
      }
    }
    expect(misses).toEqual([]);
  });
  it("PAGE_READS names every page SCOPE_PAGES knows", () => {
    for (const pages of Object.values(SCOPE_PAGES)) if (pages !== "layout") for (const p of pages) expect(PAGE_READS).toHaveProperty([p]);
  });
});
