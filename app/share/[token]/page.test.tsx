import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// share/[token]/page.tsx is an async Server Component with DB calls; invoke it
// with mocked db per-model methods (same pattern as calendar/page.test.tsx).
// Phase 4 Task 15: the staged page (SHARE.md §1 — before / during / after
// section order), the "Show who's going" dial, and the public-page
// guarantees: no costs or booking refs, `robots: noindex`, the trip name as
// the only h1.

const {
  shareFindUniqueMock,
  stopFindManyMock,
  itemFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
  dayTitleFindManyMock,
  journalEntryFindManyMock,
  attachmentFindManyMock,
  tripMemberFindManyMock,
} = vi.hoisted(() => ({
  shareFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  dayTitleFindManyMock: vi.fn().mockResolvedValue([]),
  journalEntryFindManyMock: vi.fn().mockResolvedValue([]),
  attachmentFindManyMock: vi.fn().mockResolvedValue([]),
  tripMemberFindManyMock: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db", () => ({
  db: {
    shareLink: { findUnique: shareFindUniqueMock },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    dayTitle: { findMany: dayTitleFindManyMock },
    journalEntry: { findMany: journalEntryFindManyMock },
    attachment: { findMany: attachmentFindManyMock },
    tripMember: { findMany: tripMemberFindManyMock },
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

import SharePage, { dynamic, metadata, noOrphan } from "./page";
import { SHARE_FOOTER_COPY } from "./share-cta";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { addDays } from "@/lib/dates";
import { shareRefParam } from "@/lib/share-ref";

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
  shareFindUniqueMock.mockResolvedValue({
    ...share({ startDate: t.startDate, endDate: t.endDate }),
    id: "link-1",
    includeJournal: true,
    showTravellers: false,
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
    // Money is a shared pot, and never shown here — no splitting language either.
    expect(text).not.toMatch(/per person|each owes|split/i);
  });

  it("never selects private fields from the database", async () => {
    tripMemberFindManyMock.mockResolvedValue([MEMBER]);
    shareFindUniqueMock.mockResolvedValue({ ...share(), showTravellers: true });
    await renderPage();
    const selectOf = (mock: ReturnType<typeof vi.fn>) => Object.keys(mock.mock.calls[0][0].select);
    const FORBIDDEN = ["reference", "confirmation", "notes", "link", "booking", "costMinor", "currency", "amountMinor", "costs", "photoAttachmentId", "email"];
    for (const mock of [transportFindManyMock, accommodationFindManyMock, itemFindManyMock, stopFindManyMock]) {
      expect(mock).toHaveBeenCalledTimes(1);
      const keys = selectOf(mock);
      for (const k of FORBIDDEN) expect(keys).not.toContain(k);
    }
    expect(tripMemberFindManyMock).toHaveBeenCalledTimes(1);
    const memberSelect = Object.keys(tripMemberFindManyMock.mock.calls[0][0].select.user.select);
    expect(memberSelect).toEqual(Object.keys(TRAVELLER_SELECT));
    for (const k of FORBIDDEN) expect(memberSelect).not.toContain(k);
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

  // LA-043: `text-balance` alone didn't stop a bare year orphaning onto its
  // own last line at 360–390px ("EU Christmas" / "2026").
  it("joins the trip name's last two words with a non-breaking space so the year can't orphan (LA-043)", async () => {
    shareFindUniqueMock.mockResolvedValue(share({ name: "EU Christmas 2026" }));
    await renderPage();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("EU Christmas\u00A02026");
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

describe("SharePage — stages (SHARE.md §1)", () => {
  it("before: hero → map → route → days → cta", async () => {
    const { container } = await renderStage("before");
    expect(sectionOrder(container)).toEqual(["hero", "map", "route", "days", "cta"]);
    expect(container.querySelector("[data-slot='share-hero']")!.getAttribute("data-stage")).toBe("before");
    // Day by day opens at the first stop.
    expect(container.querySelector("[data-stop-open]")!.getAttribute("data-stop-open")).toBe("s1");
  });

  it("during: hero → right-now → next → journal → map → route → days → cta", async () => {
    const { container } = await renderStage("during");
    expect(sectionOrder(container)).toEqual(["hero", "right-now", "next", "journal", "map", "route", "days", "cta"]);
    expect(screen.getByText("Right now")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In Munich" })).toBeInTheDocument();
    // Day by day opens at the current stop, the route list tags it.
    expect(container.querySelector("[data-stop-open]")!.getAttribute("data-stop-open")).toBe("s1");
    expect(screen.getByText("Here now")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='share-next']")).toHaveTextContent("London");
  });

  it("after: hero → tally → journal → route → map → days → cta, with Use this route", async () => {
    const { container } = await renderStage("after");
    expect(sectionOrder(container)).toEqual(["hero", "tally", "journal", "route", "map", "days", "cta"]);
    expect(screen.getByRole("link", { name: "Use this route" }).getAttribute("href")).toContain(
      encodeURIComponent("/trips/new?fromShare=tok"),
    );
    // All folded.
    expect(container.querySelector("[data-stop-open]")).toBeNull();
  });

  it("hides Day by day when all three itinerary dials are off", async () => {
    const { container } = await renderStage("before", {
      includeAccommodation: false,
      includeTransport: false,
      includeDailyPlans: false,
    });
    expect(sectionOrder(container)).not.toContain("days");
  });

  it("hides the journal section when includeJournal is off", async () => {
    const { container } = await renderStage("during", { includeJournal: false });
    expect(sectionOrder(container)).not.toContain("journal");
  });

  it("shows the leg to the next stop in Day by day only when includeTransport is on", async () => {
    await renderStage("before");
    expect(screen.getByText("Flight to London")).toBeInTheDocument();
  });

  it("the top bar's Plan your own trip goes to Become a tester with a hashed ref, never the token", async () => {
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
      const reveal = el.querySelector(":scope > [data-slot='share-reveal']") as HTMLElement | null;
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
    shareFindUniqueMock.mockResolvedValue({ ...share(), includeJournal: true });
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
    shareFindUniqueMock.mockResolvedValue({ ...share(), includeJournal: true });
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
    shareFindUniqueMock.mockResolvedValue({ ...share(), includeJournal: true });
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
    shareFindUniqueMock.mockResolvedValue({ ...share(), includeJournal: true });
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
    shareFindUniqueMock.mockResolvedValue({ ...share(), includeJournal: true });
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
    shareFindUniqueMock.mockResolvedValue({ ...share(), includeJournal: true });
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
    const { container } = await renderPage();
    expect(screen.getByRole("heading", { name: "No stops yet" })).toBeInTheDocument();
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
    expect(sectionOrder(container)).not.toContain("map");
  });
});
