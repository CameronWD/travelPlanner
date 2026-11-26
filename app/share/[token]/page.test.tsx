import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// share/[token]/page.tsx is an async Server Component with DB calls; invoke it
// with mocked db per-model methods (same pattern as calendar/page.test.tsx).
// Phase 4 Task 15: the staged page (SHARE.md §1 — before / during / after
// section order), the "Show who's going" dial, and the public-page
// guarantees: no costs or booking refs, `robots: noindex`, the trip name as
// the only h1.

const {
  shareFindFirstMock,
  stopFindManyMock,
  itemFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
  dayTitleFindManyMock,
  journalEntryFindManyMock,
  attachmentFindManyMock,
  tripMemberFindManyMock,
  travelTimeFindManyMock,
  loadSurpriseVisibilityMock,
} = vi.hoisted(() => ({
  shareFindFirstMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  dayTitleFindManyMock: vi.fn().mockResolvedValue([]),
  journalEntryFindManyMock: vi.fn().mockResolvedValue([]),
  attachmentFindManyMock: vi.fn().mockResolvedValue([]),
  tripMemberFindManyMock: vi.fn().mockResolvedValue([]),
  travelTimeFindManyMock: vi.fn().mockResolvedValue([]),
  loadSurpriseVisibilityMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    shareLink: { findFirst: shareFindFirstMock },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    dayTitle: { findMany: dayTitleFindManyMock },
    journalEntry: { findMany: journalEntryFindManyMock },
    attachment: { findMany: attachmentFindManyMock },
    tripMember: { findMany: tripMemberFindManyMock },
    travelTime: { findMany: travelTimeFindManyMock },
  },
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
// Renders its props so the privacy scan covers the one client prop set the page serializes.
vi.mock("@/components/trip/route-map-loader", () => ({
  RouteMapLoader: (props: Record<string, unknown>) => <div data-testid="route-map" data-props={JSON.stringify(props)} />,
}));
// Timeline imports the (day-variant only) Unschedule button, whose server action pulls in auth.
vi.mock("@/server/actions/items", () => ({ unscheduleItem: vi.fn() }));
// …and the day page's DayEntryLink (edit dialogs → server actions → auth). The
// share page never passes an editor, so it is never rendered here.
vi.mock("@/components/trip/day-entry-link", () => ({ DayEntryLink: () => null }));

vi.mock("@/components/ui/traveller-avatar", () => ({
  TravellerAvatar: ({ traveller }: { traveller: { name: string; image: string | null } }) => (
    <span data-testid="avatar" data-image={traveller.image ?? ""}>{traveller.name}</span>
  ),
}));
vi.mock("@/lib/scroll-to", () => ({ scrollToId: vi.fn() }));
// The page takes the pure mergePlanItems from @/lib/plan-reads, whose module
// graph (trip-shell-reads → server actions → guards) reaches auth; nothing
// here touches auth, so stub the guard module rather than build the auth db.
vi.mock("@/lib/guards", () => ({}));
// Surprise (ADR 0051): a Share link has no viewer, so the page asks the loader with null.
vi.mock("@/lib/surprise-visibility", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/surprise-visibility")>()),
  loadSurpriseVisibility: loadSurpriseVisibilityMock,
}));

const { dayByDaySpy } = vi.hoisted(() => ({ dayByDaySpy: vi.fn() }));
vi.mock("./day-by-day", async (orig) => {
  const actual = await orig<typeof import("./day-by-day")>();
  return { ...actual, DayByDay: (props: Parameters<typeof actual.DayByDay>[0]) => { dayByDaySpy(props); return actual.DayByDay(props); } };
});

const { rightNowSpy } = vi.hoisted(() => ({ rightNowSpy: vi.fn() }));
vi.mock("./right-now-card", async (orig) => {
  const actual = await orig<typeof import("./right-now-card")>();
  return { ...actual, RightNowCard: (props: Parameters<typeof actual.RightNowCard>[0]) => { rightNowSpy(props); return actual.RightNowCard(props); } };
});

// Every client component under the share page records the props it is handed.
const { clientProps, spyClient } = vi.hoisted(() => {
  const clientProps: unknown[] = [];
  const spyClient = (mod: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(mod).map(([name, x]) => [
        name,
        typeof x === "function" && /^[A-Z]/.test(name)
          ? (props: object) => {
              clientProps.push(props);
              return (x as (p: object) => unknown)(props);
            }
          : x,
      ]),
    );
  return { clientProps, spyClient };
});
vi.mock("./share-travel-row", async (orig) => spyClient(await orig()));
vi.mock("./day-by-day-client", async (orig) => spyClient(await orig()));
vi.mock("./viewer-time", async (orig) => spyClient(await orig()));
vi.mock("./local-clock", async (orig) => spyClient(await orig()));
vi.mock("./share-reveal", async (orig) => spyClient(await orig()));
vi.mock("./share-countdown", async (orig) => spyClient(await orig()));
vi.mock("./journal-expand", async (orig) => spyClient(await orig()));
vi.mock("./pending-link", async (orig) => spyClient(await orig()));

vi.mock("@/components/usage/usage-share-opened", () => ({ UsageShareOpened: () => <i data-testid="usage-share-opened" /> }));
import SharePage, { dynamic, metadata } from "./page";
import { SHARE_FOOTER_COPY } from "./share-cta";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { addDays } from "@/lib/dates";
import { shareRefParam } from "@/lib/share/ref";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, placeholderItem, MARKER_WHERE } from "@/test/helpers/surprise-visibility";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";
import { driveKey } from "@/lib/travel-times/hops";

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
  // Long past: the page renders the After stage.
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

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  clientProps.length = 0;
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
  shareFindFirstMock.mockResolvedValue(share());
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
  dayTitleFindManyMock.mockResolvedValue([]);
});

const EMAIL = "cam@example.com";
const MEMBER = {
  user: {
    id: "u1",
    name: "Cam Williams",
    displayName: "Cameron",
    image: "https://lh3.example/cam.png",
    photoKey: "k.jpg",
    photoUpdatedAt: new Date(7),
    photoFocalX: null,
    photoFocalY: null,
    email: EMAIL,
  },
};

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}
function shift(stops: typeof STOPS, year: string) {
  return stops.map((s) => ({ ...s, arriveDate: year + s.arriveDate.slice(4), departDate: year + s.departDate.slice(4) }));
}

// During is pinned a few days either side of today, not on a changeover:
// the page's "today" is the trip's own zone (Europe/Berlin here), which can
// be a day ahead of UTC, and the current stop must have a next stop.
const T = todayUTC();

/** Three trips with the same shape, one per stage, pinned against the real clock. */
const STAGE_TRIPS = {
  before: { startDate: "2099-12-06", endDate: "2099-12-09", stops: shift(STOPS, "2099") },
  during: {
    startDate: addDays(T, -3),
    endDate: addDays(T, 6),
    stops: [
      { ...STOPS[0], arriveDate: addDays(T, -3), departDate: addDays(T, 2) },
      { ...STOPS[1], arriveDate: addDays(T, 2), departDate: addDays(T, 6) },
    ],
  },
  after: { startDate: "2020-12-06", endDate: "2020-12-09", stops: STOPS },
} as const;

