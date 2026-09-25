import { describe, it, expect, vi, beforeEach } from "vitest";

// phase-sketching.tsx is a lightweight async server component with two DB
// calls. We assert their fork-scoping by mocking db per-model methods
// directly (mirrors server/actions/search.test.ts and the sibling
// phase-planning.test.tsx / phase-past.test.tsx / phase-travelling.test.tsx).

const { stopFindManyMock, chapterFindManyMock } = vi.hoisted(() => ({
  stopFindManyMock: vi.fn(),
  chapterFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindManyMock },
    chapter: { findMany: chapterFindManyMock },
  },
}));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/trip/chapter-chip", () => ({ ChapterChip: () => null }));
vi.mock("@/components/trip/home/quick-actions", () => ({ QuickActions: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
// React import needed for JSX in mocks above
import React from "react";

const { PhaseSketching } = await import("./phase-sketching");

describe("PhaseSketching fork-scoped plan queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([
      { id: "s1", name: "Rome", country: "Italy", nights: 3, chapterId: null, arriveDate: null },
    ]);
    chapterFindManyMock.mockResolvedValue([]);
  });

  async function renderSketching() {
    await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip" });
  }

  it("scopes the stops query to the real plan", async () => {
    await renderSketching();
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the chapters query to the real plan", async () => {
    await renderSketching();
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });
});

describe("PhaseSketching chapter gating (Task 13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([
      { id: "s1", name: "Rome", country: "Italy", nights: 3, chapterId: null, arriveDate: null },
    ]);
    chapterFindManyMock.mockResolvedValue([
      { id: "c1", name: "Chapter One", colour: "sky" },
    ]);
  });

  it("skips the chapters query when chaptersEnabled is false", async () => {
    await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip", chaptersEnabled: false });
    expect(chapterFindManyMock).not.toHaveBeenCalled();
  });

  it("runs the chapters query when chaptersEnabled is true", async () => {
    await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip", chaptersEnabled: true });
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("defaults to enabled when chaptersEnabled is omitted (pre-toggle call sites)", async () => {
    await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip" });
    expect(chapterFindManyMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Playground kit restyle (Task 10b) — kit DHome.jsx / Home.jsx hero + Route card
// ---------------------------------------------------------------------------

const { renderToStaticMarkup } = await import("react-dom/server");
const { EmptyState } = await import("@/components/ui/empty-state");

function findEl(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findEl(n, type);
      if (f) return f;
    }
    return null;
  }
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type === type) return el as { props: Record<string, unknown> };
  return findEl(el.props?.children, type);
}

describe("PhaseSketching Playground kit restyle (Task 10b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([
      { id: "s1", name: "Rome", country: "Italy", nights: 3, chapterId: null, arriveDate: null },
      { id: "s2", name: "Florence", country: "Italy", nights: 2, chapterId: null, arriveDate: null },
    ]);
    chapterFindManyMock.mockResolvedValue([]);
  });

  it("renders the coral hero Card and a Route Card, headings in order", async () => {
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(
      (await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip" })) as Parameters<typeof renderToStaticMarkup>[0],
    );
    expect([...div.querySelectorAll("h2, h3")].map((h) => h.textContent)).toEqual(["Test Trip", "Route"]);
    const hero = div.querySelector("h2")!.closest("div.border-2")!;
    expect(hero.className).toMatch(/\bbg-coral\b/);
    expect(hero.className).toMatch(/\bshadow-hard-3\b/);
    expect(hero.textContent).toContain("Sketching");
    expect(hero.textContent).toContain("2 places · ~5 nights sketched");
    const route = div.querySelectorAll("h3")[0].closest("div.border-2")!;
    expect(route.className).toMatch(/\bshadow-hard-\d\b/);
    expect(route.textContent).toContain("Rome");
    expect(route.textContent).toContain("~3n");
    expect(div.innerHTML).not.toMatch(/rounded-2xl border border-border|shadow-soft/);
    expect(div.textContent).not.toMatch(/per person|each owes|split/i);
  });

  it("keeps 'Firm up →' the hero's primary (ink) button — the island re-scopes --primary-foreground", async () => {
    const { Button } = await import("@/components/ui/button");
    const tree = await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip" });
    const btn = findEl(tree, Button)!;
    expect((btn.props.children as { props: { children: string } }).props.children).toBe("Firm up →");
    expect(btn.props.variant ?? "primary").toBe("primary");
  });

  it("renders the kit 'Plan' empty treatment when there are no stops", async () => {
    stopFindManyMock.mockResolvedValue([]);
    const tree = await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip" });
    const empty = findEl(tree, EmptyState);
    expect(empty).not.toBeNull();
    expect(empty!.props.title).toBe("No stops yet");
    expect(empty!.props.tone).toBe("teal");
  });
});

