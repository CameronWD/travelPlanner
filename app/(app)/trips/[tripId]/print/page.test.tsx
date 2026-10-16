import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import type { PlanRows } from "@/lib/plan-reads";
import type { item } from "@/test/builders";
import { decls, lightTheme } from "@/test/helpers/css";

// print/page.tsx is a heavy async server component, but since Task 14 its
// one read is `readPlan` (lib/plan-reads.ts) — mocked here with a prebuilt
// `PlanRows`, the shape a real call would have produced for the scenario.
// `readPlan`'s own masking/placeholder/query-shape behaviour (which Costs,
// which Items, in what order, which fragment went where) is pinned in
// lib/plan-reads.test.ts; this file only has to prove the PAGE renders a
// given PlanRows correctly.

const { readPlanMock } = vi.hoisted(() => ({ readPlanMock: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("notFound"); }) }));
// The page itself no longer imports `@/lib/db` (Task 14), but the real
// `@/lib/plan-reads` module (kept for its pure maskPlanStops/mergePlanItems
// helpers, below) imports it at module scope, same as every other reader —
// stub it so that import doesn't try to open Postgres.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/plan-reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/plan-reads")>();
  return { ...actual, readPlan: readPlanMock };
});
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ user: { id: "u-viewer", email: "v@example.com" }, membership: { role: "member" } })),
}));
// Real buildBudget runs (never faked) — wrapped in a spy so a test can read
// what it was called with and what it computed, without changing behaviour.
const { buildBudgetSpy } = vi.hoisted(() => ({ buildBudgetSpy: vi.fn() }));
vi.mock("@/lib/money/budget", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/money/budget")>();
  return {
    ...actual,
    buildBudget: ((input: Parameters<typeof actual.buildBudget>[0]) => {
      const result = actual.buildBudget(input);
      buildBudgetSpy(input, result);
      return result;
    }) as typeof actual.buildBudget,
  };
});

// print/page.tsx is an async Server Component with many DB reads, and jsdom
// can't emulate print media — so this pins the restyle at the source level
// (Task 15: tokens only, print-appropriate, no dark-mode dependence).
const dir = join(process.cwd(), "app/(app)/trips/[tripId]/print");
const page = readFileSync(join(dir, "page.tsx"), "utf8");
const button = readFileSync(join(dir, "print-button.tsx"), "utf8");

const RAW_PALETTE = /\b(bg|text|border)-(stone|slate|zinc|gray|amber|sky|emerald|violet|rose|indigo)-[0-9]/;

/** `--name: h s% l%` pairs declared on globals.css's light palette rule. */
function lightTokens(): Map<string, string> {
  return new Map(Object.entries(decls(lightTheme())).filter(([k]) => k.startsWith("--")));
}

describe("Print view — tokens only (Task 15)", () => {
  it("uses no raw palette classes", () => {
    expect(page).not.toMatch(RAW_PALETTE);
    expect(button).not.toMatch(RAW_PALETTE);
  });

  it("uses no offset (hard) shadows", () => {
    expect(page).not.toMatch(/shadow-hard-|shadow-soft|shadow-cta/);
  });

  it("marks the printable root and keeps day / stop blocks whole across page breaks", () => {
    expect(page).toContain("data-print-root");
    expect(page).toMatch(/break-inside-avoid/);
  });

  it("stays A4-shaped on screen but goes full width in the printout", () => {
    expect(page).toMatch(/data-print-root[^>]*\bmax-w-3xl\b/);
    expect(page).toMatch(/data-print-root[^>]*\bprint:max-w-none\b/);
  });

  it("labels the on-screen preview, hidden from the print output itself (LA-055)", () => {
    expect(page).toMatch(/Print preview/);
    // Scoped: the label's own className carries print:hidden, not just any
    // print:hidden elsewhere on the page.
    const labelMatch = page.match(/<p className="([^"]*)">Print preview<\/p>/);
    expect(labelMatch, "couldn't find the Print preview label's own <p>").toBeTruthy();
    expect(labelMatch![1]).toMatch(/\bprint:hidden\b/);
  });

  it("prints in the light palette even when the app is in dark mode", () => {
    const style = page.slice(page.indexOf("@media print"), page.indexOf("`}</style>"));
    expect(style).toMatch(/html\.dark[^{]*\{[^}]*color-scheme:\s*light/);
    // Every token re-declared for print equals the light theme's value in globals.css.
    const light = lightTokens();
    const overrides = [...style.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)];
    expect(overrides.length).toBeGreaterThanOrEqual(6);
    for (const [, k, v] of overrides) expect(v.trim(), k).toBe(light.get(k));
    for (const k of ["--background", "--foreground", "--card", "--muted-foreground", "--border", "--border-soft"]) {
      expect(overrides.some(([, n]) => n === k), k).toBe(true);
    }
  });

  it("hides the trip layout's header block in print, so the trip name prints once", () => {
    const style = page.slice(page.indexOf("@media print"), page.indexOf("`}</style>"));
    const hide = style.slice(0, style.indexOf("display: none"));
    expect(hide).toContain("[data-trip-nav]");
    expect(hide).toContain("[data-trip-header]");
  });

  it("print button is the kit Button with the kit copy", () => {
    expect(button).toContain('from "@/components/ui/button"');
    expect(button).toContain("Print or save PDF");
  });
});