async function renderStage(stage: keyof typeof STAGE_TRIPS, over: Record<string, unknown> = {}) {
  const t = STAGE_TRIPS[stage];
  shareFindFirstMock.mockResolvedValue({
    ...share({ startDate: t.startDate, endDate: t.endDate }),
    id: "link-1",
    includeJournal: true,
    showTravellers: false,
    includeContacts: false,
    ...over,
  });
  stopFindManyMock.mockResolvedValue(t.stops);
  // Re-date the private-bearing rows onto this stage's trip so they are
  // actually rendered (Day by day, Right now), not merely fetched.
  const [a, b] = t.stops;
  transportFindManyMock.mockResolvedValue([
    { id: "tr1", mode: "FLIGHT", fromStopId: "s1", toStopId: "s2", depPlace: "Munich (MUC)", arrPlace: "London (LHR)", depAt: `${b.arriveDate}T09:00:00.000Z`, arrAt: `${b.arriveDate}T10:30:00.000Z`, sortOrder: 0, ...PRIVATE.transport },
  ]);
  accommodationFindManyMock.mockResolvedValue([
    { id: "a1", stopId: "s1", name: "Platzl Hotel", address: "Sparkassenstraße 10", checkIn: a.arriveDate, checkOut: a.departDate, checkInTime: "15:00", checkOutTime: "11:00", ...PRIVATE.accommodation },
  ]);
  const itemDates = stage === "during" ? [addDays(T, -1), T, addDays(T, 1)] : [addDays(a.arriveDate, 1)];
  itemFindManyMock.mockResolvedValue(
    itemDates.map((date, i) => ({ id: `i${i}`, title: `Christmas market ${i}`, category: "FOOD", date, startTime: "18:00", endTime: null, stopId: "s1", address: "Marienplatz 1", ...PRIVATE.item })),
  );
  journalEntryFindManyMock.mockImplementation((a: { where: { hiddenFromShares?: boolean } }) =>
    Promise.resolve(
      a.where.hiddenFromShares ? [] : [{ date: t.stops[0].arriveDate, authorId: "u1", body: "Great day", author: MEMBER.user }],
    ),
  );
  return renderPage();
}

const sectionOrder = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("[data-share-section]")).map((el) => el.getAttribute("data-share-section"));