// ---------------------------------------------------------------------------
// Reminders slot (Task 5 — LA-029/045)
// ---------------------------------------------------------------------------

describe("PhaseSketching reminders slot (LA-029/045)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([
      { id: "s1", name: "Rome", country: "Italy", nights: 3, chapterId: null, arriveDate: null },
    ]);
    chapterFindManyMock.mockResolvedValue([]);
  });

  it("renders reminders inside the right column, not as a full-width row", async () => {
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(
      (await PhaseSketching({
        tripId: "trip-1",
        tripName: "Test Trip",
        reminders: React.createElement("div", { "data-testid": "reminders" }),
      })) as Parameters<typeof renderToStaticMarkup>[0],
    );
    const marker = div.querySelector('[data-testid="reminders"]');
    expect(marker).not.toBeNull();
    expect(marker!.closest("[data-home-aside]")).not.toBeNull();
  });

  it("still renders reminders when the trip has no stops (no aside to align with)", async () => {
    stopFindManyMock.mockResolvedValue([]);
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(
      (await PhaseSketching({
        tripId: "trip-1",
        tripName: "Test Trip",
        reminders: React.createElement("div", { "data-testid": "reminders" }),
      })) as Parameters<typeof renderToStaticMarkup>[0],
    );
    expect(div.querySelector('[data-testid="reminders"]')).not.toBeNull();
  });

  // M-4: the empty branch stacks EmptyState and Reminders with the page's
  // card gap, rather than rendering Reminders flush under the empty state.
  it("spaces reminders below the no-stops empty state with the card gap", async () => {
    stopFindManyMock.mockResolvedValue([]);
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(
      (await PhaseSketching({
        tripId: "trip-1",
        tripName: "Test Trip",
        reminders: React.createElement("div", { "data-testid": "reminders" }),
      })) as Parameters<typeof renderToStaticMarkup>[0],
    );
    const stack = div.querySelector('[data-testid="reminders"]')!.parentElement!;
    expect(stack.className).toMatch(/\bflex\b/);
    expect(stack.className).toMatch(/\bflex-col\b/);
    expect(stack.className).toMatch(/\bgap-3\.5\b/);
  });

  // Review fix (round 1): QuickActions rendered after the two-column grid in
  // source order, so below `lg` — where the grid collapses to one column and
  // items stack in DOM order — reminders (inside that grid) landed BEFORE
  // QuickActions, not last. Both are now items of the same grid, in DOM
  // order hero → route → quick actions → reminders, so this holds regardless
  // of viewport (jsdom never applies the `lg:` placement that moves things
  // back around on desktop).
  it("keeps reminders after quick actions in DOM order, so it's last in the stacked mobile column", async () => {
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(
      (await PhaseSketching({
        tripId: "trip-1",
        tripName: "Test Trip",
        reminders: React.createElement("div", { "data-testid": "reminders" }),
      })) as Parameters<typeof renderToStaticMarkup>[0],
    );
    const actionsRow = div.querySelector('[data-testid="sketching-actions-row"]');
    const reminders = div.querySelector('[data-testid="reminders"]');
    expect(actionsRow).not.toBeNull();
    expect(reminders).not.toBeNull();
    const position = actionsRow!.compareDocumentPosition(reminders!);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  // New problem (Ugly) from the D-home-globe re-check: quick actions used to
  // take its own full-width `lg:col-span-2` row, leaving a blank rectangle
  // in the left column beside reminders whenever nothing else follows Route
  // there (a short, undated Sketching trip). Quick actions now shares
  // reminders' row instead, so neither column dead-ends.
  it("shares reminders' row at lg instead of taking its own full-width row", async () => {
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(
      (await PhaseSketching({
        tripId: "trip-1",
        tripName: "Test Trip",
        reminders: React.createElement("div", { "data-testid": "reminders" }),
      })) as Parameters<typeof renderToStaticMarkup>[0],
    );
    const actionsRow = div.querySelector('[data-testid="sketching-actions-row"]')!;
    const aside = div.querySelector("[data-home-aside]")!;
    expect(actionsRow.className).toContain("lg:col-start-1");
    expect(actionsRow.className).toContain("lg:col-span-1");
    expect(actionsRow.className).not.toContain("lg:col-span-2");
    expect(aside.className).toContain("lg:col-start-2");
  });
});
