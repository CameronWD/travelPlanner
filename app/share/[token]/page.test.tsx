import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

// share/[token]/page.tsx is an async Server Component with DB calls; invoke it
// with mocked db per-model methods (same pattern as calendar/page.test.tsx).
// Task 19: the kit SharePage (shared/share.jsx) — coral hero, "The route"
// card, Money card, kit Days rows — and the public-page guarantees: no costs,
// `robots: noindex`, the trip name as the h1.

const { shareFindUniqueMock, stopFindManyMock, itemFindManyMock, transportFindManyMock, accommodationFindManyMock } =
  vi.hoisted(() => ({
    shareFindUniqueMock: vi.fn(),
    stopFindManyMock: vi.fn(),
    itemFindManyMock: vi.fn(),
    transportFindManyMock: vi.fn(),
    accommodationFindManyMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  db: {
    shareLink: { findUnique: shareFindUniqueMock },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
  },
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/components/trip/route-map-loader", () => ({ RouteMapLoader: () => <div data-testid="route-map" /> }));
// Timeline imports the (day-variant only) Unschedule button, whose server action pulls in auth.
vi.mock("@/server/actions/items", () => ({ unscheduleItem: vi.fn() }));
// …and the day page's DayEntryLink (edit dialogs → server actions → auth). The
// share page never passes an editor, so it is never rendered here.
vi.mock("@/components/trip/day-entry-link", () => ({ DayEntryLink: () => null }));
vi.mock("@/lib/weather", () => ({ getDayWeather: vi.fn(async () => null) }));

import SharePage, { metadata, noOrphan } from "./page";

/** Private values that must never reach the public page. */
const PRIVATE = {
  transport: { reference: "PNR-ABC123", notes: "secret transport note" },
  accommodation: { confirmation: "CONF-999", notes: "secret stay note" },
  item: { costMinor: 12345, currency: "EUR", notes: "secret item note", link: "https://private.example/booking", booking: "BOOK-777" },
  trip: { homeCurrency: "EUR" },
};
const PRIVATE_STRINGS = ["PNR-ABC123", "CONF-999", "BOOK-777", "secret", "private.example", "12345", "123.45", "EUR"];

const TRIP = {
  id: "t1",
  name: "EU Christmas",
  // Long past: the page renders the "past" phase (no Today card, no clock).
  startDate: "2020-12-06",
  endDate: "2020-12-09",
  homeName: null,
  homeLat: null,
  homeLng: null,
  roundTrip: false,
};

const STOPS = [
  { id: "s1", name: "Munich", country: "Germany", lat: 48.1, lng: 11.6, timezone: "Europe/Berlin", arriveDate: "2020-12-06", departDate: "2020-12-08", sortOrder: 0 },
  { id: "s2", name: "London", country: "United Kingdom", lat: 51.5, lng: -0.1, timezone: "Europe/London", arriveDate: "2020-12-08", departDate: "2020-12-09", sortOrder: 1 },
];

function share(overrides: Partial<typeof TRIP> = {}) {
  return {
    includeAccommodation: true,
    includeTransport: true,
    includeDailyPlans: true,
    trip: { ...TRIP, ...PRIVATE.trip, ...overrides },
  };
}

async function renderPage() {
  return render(await SharePage({ params: Promise.resolve({ token: "tok" }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  shareFindUniqueMock.mockResolvedValue(share());
  stopFindManyMock.mockResolvedValue(STOPS);
  // Every row carries the private fields the real `select`s must never
  // return. The db is mocked, so these rows reach the page as-is: the only
  // thing standing between them and the rendered page is the page's own
  // projection into buildItinerary. The tests below prove it holds.
  transportFindManyMock.mockResolvedValue([
    { id: "tr1", mode: "FLIGHT", fromStopId: "s1", toStopId: "s2", depPlace: "Munich (MUC)", arrPlace: "London (LHR)", depAt: "2020-12-08T09:00:00.000Z", arrAt: "2020-12-08T10:30:00.000Z", sortOrder: 0, ...PRIVATE.transport },
  ]);
  accommodationFindManyMock.mockResolvedValue([
    { id: "a1", stopId: "s1", name: "Platzl Hotel", address: "Sparkassenstraße 10", checkIn: "2020-12-06", checkOut: "2020-12-08", checkInTime: "15:00", checkOutTime: "11:00", ...PRIVATE.accommodation },
  ]);
  itemFindManyMock.mockResolvedValue([
    { id: "i1", title: "Christmas market", category: "FOOD", date: "2020-12-07", startTime: "18:00", endTime: null, stopId: "s1", address: null, ...PRIVATE.item },
  ]);
});

describe("SharePage — public guarantees", () => {
  it("keeps robots noindex in metadata", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("renders the trip name as the only h1", async () => {
    await renderPage();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("EU Christmas");
  });

  it("shows no costs, booking refs, confirmations, links or notes — even when the rows carry them", async () => {
    const { container } = await renderPage();
    const text = container.textContent ?? "";
    const html = container.innerHTML;
    for (const secret of PRIVATE_STRINGS) {
      expect(text).not.toContain(secret);
      expect(html).not.toContain(secret);
    }
    expect(text).not.toMatch(/[$€£¥]\s?\d/);
    expect(text).not.toMatch(/€\s?\d/);
    // Money is a shared pot, and never shown here — no splitting language either.
    expect(text).not.toMatch(/per person|each owes|split/i);
  });

  it("never selects private fields from the database", async () => {
    await renderPage();
    const selectOf = (mock: ReturnType<typeof vi.fn>) => Object.keys(mock.mock.calls[0][0].select);
    const FORBIDDEN = ["reference", "confirmation", "notes", "link", "booking", "costMinor", "currency", "amountMinor", "costs"];
    for (const mock of [transportFindManyMock, accommodationFindManyMock, itemFindManyMock, stopFindManyMock]) {
      expect(mock).toHaveBeenCalledTimes(1);
      const keys = selectOf(mock);
      for (const k of FORBIDDEN) expect(keys).not.toContain(k);
    }
    const tripSelect = Object.keys(shareFindUniqueMock.mock.calls[0][0].select.trip.select);
    expect(tripSelect).not.toContain("homeCurrency");
    for (const k of FORBIDDEN) expect(tripSelect).not.toContain(k);
  });

  it("excludes an Item hidden from shares whatever the dials say (Task 9)", async () => {
    // All three dials on (the default `share()` fixture) — hiddenFromShares
    // must still be filtered at the query level, never left to rendering.
    await renderPage();
    expect(itemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hiddenFromShares: false }),
      }),
    );
  });
});

describe("SharePage — kit SharePage (shared/share.jsx)", () => {
  it("leads with the coral hero card: view-only chip, dates · nights · stops", async () => {
    await renderPage();
    const h1 = screen.getByRole("heading", { level: 1 });
    const hero = h1.closest("[data-slot='share-hero']") as HTMLElement;
    expect(hero).not.toBeNull();
    expect(hero.className).toMatch(/\bbg-coral\b/);
    expect(hero.className).toMatch(/\bshadow-hard-4\b/);
    expect(within(hero).getByText("Shared trip · view only")).toBeInTheDocument();
    expect(within(hero).getByText(/3 nights · 2 stops/)).toBeInTheDocument();
  });

  // LA-043: `text-balance` alone didn't stop a bare year orphaning onto its
  // own last line at 360–390px ("EU Christmas" / "2026"). The last two words
  // of the trip name are joined with a non-breaking space so they can't wrap
  // apart.
  it("joins the trip name's last two words with a non-breaking space so the year can't orphan (LA-043)", async () => {
    shareFindUniqueMock.mockResolvedValue(share({ name: "EU Christmas 2026" }));
    await renderPage();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("EU Christmas 2026");
  });

  it("lists the stops in 'The route' card with the outbound transport as a chip", async () => {
    await renderPage();
    const heading = screen.getByRole("heading", { name: "The route" });
    const card = heading.closest("[data-slot='share-route']") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(within(card).getByText("Munich")).toBeInTheDocument();
    expect(within(card).getByText("London")).toBeInTheDocument();
    expect(within(card).getByText(/→ Flight/)).toBeInTheDocument();
    expect(within(card).getByText("Platzl Hotel")).toBeInTheDocument();
  });

  it("says money is hidden in the kit lilac Money card", async () => {
    await renderPage();
    const note = screen.getByText(/Hidden on shared links\. Only people on the trip see costs/);
    expect(note.closest("[data-slot='share-money']")?.className).toMatch(/\bbg-lilac\b/);
  });

  it("renders each day with the kit Days rows (Timeline)", async () => {
    const { container } = await renderPage();
    expect(screen.getByRole("heading", { name: "Day by day" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-timeline-row]").length).toBeGreaterThan(0);
    expect(screen.getByText("Check-in — Platzl Hotel")).toBeInTheDocument();
    expect(screen.getByText("Christmas market")).toBeInTheDocument();
  });

  it("uses no pre-reskin 1px borders", async () => {
    const { container } = await renderPage();
    const onepx = Array.from(container.querySelectorAll("[class]")).filter((el) =>
      (el.getAttribute("class") ?? "").split(/\s+/).includes("border"),
    );
    expect(onepx).toEqual([]);
  });

  it("ends with the kit footer line", async () => {
    await renderPage();
    expect(screen.getByText("Made with Teepee · plan it with your people")).toBeInTheDocument();
  });

  it("addresses wrap (LA-012) and the hero title balances (LA-043)", async () => {
    await renderPage();
    expect(screen.getByText(/Sparkassenstraße/).className).not.toContain("truncate");
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-balance");
  });

  it("day-by-day cards form a grid on wide screens (LA-041)", async () => {
    await renderPage();
    const day = screen.getAllByTestId("share-day")[0];
    expect(day.parentElement!.className).toContain("lg:grid-cols-2");
  });
});

describe("noOrphan (LA-043)", () => {
  it("joins the last two words with a non-breaking space", () => {
    expect(noOrphan("EU Christmas 2026")).toBe("EU Christmas\u00A02026");
  });

  it("leaves a single word unchanged", () => {
    expect(noOrphan("Japan")).toBe("Japan");
  });

  it("joins the last two of a three-word name, leaving earlier words untouched", () => {
    expect(noOrphan("Alpine Road Loop")).toBe("Alpine Road\u00A0Loop");
  });
});

describe("SharePage — empty", () => {
  it("a dated trip with no dated stops shows the kit empty state in The route card", async () => {
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    await renderPage();
    expect(screen.getByRole("heading", { name: "No stops yet" })).toBeInTheDocument();
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  });
});