describe("SharePage — public guarantees", () => {
  it("keeps robots noindex in metadata", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("renders per request, so a revoked link stops working at once (ADR 0051)", () => {
    expect(dynamic).toBe("force-dynamic");
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
    // Money is one group total, and never shown here — no splitting language either.
    expect(text).not.toMatch(/per person|each owes|split/i);
  });

  it("never selects private fields from the database", async () => {
    tripMemberFindManyMock.mockResolvedValue([MEMBER]);
    shareFindFirstMock.mockResolvedValue({ ...share(), showTravellers: true });
    await renderPage();
    const selectOf = (mock: ReturnType<typeof vi.fn>) => Object.keys(mock.mock.calls[0][0].select);
    const FORBIDDEN = ["reference", "confirmation", "notes", "link", "booking", "costMinor", "currency", "amountMinor", "costs", "photoAttachmentId", "email", "bankDetails", "emergencyName", "emergencyPhone", "carrier", "serviceNumber", "seat", "terminal", "gate", "coach", "platform"];
    for (const mock of [transportFindManyMock, accommodationFindManyMock, itemFindManyMock, stopFindManyMock]) {
      expect(mock).toHaveBeenCalledTimes(1);
      const keys = selectOf(mock);
      // The flight or train number is the one Travel detail a shared link carries, from Transport only.
      for (const k of FORBIDDEN.filter((f) => mock !== transportFindManyMock || f !== "serviceNumber")) {
        expect(keys).not.toContain(k);
      }
    }
    expect(selectOf(transportFindManyMock)).toContain("serviceNumber");
    expect(tripMemberFindManyMock).toHaveBeenCalledTimes(1);
    const memberSelect = Object.keys(tripMemberFindManyMock.mock.calls[0][0].select.user.select);
    expect(memberSelect).toEqual(Object.keys(TRAVELLER_SELECT));
    for (const k of FORBIDDEN) expect(memberSelect).not.toContain(k);
    const tripSelect = Object.keys(shareFindFirstMock.mock.calls[0][0].select.trip.select);
    expect(tripSelect).not.toContain("homeCurrency");
    for (const k of FORBIDDEN) expect(tripSelect).not.toContain(k);
  });

  it("selects and shows the numbers only with both Show who's going and Contact details on (Review Focus 5)", async () => {
    tripMemberFindManyMock.mockResolvedValue([
      { ...MEMBER, travelNumber: "+39 333 1", user: { ...MEMBER.user, travellerDetails: { mobile: "0400 000 000" } } },
    ]);
    shareFindFirstMock.mockResolvedValue({ ...share(), showTravellers: true, includeContacts: true });
    await renderPage();
    const sel = tripMemberFindManyMock.mock.calls[0][0].select;
    expect(sel.travelNumber).toBe(true);
    expect(sel.user.select.travellerDetails).toEqual({ select: { mobile: true } });
    for (const k of ["bankDetails", "emergencyName", "emergencyPhone", "email"]) {
      expect(JSON.stringify(sel)).not.toContain(k);
    }
    expect(screen.getByText("Mobile 0400 000 000")).toBeInTheDocument();
    expect(screen.getByText("Travel number +39 333 1")).toBeInTheDocument();
  });

  it("includeContacts without showTravellers selects nothing extra and runs no member query", async () => {
    shareFindFirstMock.mockResolvedValue({ ...share(), showTravellers: false, includeContacts: true });
    await renderPage();
    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
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

  // LA-134: wraps at spaces only — no break-words, no NBSP tether. The old
  // LA-043 glue plus break-words forced a split inside "2026" at narrow
  // widths; a bare year on its own line beats a split year.
  it("renders the trip name as plain text with spaces, wrapped by text-balance (W4, LA-134)", async () => {
    shareFindFirstMock.mockResolvedValue(share({ name: "EU Christmas 2026" }));
    await renderPage();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("EU Christmas 2026");
    expect(h1.className).toContain("text-balance");
  });

  it("addresses wrap in Day by day (LA-012)", async () => {
    await renderStage("before");
    expect(screen.getByText(/Sparkassenstraße/).className).not.toContain("truncate");
  });

  it("uses no pre-reskin 1px borders", async () => {
    const { container } = await renderStage("during");
    const onepx = Array.from(container.querySelectorAll("[class]")).filter((el) =>
      (el.getAttribute("class") ?? "").split(/\s+/).includes("border"),
    );
    expect(onepx).toEqual([]);
  });

  it("drops the old lilac Money card and the old footer line for the one-line footer", async () => {
    const { container } = await renderPage();
    expect(container.querySelector("[data-slot='share-money']")).toBeNull();
    expect(screen.queryByText("Made with Teepee · plan it with your people")).not.toBeInTheDocument();
    expect(screen.getByText(SHARE_FOOTER_COPY)).toBeInTheDocument();
  });
});

/**
 * The sticky box is the cell's inner wrapper, never the grid cell (LA-135).
 * `lg:self-start` is a grid-item alignment property, so tally's own
 * `lg:self-start` (unrelated to stickiness) has to stay on its cell to have
 * any effect — only `lg:sticky` must never land on the cell itself.
 */
function stickySections(c: HTMLElement) {
  const cells = Array.from(c.querySelectorAll<HTMLElement>("[data-share-section]"));
  for (const cell of cells) {
    expect(cell.className.split(/\s+/)).not.toEqual(expect.arrayContaining(["lg:sticky"]));
  }
  return cells
    .filter((cell) => (cell.firstElementChild as HTMLElement).className.split(/\s+/).includes("lg:sticky"))
    .map((cell) => ({ key: cell.getAttribute("data-share-section"), classes: (cell.firstElementChild as HTMLElement).className.split(/\s+/) }));
}

describe("SharePage — stages (SHARE.md §1)", () => {
  it("before: hero → map → days → cta (one route section)", async () => {
    const { container } = await renderStage("before");
    expect(sectionOrder(container)).toEqual(["hero", "map", "days", "cta"]);
    // Spec 2026-10-02 §F: the left item beside the route list sticks on desktop.
    const sticky = stickySections(container);
    expect(sticky.map((s) => s.key)).toEqual(["hero"]);
    expect(sticky[0].classes).toEqual(expect.arrayContaining(["lg:sticky", "lg:top-6"]));
    expect(container.querySelector("[data-slot='share-hero']")!.getAttribute("data-stage")).toBe("before");
    // Day by day opens at the first stop.
    expect(container.querySelector("[data-stop-open]")!.getAttribute("data-stop-open")).toBe("s1");
  });

  it("before, with every switch off: the map sits in column 1 under the hero while the route list spans both rows beside them", async () => {
    const { container } = await renderStage("before", { includeAccommodation: false, includeTransport: false, includeDailyPlans: false });
    const cell = (key: string) => container.querySelector<HTMLElement>(`[data-share-section='${key}']`)!;
    expect(cell("map").className).toContain("lg:order-3");
    expect(cell("map").className).not.toContain("lg:col-span-2");
    expect(cell("route").className).toContain("lg:row-span-2");
    expect(cell("route").className).not.toContain("[&>div");
    expect(cell("route").querySelector("[data-slot='share-route']")!.className).toContain("lg:h-full");
  });

  it("during: hero → right-now → next → journal → map → days → cta", async () => {
    const { container } = await renderStage("during");
    expect(sectionOrder(container)).toEqual(["hero", "right-now", "next", "journal", "map", "days", "cta"]);
    // Spec 2026-10-02 §F: the left item beside the route list sticks on desktop.
    const sticky = stickySections(container);
    expect(sticky.map((s) => s.key)).toEqual(["map"]);
    expect(sticky[0].classes).toEqual(expect.arrayContaining(["lg:sticky", "lg:top-6"]));
    expect(screen.getByText("Right now")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In Munich" })).toBeInTheDocument();
    // The route opens at the current stop.
    expect(container.querySelector("[data-stop-open]")!.getAttribute("data-stop-open")).toBe("s1");
    expect(container.querySelector("[data-slot='share-next']")).toHaveTextContent("London");
  });

  it("after: hero → tally → journal → map → days → cta, with Use this route", async () => {
    const { container } = await renderStage("after");
    expect(sectionOrder(container)).toEqual(["hero", "tally", "journal", "map", "days", "cta"]);
    // Spec 2026-10-02 §F: the left item beside the route list sticks on desktop.
    const sticky = stickySections(container);
    expect(sticky.map((s) => s.key)).toEqual(["map"]);
    expect(sticky[0].classes).toEqual(expect.arrayContaining(["lg:sticky", "lg:top-6"]));
    expect(screen.getByRole("link", { name: "Use this route" }).getAttribute("href")).toContain(
      encodeURIComponent("/trips/new?fromShare=tok"),
    );
    // All folded.
    expect(container.querySelector("[data-stop-open]")).toBeNull();
  });

  it("with all three itinerary dials off, the old route list stands alone: no opening Stop cards", async () => {
    const { container } = await renderStage("before", {
      includeAccommodation: false,
      includeTransport: false,
      includeDailyPlans: false,
    });
    expect(sectionOrder(container)).toEqual(["hero", "map", "route", "cta"]);
    expect(screen.getAllByRole("heading", { name: "The route" })).toHaveLength(1);
    expect(container.querySelector("[data-slot='share-route']")).not.toBeNull();
    expect(container.querySelector("[aria-expanded]")).toBeNull();
  });

  it("with the route showing its Stops, there is one \"The route\" heading and each Stop appears once", async () => {
    const { container } = await renderStage("before");
    expect(screen.getAllByRole("heading", { name: "The route" })).toHaveLength(1);
    expect(container.querySelector("[data-slot='share-route']")).toBeNull();
    const cards = Array.from(container.querySelectorAll("[data-share-stop]"));
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Munich");
    expect(cards[1]).toHaveTextContent("London");
    expect(container.querySelectorAll("[data-share-section='days'] li[data-share-stop='s1']")).toHaveLength(1);
    expect(container.querySelector("[data-share-section='route']")).toBeNull();
  });

  it("hides the journal section when includeJournal is off", async () => {
    const { container } = await renderStage("during", { includeJournal: false });
    expect(sectionOrder(container)).not.toContain("journal");
  });

  it("shows the leg to the next stop in Day by day only when includeTransport is on", async () => {
    await renderStage("before");
    expect(screen.getByText("Flight to London")).toBeInTheDocument();
  });

  it("the top bar's Plan your own trip goes to Join the waiting list with a hashed ref, never the token", async () => {
    await renderStage("before");
    const href = screen.getByRole("link", { name: "Plan your own trip" }).getAttribute("href")!;
    expect(href).toMatch(/^\/\?panel=request&ref=share&t=[0-9a-f]{10}$/);
    expect(href).not.toContain("tok");
  });
});

describe("SharePage — motion (MOTION.md S1, S4)", () => {
  it("every section but the hero rises in on scroll, the two columns of a row staggered", async () => {
    const { container } = await renderStage("before");
    const sections = [...container.querySelectorAll<HTMLElement>("[data-share-section]")];
    for (const [i, el] of sections.entries()) {
      const reveal = el.querySelector(":scope > div > [data-slot='share-reveal']") as HTMLElement | null;
      if (el.dataset.shareSection === "hero") {
        expect(reveal).toBeNull();
      } else {
        expect(reveal).not.toBeNull();
        expect(reveal!.style.getPropertyValue("--tp-i")).toBe(String(i % 2));
      }
    }
    // No-JS visitors still see the sections.
    expect(container.querySelector("noscript")).not.toBeNull();
  });

  it("keys the countdown's once-per-session flag by the hashed ref, never the raw token", async () => {
    sessionStorage.clear();
    await renderStage("before");
    await act(async () => {});
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith("tp-share-count:"));
    expect(keys).toEqual([`tp-share-count:${shareRefParam("tok")}`]);
    expect(keys[0]).not.toContain("tok");
  });
});

describe("SharePage — Show who's going (ADR 0051 amendment 2026-09-30)", () => {
  it("off: never queries members, no hero avatars, journal avatars without photos", async () => {
    await renderStage("after");
    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
    expect(document.querySelector("[data-slot='share-travellers']")).toBeNull();
    expect(screen.getAllByTestId("avatar").every((a) => a.getAttribute("data-image") === "")).toBe(true);
  });

  it("on: selects TRAVELLER_SELECT only (no email) and shows link-scoped photos", async () => {
    tripMemberFindManyMock.mockResolvedValue([MEMBER]);
    await renderStage("before", { showTravellers: true });
    // Members of this trip only.
    expect(tripMemberFindManyMock.mock.calls[0][0].where).toEqual({ tripId: "t1" });
    const select = tripMemberFindManyMock.mock.calls[0][0].select.user.select;
    expect(Object.keys(select)).not.toContain("email");
    expect(screen.getByText("Cameron's trip")).toBeInTheDocument();
    expect(screen.getAllByTestId("avatar")[0]).toHaveAttribute("data-image", "/share/tok/traveller-photo/u1?v=7");
  });
});

describe("SharePage — reads (ADR 0051 floor, one wave)", () => {
  it("starts every dial-gated read together, and the Journal photo read only after the hidden pairs", async () => {
    shareFindFirstMock.mockResolvedValue({
      ...share({ startDate: STAGE_TRIPS.during.startDate, endDate: STAGE_TRIPS.during.endDate }),
      id: "link-1",
      includeJournal: true,
      showTravellers: true,
      includeContacts: false,
    });
    stopFindManyMock.mockResolvedValue(STAGE_TRIPS.during.stops);
    let release!: (rows: unknown[]) => void;
    transportFindManyMock.mockReturnValue(new Promise((r) => (release = r)));

    const page = SharePage({ params: Promise.resolve({ token: "tok" }) });
    await new Promise((r) => setTimeout(r, 0));

    // The transport read has not answered, yet every other first-wave read is already out…
    expect(transportFindManyMock).toHaveBeenCalledTimes(1);
    expect(accommodationFindManyMock).toHaveBeenCalledTimes(1);
    expect(itemFindManyMock).toHaveBeenCalledTimes(1);
    expect(dayTitleFindManyMock).toHaveBeenCalledTimes(1);
    expect(tripMemberFindManyMock).toHaveBeenCalledTimes(1);
    expect(journalEntryFindManyMock).toHaveBeenCalledTimes(2);
    // …and the photo read, which needs the hidden pairs, waits for the wave.
    expect(attachmentFindManyMock).not.toHaveBeenCalled();

    release([]);
    render(await page);
    expect(attachmentFindManyMock).toHaveBeenCalledTimes(1);
  });
});

describe("SharePage — privacy regression (spec verification)", () => {
  const SECRET_VALUES = ["PNR-ABC123", "CONF-999", "BOOK-777", "secret", "private.example", "12345", "123.45", "EUR", EMAIL, "/api/avatars"];
  for (const stage of ["before", "during", "after"] as const) {
    for (const showTravellers of [false, true]) {
      it(`never renders reference, confirmation, costMinor or an email — ${stage}, showTravellers ${showTravellers ? "on" : "off"}`, async () => {
        tripMemberFindManyMock.mockResolvedValue([MEMBER]);
        const { container } = await renderStage(stage, { showTravellers });
        // The private-bearing rows really reach the render (the open stop in
        // Before/During, Right now's today list in During)…
        if (stage !== "after") {
          expect(container.textContent).toContain("Check in, Platzl Hotel");
          expect(container.textContent).toContain("Christmas market");
        }
        expect(container.querySelector("[data-testid='route-map']")?.getAttribute("data-props")).toContain("Munich");
        // The footer is the one legitimate "booking references" on the page:
        // it must appear exactly once, so stripping it can't hide a second,
        // leaked occurrence of the word.
        expect(container.innerHTML.split(SHARE_FOOTER_COPY)).toHaveLength(2);
        const html = container.innerHTML.replace(SHARE_FOOTER_COPY, "");
        for (const word of ["reference", "confirmation", "costMinor"]) expect(html).not.toContain(word);
        for (const v of SECRET_VALUES) expect(container.innerHTML).not.toContain(v);
        expect(container.textContent ?? "").not.toMatch(/[$€£¥]\s?\d|per person|each owes|split/i);
      });
    }
  }
});

describe("SharePage — Journal (Task 20, spec L / ADR 0051 amendment)", () => {
  const cam = {
    id: "u1",
    name: "Cam Williams",
    displayName: null,
    image: "https://example.com/cam.png",
    photoKey: null,
    photoUpdatedAt: null,
  };

  it("never fetches Journal entries or photos, and shows no journal section, when includeJournal is off", async () => {
    // Default `share()` fixture leaves includeJournal unset (falsy).
    await renderPage();
    expect(journalEntryFindManyMock).not.toHaveBeenCalled();
    expect(attachmentFindManyMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "How it went" })).not.toBeInTheDocument();
  });

  it("shows 'How it went' with the author's first name and note text when includeJournal is on", async () => {
    shareFindFirstMock.mockResolvedValue({ ...share(), includeJournal: true });
    journalEntryFindManyMock.mockResolvedValue([
      { date: "2020-12-07", authorId: "u1", body: "Great day in Munich", author: cam },
    ]);
    const { container } = await renderPage();
    expect(screen.getByRole("heading", { name: "How it went" })).toBeInTheDocument();
    expect(screen.getByText("Cam")).toBeInTheDocument();
    expect(screen.getByText("Great day in Munich")).toBeInTheDocument();
    // No avatar/profile-photo <img> anywhere on the page (showTravellers off).
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  // Fix round 1 (Important): hiddenFromShares must be filtered in the
  // `where`, not dropped in JS after being selected — a body an author
  // marked "Keep off Share links" must never even reach this page's props.
  it("queries visible entries with hiddenFromShares:false in the where, and never selects body in the separate hidden-pairs query", async () => {
    shareFindFirstMock.mockResolvedValue({ ...share(), includeJournal: true });
    journalEntryFindManyMock.mockResolvedValue([]);
    await renderPage();

    const calls = journalEntryFindManyMock.mock.calls.map((c) => c[0]);
    const visibleCall = calls.find((c) => c.where.hiddenFromShares === false);
    const hiddenPairsCall = calls.find((c) => c.where.hiddenFromShares === true);
    expect(visibleCall).toBeDefined();
    expect(hiddenPairsCall).toBeDefined();
    // The hidden-pairs query is date+authorId only — it must never select a
    // body, ever, even one that will end up excluded from the render.
    expect(Object.keys(hiddenPairsCall!.select)).toEqual(
      expect.arrayContaining(["date", "authorId"]),
    );
    expect(Object.keys(hiddenPairsCall!.select)).not.toContain("body");
  });

  it("never renders a hidden entry's body — the visible-entries query (modelling a real hiddenFromShares:false filter) simply doesn't return it", async () => {
    shareFindFirstMock.mockResolvedValue({ ...share(), includeJournal: true });
    // Models what Postgres actually does: the hidden-pairs call sees the
    // row (date+authorId only); the visible-entries call — filtered by
    // `hiddenFromShares: false` in its own `where` — never returns it.
    journalEntryFindManyMock.mockImplementation(
      (args: { where: { hiddenFromShares?: boolean } }) =>
        Promise.resolve(
          args.where.hiddenFromShares === true ? [{ date: "2020-12-07", authorId: "u1" }] : [],
        ),
    );
    const { container } = await renderPage();
    expect(screen.queryByText("Secret diary text")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "How it went" })).not.toBeInTheDocument();
    expect(sectionOrder(container)).not.toContain("journal");
  });

  it("excludes a hidden author's photo from the photo query via the hidden-pairs (targetId, uploadedById) in the where", async () => {
    shareFindFirstMock.mockResolvedValue({ ...share(), includeJournal: true });
    journalEntryFindManyMock.mockImplementation(
      (args: { where: { hiddenFromShares?: boolean } }) =>
        Promise.resolve(
          args.where.hiddenFromShares === true ? [{ date: "2020-12-07", authorId: "u1" }] : [],
        ),
    );
    attachmentFindManyMock.mockResolvedValue([]);
    await renderPage();

    expect(attachmentFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { OR: [{ targetId: "2020-12-07", uploadedById: "u1" }] },
        }),
      }),
    );
  });

  // Final review #11: only image Journal uploads ever reach a Share link
  // (the photo route refuses non-images too; the query shouldn't list them).
  it("scopes the Journal photo query to image mime types", async () => {
    shareFindFirstMock.mockResolvedValue({ ...share(), includeJournal: true });
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);
    await renderPage();

    expect(attachmentFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetType: "JOURNAL",
          mime: { startsWith: "image/" },
        }),
      }),
    );
  });

  it("shows a Journal photo through the link-scoped photo route, not /api/attachments", async () => {
    shareFindFirstMock.mockResolvedValue({ ...share(), includeJournal: true });
    // No hidden pairs — this author's entry/photo is fully visible.
    journalEntryFindManyMock.mockImplementation(
      (args: { where: { hiddenFromShares?: boolean } }) =>
        Promise.resolve(
          args.where.hiddenFromShares === true
            ? []
            : [{ date: "2020-12-07", authorId: "u1", body: "", author: cam }],
        ),
    );
    attachmentFindManyMock.mockResolvedValue([
      { id: "photo-1", targetId: "2020-12-07", uploadedById: "u1", uploadedBy: cam },
    ]);
    const { container } = await renderPage();
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "/share/tok/journal-photo/photo-1");
  });
});