// ---------------------------------------------------------------------------
// PlanRows construction for the Surprise + phone-width suites below.
// ---------------------------------------------------------------------------

const { planRows } = await import("@/test/builders/plan-rows");
const { maskPlanStops, mergePlanItems } = await import("@/lib/plan-reads");
const { NO_SURPRISES } = await import("@/lib/surprise-visibility");
const { hiddenVisibility, placeholderItem } = await import("@/test/helpers/surprise-visibility");
const { trip, stop, transport, stay, cost } = await import("@/test/builders");

/**
 * Build the `PlanRows` a real `readPlan` call would have handed back for a
 * scenario — reusing the reader's own (pure) `maskPlanStops`/`mergePlanItems`
 * rather than re-implementing the merge.
 */
function rowsFrom({
  trip: tripRow,
  stops = [],
  transports = [],
  accommodations = [],
  items = [],
  costs = [],
  exchangeRates = [],
  visibility = NO_SURPRISES,
}: {
  trip: ReturnType<typeof trip>;
  stops?: ReturnType<typeof stop>[];
  transports?: ReturnType<typeof transport>[];
  accommodations?: ReturnType<typeof stay>[];
  items?: ReturnType<typeof item>[];
  costs?: ReturnType<typeof cost>[];
  exchangeRates?: PlanRows["exchangeRates"];
  visibility?: PlanRows["visibility"];
}): PlanRows {
  return planRows({
    trip: { ...tripRow, members: [], stops: [] } as unknown as PlanRows["trip"],
    plan: null,
    fork: null,
    visibility,
    stops: maskPlanStops(stops, visibility) as unknown as PlanRows["stops"],
    transports: transports as unknown as PlanRows["transports"],
    accommodations: accommodations as unknown as PlanRows["accommodations"],
    items: mergePlanItems(items, visibility, null) as unknown as PlanRows["items"],
    costs: costs as unknown as PlanRows["costs"],
    exchangeRates,
    chapters: [],
    budgetItems: items.map((i) => ({ id: i.id, stopId: i.stopId, category: i.category, date: i.date, title: i.title })),
    budgetAccommodations: accommodations.map((a) => ({ id: a.id, stopId: a.stopId, checkIn: a.checkIn, checkOut: a.checkOut, name: a.name })),
  });
}

async function renderPrint() {
  const { default: PrintPage } = await import("./page");
  return renderToStaticMarkup(await PrintPage({ params: Promise.resolve({ tripId: "trip-1" }) }));
}

