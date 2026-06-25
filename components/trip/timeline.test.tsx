import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timeline } from "./timeline";
import type { DayPlan } from "@/lib/itinerary";

// ---------------------------------------------------------------------------
// Minimal DayPlan fixture with one timed and one untimed item
// ---------------------------------------------------------------------------

const ITEM_ID = "item-directions-1";
const ITEM_TITLE = "Tokyo Tower";

const UNTIMED_ITEM_ID = "item-untimed-1";
const UNTIMED_ITEM_TITLE = "Senso-ji Temple";

const dayPlan: DayPlan = {
  dateISO: "2025-07-01",
  stop: {
    id: "stop-1",
    name: "Tokyo",
    timezone: "Asia/Tokyo",
    arriveDate: "2025-07-01",
    departDate: "2025-07-03",
    sortOrder: 0,
  },
  timedItems: [
    {
      kind: "item",
      item: {
        id: ITEM_ID,
        title: ITEM_TITLE,
        category: "ACTIVITY",
        date: "2025-07-01",
        startTime: "10:00",
        endTime: "12:00",
      },
    },
  ],
  untimedItems: [
    {
      kind: "item",
      item: {
        id: UNTIMED_ITEM_ID,
        title: UNTIMED_ITEM_TITLE,
        category: "SIGHTSEEING",
        date: "2025-07-01",
      },
    },
  ],
  transportEntries: [],
  accommodationEntries: [],
};

const GOOGLE_URL = "https://maps.google.com/?q=Tokyo+Tower";

// ---------------------------------------------------------------------------
// Fixtures for truncation tests
// ---------------------------------------------------------------------------

const LONG_ACCOMMODATION_NAME =
  "The Grand Luxurious Metropolitan Hotel And Spa At The Crossroads of Everything";

const dayPlanWithCheckin: DayPlan = {
  dateISO: "2025-07-01",
  stop: {
    id: "stop-1",
    name: "Tokyo",
    timezone: "Asia/Tokyo",
    arriveDate: "2025-07-01",
    departDate: "2025-07-03",
    sortOrder: 0,
  },
  timedItems: [],
  untimedItems: [],
  transportEntries: [],
  accommodationEntries: [
    {
      kind: "accommodation-checkin",
      accommodation: {
        id: "acc-1",
        stopId: "stop-1",
        name: LONG_ACCOMMODATION_NAME,
        checkIn: "2025-07-01",
        checkOut: "2025-07-03",
      },
    },
  ],
};

const dayPlanWithCheckout: DayPlan = {
  ...dayPlanWithCheckin,
  accommodationEntries: [
    {
      kind: "accommodation-checkout",
      accommodation: {
        id: "acc-1",
        stopId: "stop-1",
        name: LONG_ACCOMMODATION_NAME,
        checkIn: "2025-07-01",
        checkOut: "2025-07-03",
      },
    },
  ],
};

const LONG_DEP_PLACE = "Sydney Kingsford Smith International Airport Terminal 1";
const LONG_ARR_PLACE = "Singapore Changi International Airport Terminal 3";