describe("SharePage — Day titles (Task 5, CONTEXT.md \"Day title\")", () => {
  // Day by day renders a day's title on the open stop; Before opens the first.
  it("shows a Day title on the open stop when includeDailyPlans is on", async () => {
    dayTitleFindManyMock.mockResolvedValue([{ stopId: "s1", dayIndex: 1, title: "Sintra day trip" }]);
    await renderStage("before");
    expect(screen.getByText("Sintra day trip")).toBeInTheDocument();
  });

  it("never fetches or shows a Day title when includeDailyPlans is off", async () => {
    // Even if the db somehow has a row for this date, the off dial must win.
    dayTitleFindManyMock.mockResolvedValue([{ stopId: "s1", dayIndex: 1, title: "Sintra day trip" }]);
    await renderStage("before", { includeDailyPlans: false });
    expect(dayTitleFindManyMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Sintra day trip")).not.toBeInTheDocument();
  });
});

describe("SharePage — Surprise (CONTEXT.md \"Surprise\", ADR 0051)", () => {
  // Before opens the first Stop, so a Surprise on Munich (s1) is the Stop
  // whose Day by day is actually rendered.
  const SECRET_ITEM = { id: "i-secret", title: "Champagne tasting", category: "FOOD", stopId: "s1", startTime: "17:00", endTime: null, address: "Weinstube 1" };

  /** The db honours the fragment the way Prisma would: a marked Item read drops what is inside s1. */
  function withSecretItem() {
    const date = STAGE_TRIPS.before.stops[0].arriveDate;
    itemFindManyMock.mockImplementation(async (a: { where: { AND?: unknown } }) => [
      { id: "i0", title: "Christmas market", category: "FOOD", date, startTime: "18:00", endTime: null, stopId: "s2", address: null },
      ...(a.where.AND === MARKER_WHERE.item.AND ? [] : [{ ...SECRET_ITEM, date }]),
    ]);
  }

  async function renderBefore() {
    // renderStage re-seeds the Item rows, so the Before trip is set up here.
    const t = STAGE_TRIPS.before;
    shareFindFirstMock.mockResolvedValue({
      ...share({ startDate: t.startDate, endDate: t.endDate }),
      id: "link-1", includeJournal: false, showTravellers: false, includeContacts: false,
    });
    stopFindManyMock.mockResolvedValue(t.stops);
    return renderPage();
  }

  it("asks the loader with no viewer before any read it filters, and spreads the fragments", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ hiddenStopIds: ["s1"] }));
    withSecretItem();
    await renderBefore();
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith("t1", null);
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, itemFindManyMock);
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, accommodationFindManyMock);
    expect(itemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ hiddenFromShares: false, ...MARKER_WHERE.item }) }),
    );
    expect(accommodationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(MARKER_WHERE.accommodation) }),
    );
    // No Day titles are read for the hidden Stop.
    expect(dayTitleFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { stopId: { in: ["s2"] } } }));
  });

  it("without a Surprise the Item inside Munich is rendered (control)", async () => {
    withSecretItem();
    const { container } = await renderBefore();
    expect(container.textContent).toContain("Champagne tasting");
  });

  it("Review Focus: with the daily-plans dial on, an Item inside a Surprise Stop is not rendered while the Stop's name is", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ hiddenStopIds: ["s1"] }));
    withSecretItem();
    const { container } = await renderBefore();
    const text = container.textContent ?? "";
    expect(text).not.toContain("Champagne tasting");
    expect(container.innerHTML).not.toContain("Weinstube");
    expect(text).toContain("Munich");
  });

  it("a real-plan Surprise Item shows as Surprise at its time, with no title or address", async () => {
    const date = STAGE_TRIPS.before.stops[0].arriveDate;
    loadSurpriseVisibilityMock.mockResolvedValue(
      hiddenVisibility({
        placeholders: [
          placeholderItem({ id: "i-secret", stopId: "s1", date, startTime: "17:00" }),
          placeholderItem({ id: "i-fork", stopId: "s1", date, startTime: "09:15", forkId: "fork-1" }),
        ],
      }),
    );
    withSecretItem();
    const { container } = await renderBefore();
    const text = container.textContent ?? "";
    expect(text).toContain("Surprise");
    expect(text).toContain("17:00");
    expect(text).not.toContain("Champagne tasting");
    expect(text).not.toContain("09:15");
  });

  it("a Surprise Item also kept off Share links leaves no placeholder, while a plain one still shows", async () => {
    const date = STAGE_TRIPS.before.stops[0].arriveDate;
    loadSurpriseVisibilityMock.mockResolvedValue(
      hiddenVisibility({
        placeholders: [
          placeholderItem({ id: "i-secret", stopId: "s1", date, startTime: "17:00" }),
          placeholderItem({ id: "i-off-shares", stopId: "s1", date, startTime: "08:45", hiddenFromShares: true }),
        ],
      }),
    );
    withSecretItem();
    const { container } = await renderBefore();
    const text = container.textContent ?? "";
    expect(text).toContain("17:00");
    expect(text).toContain("Surprise");
    expect(text).not.toContain("08:45");
  });
});