describe("Print view — Surprise (CONTEXT.md \"Surprise\", ADR 0051)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prints a real-plan placeholder as an Item titled Surprise, and never a hidden Stop's notes", async () => {
    const visibility = hiddenVisibility({
      hiddenStopIds: ["s1"],
      placeholders: [
        placeholderItem({ id: "i-dinner", stopId: null, date: "2026-01-03", startTime: "19:30" }),
        placeholderItem({ id: "i-fork", stopId: null, date: "2026-01-03", forkId: "fork-1" }),
      ],
    });
    readPlanMock.mockResolvedValue(
      rowsFrom({
        trip: trip({ id: "trip-1", name: "Europe", startDate: "2026-01-01", endDate: "2026-01-05", homeCurrency: "GBP" }),
        stops: [stop({ id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 0, notes: "Balloon booked for the 3rd" })],
        visibility,
      }),
    );

    const html = await renderPrint();
    expect(html).toContain("Surprise");
    expect(html.match(/>Surprise</g)).toHaveLength(1); // the Fork's placeholder stays in its Fork
    expect(html).not.toContain("Balloon booked");
  });

  it("Budget Summary: a Cost owned by a hidden Item folds into one Surprise row, and the grand total keeps the money", async () => {
    const visibility = hiddenVisibility({
      hiddenStopIds: ["s1"],
      placeholders: [
        placeholderItem({ id: "i-dinner", stopId: null, date: "2026-01-03", startTime: "19:30" }),
        placeholderItem({ id: "i-fork", stopId: null, date: "2026-01-03", forkId: "fork-1" }),
      ],
    });
    readPlanMock.mockResolvedValue(
      rowsFrom({
        trip: trip({ id: "trip-1", name: "Europe", startDate: "2026-01-01", endDate: "2026-01-05", homeCurrency: "GBP" }),
        stops: [stop({ id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 0 })],
        visibility,
        costs: [
          cost({ id: "c-hidden", costMinor: 40000, paidMinor: null, currency: "GBP", rateToHome: 1, paidAt: null, ownerType: "ITEM", ownerId: "i-dinner", label: null, category: null }),
          cost({ id: "c-plain", costMinor: 10000, paidMinor: null, currency: "GBP", rateToHome: 1, paidAt: null, ownerType: "OTHER", ownerId: null, label: "Visa", category: "Admin" }),
        ],
      }),
    );

    const html = await renderPrint();
    expect(html).toContain('<span class="text-muted-foreground">Surprise</span>'); // the byCategory row label
    expect(html).toContain("GBP 400.00"); // 40000 minor folded into the Surprise row
    expect(html).toContain("GBP 100.00"); // the plain cost's own category row
    expect(html).toContain("GBP 500.00"); // grand total (400 + 100) still carries the hidden money
  });

  it("a hidden Accommodation's row still reaches buildBudget's byStop placement, and its name never prints", async () => {
    // The filtered (rendered) `accommodations` excludes the Accommodation
    // inside hidden Stop s1; `budgetAccommodations` — unfiltered, used ONLY
    // to feed buildBudget (lib/plan-reads.ts) — still carries it, so byStop
    // places its Cost on the real Stop (s1) instead of the trip-wide bucket.
    const visibility = hiddenVisibility({ hiddenStopIds: ["s1"] });
    const rows = rowsFrom({
      trip: trip({ id: "trip-1", name: "Europe", startDate: "2026-01-01", endDate: "2026-01-05", homeCurrency: "GBP" }),
      stops: [stop({ id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 0 })],
      visibility,
      costs: [
        cost({ id: "c-acc", costMinor: 20000, paidMinor: null, currency: "GBP", rateToHome: 1, paidAt: null, ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null, category: null }),
      ],
    });
    rows.accommodations = []; // what the viewer may render — hidden one excluded
    rows.budgetAccommodations = [{ id: "acc-1", stopId: "s1", checkIn: "2026-01-02", checkOut: "2026-01-04", name: "The Hideaway Inn" }];
    readPlanMock.mockResolvedValue(rows);

    const html = await renderPrint();
    const result = buildBudgetSpy.mock.calls[0][1] as { byStop: Array<{ stopId: string | null; costTotalMinor: number }> };
    const s1Row = result.byStop.find((r) => r.stopId === "s1");
    const tripWideRow = result.byStop.find((r) => r.stopId === null);
    expect(s1Row?.costTotalMinor).toBe(20000);
    expect(tripWideRow).toBeUndefined();
    expect(html).not.toContain("The Hideaway Inn");
  });
});

describe("Print view — phone-width route rows (LA-150)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("puts the hotel name over its address below sm, and the flight Ref under the route", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({
        trip: trip({ id: "trip-1", name: "Europe", startDate: "2026-01-01", endDate: "2026-01-05", homeCurrency: "GBP" }),
        stops: [
          stop({ id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-03", sortOrder: 0 }),
          stop({ id: "s2", name: "Florence", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-01-03", departDate: "2026-01-05", sortOrder: 1 }),
        ],
        transports: [
          transport({ id: "t1", mode: "FLIGHT", fromStopId: "s1", toStopId: "s2", depPlace: "Rome (FCO)", arrPlace: "Florence (FLR)", depAt: null, arrAt: null, reference: "LH2476", sortOrder: 0 }),
        ],
        accommodations: [
          stay({ id: "a1", stopId: "s1", name: "The Bloomsbury Hotel", address: "16-22 Great Russell St", checkIn: "2026-01-01", checkOut: "2026-01-03" }),
        ],
      }),
    );

    const { default: PrintPage } = await import("./page");
    render(await PrintPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    // The day-by-day itinerary also prints "Check-in: <name>" /
    // "Check-out: <name>" rows for the same hotel, so scope to the stop
    // summary's own name span (it alone carries text-foreground).
    const name = screen
      .getAllByText("The Bloomsbury Hotel")
      .find((el) => el.className.includes("text-foreground"))!;
    const address = screen.getByText("16-22 Great Russell St");
    expect(name.parentElement).toBe(address.parentElement);
    expect(name.parentElement!.className).toMatch(/\bflex-col\b/);
    expect(name.parentElement!.className).toMatch(/\bsm:flex-row\b/);

    const ref = screen.getByText(/Ref: LH2476/);
    expect(ref.className).toMatch(/\bbasis-full\b/);
    expect(ref.className).toMatch(/\bsm:basis-auto\b/);
    expect(ref.className).toMatch(/\bsm:ml-auto\b/);
    expect(ref.className).not.toMatch(/(^|\s)ml-auto(\s|$)/);
  });
});
