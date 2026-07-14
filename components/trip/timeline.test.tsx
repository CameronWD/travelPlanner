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

// ---------------------------------------------------------------------------
// Task-3 structural assertions: mobile-hardening (gutter width + title truncation)
// ---------------------------------------------------------------------------

const LONG_ITEM_TITLE =
  "A Very Long Timed Item Title That Would Overflow On A 320px Mobile Screen Without Truncation";

const dayPlanWithLongTimedTitle: DayPlan = {
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
        id: "item-long-1",
        title: LONG_ITEM_TITLE,
        category: "ACTIVITY",
        date: "2025-07-01",
        startTime: "09:00",
        endTime: "11:00",
      },
    },
  ],
  untimedItems: [],
  transportEntries: [],
  accommodationEntries: [],
};

describe("Timeline — mobile-hardening structural assertions (Task 3)", () => {
  it("timed item title span carries truncate class for overflow prevention", () => {
    const { container } = render(
      <Timeline day={dayPlanWithLongTimedTitle} variant="day" />,
    );
    const titleSpan = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === LONG_ITEM_TITLE,
    );
    expect(titleSpan).not.toBeUndefined();
    const cls = titleSpan!.className;
    expect(cls.match(/\btruncate\b/) || cls.match(/\bbreak-words\b/)).toBeTruthy();
  });

  it("TimeGutter span carries w-9 class for mobile-width shrinkage", () => {
    const { container } = render(
      <Timeline day={dayPlanWithLongTimedTitle} variant="day" />,
    );
    // TimeGutter renders as a shrink-0 span with font-mono and w-9
    const gutterSpan = container.querySelector("span.w-9");
    expect(gutterSpan).not.toBeNull();
    expect(gutterSpan!.className).toMatch(/\bw-9\b/);
  });
});

// ---------------------------------------------------------------------------
// Task-8 class-string regression tests: Bold-Modular day rows
// ---------------------------------------------------------------------------

const dayPlanWithTimedFood: DayPlan = {
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
        id: "item-food-1",
        title: "Sushi Dinner",
        category: "FOOD",
        date: "2025-07-01",
        startTime: "19:00",
        endTime: "21:00",
      },
    },
  ],
  untimedItems: [],
  transportEntries: [],
  accommodationEntries: [],
};

const dayPlanWithUntimedItem: DayPlan = {
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
  untimedItems: [
    {
      kind: "item",
      item: {
        id: "item-untimed-food-1",
        title: "Browse Tsukiji Market",
        category: "FOOD",
        date: "2025-07-01",
      },
    },
  ],
  transportEntries: [],
  accommodationEntries: [],
};

describe("Timeline — Task 8 Bold-Modular day row class-string regressions", () => {
  it("day timed rows get a category-hued left border card", () => {
    const { container } = render(<Timeline day={dayPlanWithTimedFood} variant="day" />);
    expect(container.querySelector(".border-l-4.border-l-amber-500")).toBeTruthy();
  });

  it("day untimed rows use a dashed border", () => {
    const { container } = render(<Timeline day={dayPlanWithUntimedItem} variant="day" />);
    expect(container.querySelector(".border-dashed")).toBeTruthy();
  });
});