describe("SharePage — empty", () => {
  it("a dated trip with no dated stops shows the kit empty state in The route card", async () => {
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    const { container } = await renderPage();
    expect(screen.getByRole("heading", { name: "No stops yet" })).toBeInTheDocument();
    // Rough Stops count on a Share link too (final review F6).
    expect(screen.getByText("The route shows here once the trip has Stops.")).toBeInTheDocument();
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
    expect(sectionOrder(container)).not.toContain("map");
  });
});

describe("Share page is light-only (spec 2026-10-01 §A)", () => {
  it("forces light on its root the way the Landing does", async () => {
    const { container } = await renderPage();
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-theme", "light");
    expect(root.className).toMatch(/(^|\s)light(\s|$)/);
  });
  it("pins the route map to the light tiles", async () => {
    await renderPage();
    const props = JSON.parse(screen.getByTestId("route-map").getAttribute("data-props")!);
    expect(props.theme).toBe("light");
  });
  it("shows the Static Maps image, not the live map, while Maps config exists", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "browser-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "map-id");
    await renderPage();
    const img = screen.getByRole("img", { name: /^Route map of / });
    expect(img.getAttribute("src")).toContain("https://maps.googleapis.com/maps/api/staticmap");
    expect(screen.getByRole("button", { name: "Explore map" })).toBeInTheDocument();
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  });
  it("uses the Static Map ID when set, else the Map ID", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "browser-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "map-id");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_STATIC_MAP_ID", "static-id");
    await renderPage();
    const src = screen.getByRole("img", { name: /^Route map of / }).getAttribute("src")!;
    expect(new URL(src).searchParams.get("map_id")).toBe("static-id");
  });
  it("keeps the live map when fewer than two Stops are located", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "browser-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "map-id");
    stopFindManyMock.mockResolvedValue([STOPS[0], { ...STOPS[1], lat: null, lng: null }]);
    await renderPage();
    expect(screen.getByTestId("route-map")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explore map" })).not.toBeInTheDocument();
  });
  it("renders the live map straight away without Maps config", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    await renderPage();
    expect(screen.getByTestId("route-map")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explore map" })).not.toBeInTheDocument();
  });
  it("pins the phone address-bar colour to the light ground", async () => {
    const mod = await import("./page");
    expect(mod.viewport).toEqual({ themeColor: "#FFFBF3" });
  });
  it("owns its ink: text-foreground and a light colour-scheme on the root, so .dark on <html> never leaks cream text onto white cards (W3, LA-113)", async () => {
    const { container } = await renderPage();
    const classes = (container.firstElementChild as HTMLElement).className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["text-foreground", "bg-background"]));
  });
});

describe("Share page car legs (Travel times)", () => {
  it("keys a car leg with a typed departure point from that point, as the refresh does, and draws its road", async () => {
    const typed = { lat: 48.14, lng: 11.56 };
    const row = {
      id: "car1", mode: "CAR", fromStopId: "s1", toStopId: "s2", depPlace: "Hotel garage", arrPlace: null,
      depAt: null, arrAt: null, sortOrder: 0, depLat: typed.lat, depLng: typed.lng, arrLat: null, arrLng: null,
      depIsHome: false, arrIsHome: false, ...PRIVATE.transport,
    };
    transportFindManyMock.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => [
      Object.fromEntries(Object.entries(row).filter(([k]) => select[k])),
    ]);
    const key = driveKey(typed, { lat: STOPS[1].lat, lng: STOPS[1].lng });
    travelTimeFindManyMock.mockResolvedValue([{ key, status: "OK", minutes: 600, distanceM: 900000, polyline: "_p~iF~ps|U" }]);

    await renderPage();

    const [[args]] = travelTimeFindManyMock.mock.calls;
    expect(args.where.key.in).toEqual([key]);
    const props = JSON.parse(screen.getByTestId("route-map").getAttribute("data-props")!);
    expect(props.legPaths).toEqual({ "s1>s2": "_p~iF~ps|U" });
  });
});