const dayPlanWithTransport: DayPlan = {
  dateISO: "2025-07-01",
  stop: {
    id: "stop-1",
    name: "Tokyo",
    timezone: "Asia/Tokyo",
    arriveDate: "2025-07-01",
    departDate: "2025-07-03",
    sortOrder: 0,
  },
  timedItems: [],
  untimedItems: [],
  transportEntries: [
    {
      kind: "transport-departure",
      transport: {
        id: "tr-1",
        mode: "FLIGHT",
        depPlace: LONG_DEP_PLACE,
        arrPlace: LONG_ARR_PLACE,
      },
      arrivesSameDay: false,
    },
  ],
  accommodationEntries: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Timeline — per-hop directions link", () => {
  it("renders a directions link for a timed item when itemDirections is provided", () => {
    render(
      <Timeline
        day={dayPlan}
        variant="day"
        itemDirections={{ [ITEM_ID]: { google: GOOGLE_URL, apple: null } }}
      />,
    );

    const link = screen.getByRole("link", {
      name: `Directions to ${ITEM_TITLE}`,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", GOOGLE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render a directions link when itemDirections is absent", () => {
    render(<Timeline day={dayPlan} variant="day" />);

    expect(
      screen.queryByRole("link", { name: `Directions to ${ITEM_TITLE}` }),
    ).not.toBeInTheDocument();
  });

  it("does not render a directions link when itemDirections is an empty object", () => {
    render(<Timeline day={dayPlan} variant="day" itemDirections={{}} />);

    expect(
      screen.queryByRole("link", { name: `Directions to ${ITEM_TITLE}` }),
    ).not.toBeInTheDocument();
  });

  it("does not render a directions link when both google and apple urls are null", () => {
    render(
      <Timeline
        day={dayPlan}
        variant="day"
        itemDirections={{ [ITEM_ID]: { google: null, apple: null } }}
      />,
    );

    expect(
      screen.queryByRole("link", { name: `Directions to ${ITEM_TITLE}` }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the apple url when google is null", () => {
    const appleUrl = "https://maps.apple.com/?q=Tokyo+Tower";
    render(
      <Timeline
        day={dayPlan}
        variant="day"
        itemDirections={{ [ITEM_ID]: { google: null, apple: appleUrl } }}
      />,
    );

    const link = screen.getByRole("link", {
      name: `Directions to ${ITEM_TITLE}`,
    });
    expect(link).toHaveAttribute("href", appleUrl);
  });

  it("renders a directions link for an untimed item when itemDirections is provided", () => {
    render(
      <Timeline
        day={dayPlan}
        variant="day"
        itemDirections={{
          [UNTIMED_ITEM_ID]: { google: "https://maps.google.com/?q=Sensoji", apple: null },
        }}
      />,
    );

    const link = screen.getByRole("link", {
      name: `Directions to ${UNTIMED_ITEM_TITLE}`,
    });
    expect(link).toBeInTheDocument();
  });

  it("renders the item title without a directions link when its id is not in itemDirections", () => {
    render(
      <Timeline
        day={dayPlan}
        variant="day"
        itemDirections={{ "some-other-id": { google: GOOGLE_URL, apple: null } }}
      />,
    );

    // Item title still renders
    expect(screen.getByText(ITEM_TITLE)).toBeInTheDocument();
    // But no directions link for it
    expect(
      screen.queryByRole("link", { name: `Directions to ${ITEM_TITLE}` }),
    ).not.toBeInTheDocument();
  });
});

describe("Timeline — long-name truncation", () => {
  it("check-in row text element has truncate class for a long accommodation name", () => {
    const { container } = render(<Timeline day={dayPlanWithCheckin} variant="day" />);
    // The span containing "Check-in — <name>" should carry truncate
    const span = container.querySelector("span.truncate");
    expect(span).not.toBeNull();
    expect(span!.className).toMatch(/\btruncate\b/);
    expect(span!.getAttribute("title")).toBe(`Check-in — ${LONG_ACCOMMODATION_NAME}`);
  });

  it("check-out row text element has truncate class for a long accommodation name", () => {
    const { container } = render(<Timeline day={dayPlanWithCheckout} variant="day" />);
    const span = container.querySelector("span.truncate");
    expect(span).not.toBeNull();
    expect(span!.className).toMatch(/\btruncate\b/);
    expect(span!.getAttribute("title")).toBe(`Check-out — ${LONG_ACCOMMODATION_NAME}`);
  });

  it("transport departure from/to labels have truncate class for long place names", () => {
    const { container } = render(<Timeline day={dayPlanWithTransport} variant="day" />);
    const truncatedSpans = Array.from(container.querySelectorAll("span.truncate"));
    const depSpan = truncatedSpans.find((s) => s.getAttribute("title") === LONG_DEP_PLACE);
    const arrSpan = truncatedSpans.find((s) => s.getAttribute("title") === LONG_ARR_PLACE);
    expect(depSpan).not.toBeUndefined();
    expect(arrSpan).not.toBeUndefined();
  });
});
