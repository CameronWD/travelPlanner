import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";

// The Surprise suite at the bottom renders the page against mocked reads; the
// source-level suites above it never touch these mocks.
const mockDb = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  stop: { findMany: vi.fn() },
  transport: { findMany: vi.fn() },
  accommodation: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  cost: { findMany: vi.fn() },
  exchangeRate: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("notFound"); }) }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ user: { id: "u-viewer", email: "v@example.com" }, membership: { role: "member" } })),
}));
const { loadSurpriseVisibilityMock } = vi.hoisted(() => ({ loadSurpriseVisibilityMock: vi.fn() }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});
// Real buildBudget runs (never faked) — wrapped in a spy so a test can read
// what it was called with and what it computed, without changing behaviour.
const { buildBudgetSpy } = vi.hoisted(() => ({ buildBudgetSpy: vi.fn() }));
vi.mock("@/lib/budget", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/budget")>();
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
const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

const RAW_PALETTE = /\b(bg|text|border)-(stone|slate|zinc|gray|amber|sky|emerald|violet|rose|indigo)-[0-9]/;

/** `--name: h s% l%` pairs declared in the first `:root {…}` block of globals.css (the light theme). */
function lightTokens(): Map<string, string> {
  const root = globals.slice(globals.indexOf(":root {"), globals.indexOf(".dark {"));
  const m = new Map<string, string>();
  for (const [, k, v] of root.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) m.set(k, v.trim());
  return m;
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

describe("Print view — Surprise (CONTEXT.md \"Surprise\", ADR 0051)", () => {
  const ROME = {
    id: "s1", name: "Rome", country: "Italy", lat: null, lng: null, timezone: "Europe/Rome",
    arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 0, notes: "Balloon booked for the 3rd",
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { hiddenVisibility, placeholderItem } = await import("@/test/helpers/surprise-visibility");
    mockDb.trip.findUnique.mockResolvedValue({ id: "trip-1", name: "Europe", startDate: "2026-01-01", endDate: "2026-01-05", homeCurrency: "GBP" });
    mockDb.stop.findMany.mockResolvedValue([ROME]);
    mockDb.transport.findMany.mockResolvedValue([]);
    mockDb.accommodation.findMany.mockResolvedValue([]);
    mockDb.item.findMany.mockResolvedValue([]);
    mockDb.cost.findMany.mockResolvedValue([]);
    mockDb.exchangeRate.findMany.mockResolvedValue([]);
    loadSurpriseVisibilityMock.mockResolvedValue(
      hiddenVisibility({
        hiddenStopIds: ["s1"],
        placeholders: [
          placeholderItem({ id: "i-dinner", stopId: null, date: "2026-01-03", startTime: "19:30" }),
          placeholderItem({ id: "i-fork", stopId: null, date: "2026-01-03", forkId: "fork-1" }),
        ],
      }),
    );
  });

  async function renderPrint() {
    const { default: PrintPage } = await import("./page");
    return renderToStaticMarkup(await PrintPage({ params: Promise.resolve({ tripId: "trip-1" }) }));
  }

  it("asks the visibility loader for this viewer before the wave", async () => {
    const { expectAccessCheckedBeforeWrite } = await import("@/test/helpers/access-order");
    await renderPrint();
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith("trip-1", "u-viewer");
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, mockDb.item.findMany);
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, mockDb.stop.findMany);
  });

  it("spreads the fragments into the Accommodation and Item reads; Costs stay whole for the totals", async () => {
    const { MARKER_WHERE } = await import("@/test/helpers/surprise-visibility");
    await renderPrint();
    expect(mockDb.accommodation.findMany.mock.calls[0][0].where).toMatchObject(MARKER_WHERE.accommodation);
    expect(mockDb.item.findMany.mock.calls[0][0].where).toMatchObject(MARKER_WHERE.item);
    expect(mockDb.cost.findMany.mock.calls[0][0].where).not.toHaveProperty("AND");
  });

  it("prints a real-plan placeholder as an Item titled Surprise, and never a hidden Stop's notes", async () => {
    const html = await renderPrint();
    expect(html).toContain("Surprise");
    expect(html.match(/>Surprise</g)).toHaveLength(1); // the Fork's placeholder stays in its Fork
    expect(html).not.toContain("Balloon booked");
  });

  it("Budget Summary: a Cost owned by a hidden Item folds into one Surprise row, and the grand total keeps the money", async () => {
    mockDb.cost.findMany.mockResolvedValue([
      { id: "c-hidden", costMinor: 40000, paidMinor: null, currency: "GBP", rateToHome: 1, paidAt: null, ownerType: "ITEM", ownerId: "i-dinner", label: null, category: null },
      { id: "c-plain", costMinor: 10000, paidMinor: null, currency: "GBP", rateToHome: 1, paidAt: null, ownerType: "OTHER", ownerId: null, label: "Visa", category: "Admin" },
    ]);
    const html = await renderPrint();
    expect(html).toContain('<span class="text-muted-foreground">Surprise</span>'); // the byCategory row label
    expect(html).toContain("GBP 400.00"); // 40000 minor folded into the Surprise row
    expect(html).toContain("GBP 100.00"); // the plain cost's own category row
    expect(html).toContain("GBP 500.00"); // grand total (400 + 100) still carries the hidden money
  });

  it("a hidden Accommodation's row still reaches buildBudget's byStop placement, and its name never prints", async () => {
    // The filtered (rendered) read excludes the Accommodation inside hidden
    // Stop s1; the second, unfiltered read — used ONLY to feed buildBudget —
    // still carries it, so byStop places its Cost on the real Stop (s1)
    // instead of the trip-wide bucket.
    mockDb.accommodation.findMany.mockImplementation((args: { where: Record<string, unknown> }) =>
      Promise.resolve(
        "AND" in args.where
          ? []
          : [{ id: "acc-1", stopId: "s1", name: "The Hideaway Inn", checkIn: "2026-01-02", checkOut: "2026-01-04" }],
      ),
    );
    mockDb.cost.findMany.mockResolvedValue([
      { id: "c-acc", costMinor: 20000, paidMinor: null, currency: "GBP", rateToHome: 1, paidAt: null, ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null, category: null },
    ]);
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
  const ROME = {
    id: "s1", name: "Rome", country: "Italy", lat: null, lng: null, timezone: "Europe/Rome",
    arriveDate: "2026-01-01", departDate: "2026-01-03", sortOrder: 0, notes: null,
  };
  const FLORENCE = { ...ROME, id: "s2", name: "Florence", arriveDate: "2026-01-03", departDate: "2026-01-05", sortOrder: 1 };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { NO_SURPRISES } = await import("@/lib/surprise-visibility");
    mockDb.trip.findUnique.mockResolvedValue({ id: "trip-1", name: "Europe", startDate: "2026-01-01", endDate: "2026-01-05", homeCurrency: "GBP" });
    mockDb.stop.findMany.mockResolvedValue([ROME, FLORENCE]);
    mockDb.transport.findMany.mockResolvedValue([
      { id: "t1", mode: "FLIGHT", fromStopId: "s1", toStopId: "s2", depPlace: "Rome (FCO)", arrPlace: "Florence (FLR)", depAt: null, arrAt: null, reference: "LH2476", notes: null, sortOrder: 0 },
    ]);
    mockDb.accommodation.findMany.mockResolvedValue([
      { id: "a1", stopId: "s1", name: "The Bloomsbury Hotel", address: "16-22 Great Russell St", checkIn: "2026-01-01", checkOut: "2026-01-03", checkInTime: null, checkOutTime: null, link: null, booking: null, notes: null },
    ]);
    mockDb.item.findMany.mockResolvedValue([]);
    mockDb.cost.findMany.mockResolvedValue([]);
    mockDb.exchangeRate.findMany.mockResolvedValue([]);
    loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
  });

  it("puts the hotel name over its address below sm, and the flight Ref under the route", async () => {
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