describe("SharePage — travel legs", () => {
  const BASE = { sortOrder: 0, depIsHome: false, arrIsHome: false, depAt: null, arrAt: null, serviceNumber: null };
  const withSeatAndGate = { seat: "SEAT-14C", gate: "GATE-B22", carrier: "CARRIER-X", ...PRIVATE.transport };
  const legs = (container: HTMLElement) => Array.from(container.querySelectorAll("[data-share-leg]"));

  it("selects serviceNumber and none of the other private Transport keys", async () => {
    await renderPage();
    const keys = Object.keys(transportFindManyMock.mock.calls[0][0].select);
    expect(keys).toContain("serviceNumber");
    for (const k of ["carrier", "seat", "terminal", "gate", "coach", "platform", "reference", "notes"]) {
      expect(keys).not.toContain(k);
    }
  });

  it("shows a train's number, duration and day marker, and none of its private details", async () => {
    transportFindManyMock.mockResolvedValue([
      { ...BASE, ...withSeatAndGate, id: "tr1", mode: "TRAIN", fromStopId: "s1", toStopId: "s2", depPlace: "Munich Hbf", arrPlace: "London St Pancras", depAt: new Date("2020-12-08T05:51:00Z"), arrAt: new Date("2020-12-08T12:40:00Z"), serviceNumber: "ICE 9572" },
    ]);
    const { container } = await renderPage();
    const text = container.textContent ?? "";
    expect(text).toContain("ICE 9572");
    expect(text).toContain("6h 49m");
    for (const secret of ["SEAT-14C", "GATE-B22", "CARRIER-X"]) expect(text).not.toContain(secret);
  });

  it("hands the client only mode, label, when, number, arrivesAt and arrivesLocal for a leg", async () => {
    transportFindManyMock.mockResolvedValue([
      { ...BASE, ...withSeatAndGate, id: "tr1", mode: "TRAIN", fromStopId: "s1", toStopId: "s2", depAt: new Date("2020-12-08T05:51:00Z"), arrAt: new Date("2020-12-08T12:40:00Z"), serviceNumber: "ICE 1" },
    ]);
    await renderPage();
    const { stops } = dayByDaySpy.mock.calls[0][0];
    expect(Object.keys(stops[0].legAfter)).toEqual(["legs", "changeovers"]);
    expect(Object.keys(stops[0].legAfter.legs[0]).sort()).toEqual(["arrivesAt", "arrivesLocal", "label", "mode", "number", "when"]);
  });

  const BEFORE = { startDate: "2099-12-06", endDate: "2099-12-09" };
  const cardsIn = (el: Element) => Array.from(el.querySelectorAll<HTMLElement>("[data-travel-row]"));
  const DPS_BKK_MUC = [
    { ...BASE, ...withSeatAndGate, id: "bkk", mode: "FLIGHT", fromStopId: "s1", toStopId: null, depPlace: "Denpasar (DPS)", arrPlace: "Bangkok (BKK)", arrPlaceId: "PLACE-BKK", arrTimezone: "Asia/Bangkok", depAt: new Date("2099-12-08T12:00:00Z"), arrAt: new Date("2099-12-08T15:40:00Z"), serviceNumber: "TG 440" },
    { ...BASE, ...withSeatAndGate, id: "muc", mode: "FLIGHT", fromStopId: null, toStopId: "s2", depPlace: "Bangkok Suvarnabhumi", depPlaceId: "PLACE-BKK", depTimezone: "Asia/Bangkok", arrPlace: "Munich (MUC)", depAt: new Date("2099-12-08T18:15:00Z"), arrAt: new Date("2099-12-09T05:30:00Z"), serviceNumber: "TG 924", sortOrder: 1 },
  ];
  const DENPASAR_MUNICH = [
    { ...STOPS[0], id: "s1", name: "Denpasar", country: "Indonesia", timezone: "Asia/Makassar", arriveDate: "2099-12-06", departDate: "2099-12-08" },
    { ...STOPS[0], id: "s2", sortOrder: 1, arriveDate: "2099-12-09", departDate: "2099-12-09" },
  ];

  it("two legs that meet at a place show the layover line between their cards", async () => {
    shareFindFirstMock.mockResolvedValue(share(BEFORE));
    stopFindManyMock.mockResolvedValue(DENPASAR_MUNICH);
    transportFindManyMock.mockResolvedValue(DPS_BKK_MUC);
    const { container } = await renderPage();
    const stack = container.querySelector("[data-share-stop='s1'] [data-share-leg]")!;
    const [first, second] = cardsIn(stack);
    expect(cardsIn(stack)).toHaveLength(2);
    expect(first).toHaveTextContent("Flight to Bangkok (BKK)");
    expect(first).toHaveTextContent("Denpasar (DPS) 20:00 → Bangkok (BKK) 22:40");
    expect(second).toHaveTextContent("Flight to Munich");
    const line = stack.querySelector("[data-changeover]")!;
    expect(line).toHaveTextContent(/^Layover in Bangkok · 2h 35m$/);
    expect(first.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(container.querySelectorAll("[data-changeover]")).toHaveLength(1);
  });

  it("lists no leg between two Stops when the legs leaving one do not reach the next", async () => {
    shareFindFirstMock.mockResolvedValue(share(BEFORE));
    stopFindManyMock.mockResolvedValue(DENPASAR_MUNICH);
    transportFindManyMock.mockResolvedValue([DPS_BKK_MUC[0], { ...DPS_BKK_MUC[1], toStopId: null, arrPlace: "Vienna (VIE)" }]);
    const { container } = await renderPage();
    expect(legs(container)).toHaveLength(0);
  });

  it("the journey home in two legs is listed together at the end of the route, in order", async () => {
    shareFindFirstMock.mockResolvedValue(share({ ...BEFORE, homeTimezone: "Australia/Sydney" } as never));
    stopFindManyMock.mockResolvedValue(STAGE_TRIPS.before.stops);
    transportFindManyMock.mockResolvedValue([
      { ...BASE, id: "home", mode: "FLIGHT", fromStopId: null, toStopId: null, arrIsHome: true, depPlace: "Doha (DOH)", arrPlace: "12 Home Rd", arrPlaceId: "PLACE-HOME", depAt: new Date("2099-12-09T17:25:00Z"), arrAt: new Date("2099-12-10T07:30:00Z"), sortOrder: 0 },
      { ...BASE, id: "mid", mode: "FLIGHT", fromStopId: "s1", toStopId: "s2", depPlace: "Munich (MUC)", arrPlace: "London (LHR)", sortOrder: 1 },
      { ...BASE, id: "doh", mode: "FLIGHT", fromStopId: "s2", toStopId: null, depPlace: "London (LHR)", arrPlace: "Doha (DOH)", depAt: new Date("2099-12-09T07:55:00Z"), arrAt: new Date("2099-12-09T13:05:00Z"), sortOrder: 2 },
    ]);
    const { container } = await renderPage();
    const stacks = legs(container);
    expect(stacks).toHaveLength(2);
    expect(cardsIn(container)).toHaveLength(3);
    const back = stacks[1];
    const stopItems = container.querySelectorAll("[data-share-stop]");
    expect(back.compareDocumentPosition(stopItems[stopItems.length - 1]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    const [toDoha, home] = cardsIn(back);
    expect(toDoha).toHaveTextContent("Flight to Doha (DOH)");
    expect(home).toHaveTextContent("Flight home");
    expect(back.querySelector("[data-changeover]")).toHaveTextContent(/^Layover in Doha · 4h 20m$/);
    expect(container.innerHTML).not.toContain("Home Rd");
  });

  it("the journey out in two legs is listed together above the first Stop, naming no Home place", async () => {
    shareFindFirstMock.mockResolvedValue(share(BEFORE));
    stopFindManyMock.mockResolvedValue(STAGE_TRIPS.before.stops);
    transportFindManyMock.mockResolvedValue([
      { ...BASE, id: "muc", mode: "TRAIN", fromStopId: null, toStopId: "s1", depPlace: "frankfurt (fra)", arrPlace: "München Hbf", depAt: new Date("2099-12-05T20:00:00Z"), arrAt: new Date("2099-12-06T01:00:00Z"), sortOrder: 0 },
      { ...BASE, id: "fra", mode: "FLIGHT", fromStopId: null, toStopId: null, depIsHome: true, depPlace: "5 Example St", arrPlace: "Frankfurt (FRA)", depAt: new Date("2099-12-05T06:00:00Z"), arrAt: new Date("2099-12-05T18:00:00Z"), sortOrder: 1 },
    ]);
    const { container } = await renderPage();
    const out = legs(container)[0];
    const first = container.querySelector("[data-share-stop]")!;
    expect(out.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const [toFrankfurt, toMunich] = cardsIn(out);
    expect(cardsIn(out)).toHaveLength(2);
    expect(toFrankfurt).toHaveTextContent("Flight to Frankfurt (FRA)");
    expect(toMunich).toHaveTextContent("Train to Munich");
    expect(out.querySelector("[data-changeover]")).toHaveTextContent(/^Change at Frankfurt · 2h$/);
    expect(container.innerHTML).not.toContain("Example St");
  });

  it("no leg hands its booking reference, carrier or seat to a client component", async () => {
    shareFindFirstMock.mockResolvedValue(share({ ...BEFORE, homeTimezone: "Australia/Sydney" } as never));
    stopFindManyMock.mockResolvedValue(DENPASAR_MUNICH);
    transportFindManyMock.mockResolvedValue([
      { ...BASE, ...withSeatAndGate, id: "out", mode: "FLIGHT", fromStopId: null, toStopId: "s1", depIsHome: true, depPlace: "12 Example St", depPlaceId: "PLACE-HOME", arrPlace: "Denpasar (DPS)", depAt: new Date("2099-12-05T08:00:00Z"), arrAt: new Date("2099-12-05T14:00:00Z") },
      ...DPS_BKK_MUC,
    ]);
    const { container } = await renderPage();
    expect(cardsIn(container)).toHaveLength(3);
    expect(clientProps.length).toBeGreaterThan(0);
    const flatten = (v: unknown, seen = new Set<unknown>()): string[] => {
      if (v == null || typeof v === "function") return [];
      if (typeof v !== "object") return [String(v)];
      if (v instanceof Date) return [v.toISOString()];
      if (seen.has(v)) return [];
      seen.add(v);
      if ("$$typeof" in v) return flatten((v as { props?: unknown }).props, seen);
      return Object.entries(v).flatMap(([k, x]) => [k, ...flatten(x, seen)]);
    };
    const sent = clientProps.flatMap((p) => flatten(p));
    for (const key of ["reference", "carrier", "seat", "gate", "notes", "depPlaceId", "arrPlaceId", "depTimezone", "arrTimezone"]) {
      expect(sent).not.toContain(key);
    }
    const text = sent.join("\n");
    for (const secret of ["PNR-ABC123", "CARRIER-X", "SEAT-14C", "GATE-B22", "PLACE-HOME", "PLACE-BKK", "Asia/Bangkok", "Australia/Sydney", "Example St"]) {
      expect(text).not.toContain(secret);
      expect(container.innerHTML).not.toContain(secret);
    }
  });

  it("lists no leg at all, Home legs included, when the link leaves transport out", async () => {
    shareFindFirstMock.mockResolvedValue({ ...share(), includeTransport: false });
    const { container } = await renderPage();
    expect(legs(container)).toHaveLength(0);
  });

  it.each([
    ["a Home timezone", "Australia/Sydney", "19:00", "08:00 +2"],
    ["no Home timezone, reading each Home end in the Stop's zone", null, "09:00", "21:00 +1"],
  ])("lists the flights from and back Home, with %s", async (_n, homeTimezone, outDep, backArr) => {
    shareFindFirstMock.mockResolvedValue(share({ homeTimezone } as never));
    transportFindManyMock.mockResolvedValue([
      { ...BASE, id: "out", mode: "FLIGHT", fromStopId: null, toStopId: "s1", depIsHome: true, depPlace: "12 Example St, Gold Coast", arrPlace: "Munich (MUC)", depAt: new Date("2020-12-05T08:00:00Z"), arrAt: new Date("2020-12-06T06:00:00Z"), serviceNumber: "QF 1" },
      { ...BASE, id: "mid", mode: "FLIGHT", fromStopId: "s1", toStopId: "s2", depPlace: "Munich (MUC)", arrPlace: "London (LHR)" },
      { ...BASE, id: "back", mode: "FLIGHT", fromStopId: "s2", toStopId: null, arrIsHome: true, depPlace: "London (LHR)", arrPlace: "1 Home Rd, Gold Coast", depAt: new Date("2020-12-09T09:00:00Z"), arrAt: new Date("2020-12-10T21:00:00Z"), serviceNumber: "QF 2" },
    ]);
    const { container } = await renderPage();
    const rows = legs(container);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Flight to Munich");
    expect(rows[0]).toHaveTextContent(`${outDep} → Munich (MUC) 07:00 +1`);
    expect(rows[0]).toHaveTextContent("QF 1");
    expect(rows[2]).toHaveTextContent("Flight home");
    expect(rows[2]).toHaveTextContent(`London (LHR) 09:00 → ${backArr}`);
    expect(rows[2]).toHaveTextContent("QF 2");
    expect(container.textContent).not.toContain("Example St");
    expect(container.textContent).not.toContain("Home Rd");
    const stopItems = Array.from(container.querySelectorAll("[data-share-stop]"));
    expect(rows[0].compareDocumentPosition(stopItems[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rows[2].compareDocumentPosition(stopItems[stopItems.length - 1]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  const HOME_LEGS = [
    { ...BASE, id: "out", mode: "FLIGHT", fromStopId: null, toStopId: "s1", depIsHome: true, depPlace: "5 Example St", arrPlace: "Munich (MUC)", depAt: new Date("2099-12-05T08:00:00Z"), arrAt: new Date("2099-12-06T06:00:00Z") },
    { ...BASE, id: "back", mode: "FLIGHT", fromStopId: "s2", toStopId: null, arrIsHome: true, depPlace: "London (LHR)", arrPlace: "12 Home Rd", depAt: new Date("2099-12-09T09:00:00Z"), arrAt: new Date("2099-12-10T21:00:00Z") },
  ];

  it("sends no zone name and no Home place to the browser or the page", async () => {
    shareFindFirstMock.mockResolvedValue({ ...share({ startDate: "2099-12-06", endDate: "2099-12-09", homeTimezone: "Australia/Sydney" } as never) });
    stopFindManyMock.mockResolvedValue(STAGE_TRIPS.before.stops);
    transportFindManyMock.mockResolvedValue(HOME_LEGS);
    const { container } = await renderPage();
    const sent = JSON.stringify(dayByDaySpy.mock.calls[0][0]);
    for (const text of [sent, container.innerHTML]) {
      expect(text).not.toContain("Australia/Sydney");
      expect(text).not.toContain("Home Rd");
      expect(text).not.toContain("Example St");
    }
  });

  it("titles a day row for a flight into Home without naming Home", async () => {
    shareFindFirstMock.mockResolvedValue({ ...share({ startDate: "2099-12-06", endDate: "2099-12-09" }) });
    stopFindManyMock.mockResolvedValue(STAGE_TRIPS.before.stops);
    transportFindManyMock.mockResolvedValue(HOME_LEGS);
    await renderPage();
    const titles = dayByDaySpy.mock.calls[0][0].stops.flatMap((s: { days: { rows: { title: string }[] }[] }) => s.days.flatMap((d) => d.rows.map((r) => r.title)));
    expect(titles).toContain("Flight home");
    expect(titles.join("|")).not.toContain("Home Rd");
  });

  it("says Travelling home, never the Home place, while a Home leg is under way", async () => {
    const t = STAGE_TRIPS.during;
    shareFindFirstMock.mockResolvedValue({ ...share({ startDate: t.startDate, endDate: t.endDate }), includeJournal: false, showTravellers: false, includeContacts: false });
    stopFindManyMock.mockResolvedValue(t.stops);
    transportFindManyMock.mockResolvedValue([
      { ...BASE, id: "back", mode: "FLIGHT", fromStopId: "s2", toStopId: null, arrIsHome: true, depPlace: "London (LHR)", arrPlace: "12 Home Rd", depAt: new Date(Date.now() - 3_600_000), arrAt: new Date(Date.now() + 3_600_000) },
    ]);
    const { container } = await renderPage();
    expect(container.textContent).toContain("Travelling home");
    expect(container.textContent).not.toContain("Home Rd");
    expect(container.innerHTML).not.toContain("Home Rd");
  });

  const summariesOf = () =>
    (dayByDaySpy.mock.calls.at(-1)![0].stops as { summary: string | null }[]).map((s) => s.summary ?? "").join("|");

  it("a closed Stop card's summary names the stay and counts the plans when the link includes them", async () => {
    await renderStage("before");
    expect(summariesOf()).toContain("Platzl Hotel");
    expect(summariesOf()).toMatch(/1 plan\b/);
  });

  it("leaves the stay's name out of every closed-card summary when accommodation is off", async () => {
    const { container } = await renderStage("before", { includeAccommodation: false });
    expect(summariesOf()).not.toContain("Platzl Hotel");
    expect(container.innerHTML).not.toContain("Platzl Hotel");
    expect(summariesOf()).toMatch(/1 plan\b/);
  });

  it("leaves out the plans count when daily plans are off", async () => {
    await renderStage("before", { includeDailyPlans: false });
    expect(summariesOf()).not.toMatch(/plans?\b/);
    expect(summariesOf()).toContain("Platzl Hotel");
  });

  describe("the Right now clock on the travel days", () => {
    const sydney = { homeTimezone: "Australia/Sydney" };
    const duringAt = (stops: typeof STOPS, startDate: string, endDate: string) => {
      shareFindFirstMock.mockResolvedValue({ ...share({ startDate, endDate, ...sydney } as never), id: "link-1", includeJournal: false, showTravellers: false, includeContacts: false });
      stopFindManyMock.mockResolvedValue(stops);
      transportFindManyMock.mockResolvedValue([]);
    };
    const expectNoHomeZone = (container: HTMLElement) => {
      const props = JSON.stringify(rightNowSpy.mock.calls.at(-1)![0]);
      expect(props).not.toContain("Australia/Sydney");
      expect(container.innerHTML).not.toContain("Australia/Sydney");
      expect(container.textContent).not.toMatch(/AEDT|AEST|GMT\+11/);
    };

    it("after the last Stop's departure, reads the last Stop's zone", async () => {
      duringAt(
        [
          { ...STOPS[0], arriveDate: addDays(T, -8), departDate: addDays(T, -5) },
          { ...STOPS[1], arriveDate: addDays(T, -5), departDate: addDays(T, -3) },
        ],
        addDays(T, -8),
        addDays(T, 4),
      );
      const { container } = await renderPage();
      expect(rightNowSpy).toHaveBeenCalled();
      expect(rightNowSpy.mock.calls.at(-1)![0].timeZone).toBe("Europe/London");
      expectNoHomeZone(container);
    });

    it("before the first Stop's arrival, reads the first Stop's zone", async () => {
      duringAt(
        [
          { ...STOPS[0], arriveDate: addDays(T, 2), departDate: addDays(T, 5) },
          { ...STOPS[1], arriveDate: addDays(T, 5), departDate: addDays(T, 8) },
        ],
        addDays(T, -1),
        addDays(T, 8),
      );
      const { container } = await renderPage();
      expect(rightNowSpy).toHaveBeenCalled();
      expect(rightNowSpy.mock.calls.at(-1)![0].timeZone).toBe("Europe/Berlin");
      expectNoHomeZone(container);
    });
  });

  describe("one route, Home at each end", () => {
    const HOME = { homeName: "Gold Coast", homeLat: -28, homeLng: 153.4, homeTimezone: "Australia/Sydney" };
    const beforeWith = (over: Record<string, unknown> = {}, tripOver: Record<string, unknown> = HOME) => {
      shareFindFirstMock.mockResolvedValue({ ...share({ startDate: "2099-12-06", endDate: "2099-12-09", ...tripOver } as never), ...over });
      stopFindManyMock.mockResolvedValue(STAGE_TRIPS.before.stops);
      transportFindManyMock.mockResolvedValue(HOME_LEGS);
    };
    const homeCards = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[data-share-home]"));

    it("draws a Home card above the outbound leg and below the return leg, naming only the Home base", async () => {
      beforeWith();
      const { container } = await renderPage();
      const cards = homeCards(container);
      expect(cards).toHaveLength(2);
      const rows = legs(container);
      expect(cards[0].compareDocumentPosition(rows[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(cards[1].compareDocumentPosition(rows[1]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      for (const c of cards) {
        expect(c).toHaveTextContent("Gold Coast");
        expect(c).toHaveTextContent("Home");
        expect(c.textContent).not.toMatch(/Example St|Home Rd/);
      }
      expect(JSON.stringify(dayByDaySpy.mock.calls[0][0])).not.toContain("Australia/Sydney");
      expect(container.innerHTML).not.toContain("Australia/Sydney");
    });

    it("draws no Home card when the link leaves transport out", async () => {
      beforeWith({ includeTransport: false });
      const { container } = await renderPage();
      expect(homeCards(container)).toHaveLength(0);
    });

    it("keeps the legs but draws no Home card when the Home base has no point on the map", async () => {
      beforeWith({}, { homeName: "Gold Coast", homeLat: null, homeLng: null, homeTimezone: "Australia/Sydney" });
      const { container } = await renderPage();
      expect(legs(container)).toHaveLength(2);
      expect(homeCards(container)).toHaveLength(0);
      expect(container.textContent).not.toContain("Gold Coast");
    });

    it("lists a Stop with no dates once, after the scheduled Stops, as a plain card", async () => {
      beforeWith();
      stopFindManyMock.mockResolvedValue([
        ...STAGE_TRIPS.before.stops,
        { id: "s3", name: "Bali", country: "Indonesia", lat: null, lng: null, timezone: "Asia/Makassar", arriveDate: null, departDate: null, nights: 4, sortOrder: 2 },
      ]);
      const { container } = await renderPage();
      const rough = container.querySelector("[data-share-rough='s3']") as HTMLElement;
      expect(rough).toHaveTextContent("Bali");
      expect(rough).toHaveTextContent("Indonesia · 4 nights");
      expect(rough).toHaveTextContent("Dates to come");
      expect(rough.querySelector("button")).toBeNull();
      const lastScheduled = container.querySelector("[data-share-stop='s2']")!;
      expect(lastScheduled.compareDocumentPosition(rough) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(container.querySelectorAll("[data-share-section='days'] [data-share-rough]")).toHaveLength(1);
    });

    it("ends a closed card's summary with the Stop's country", async () => {
      await renderStage("before");
      expect(summariesOf()).toContain("Platzl Hotel · 1 plan · Germany");
    });
  });

  it("renders no Home leg when the Trip has none", async () => {
    const { container } = await renderPage();
    expect(legs(container)).toHaveLength(1);
  });
});

describe("SharePage — Usage", () => {
  it("mounts the one Usage marker on a valid link", async () => {
    await renderPage();
    expect(screen.getAllByTestId("usage-share-opened")).toHaveLength(1);
  });

  it("renders nothing, so no marker, for a missing link", async () => {
    shareFindFirstMock.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(screen.queryByTestId("usage-share-opened")).toBeNull();
  });
});
