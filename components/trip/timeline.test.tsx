import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timeline } from "./timeline";
import type { DayPlan } from "@/lib/itinerary";

// Timeline renders UnscheduleItemButton (a client island) on day-variant item
// rows when showUnschedule is set. That component pulls in the server-actions
// module and next/navigation's useRouter — mock both so this stays a pure
// component test, same pattern as unschedule-item-button.test.tsx.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/server/actions/items", () => ({
  unscheduleItem: vi.fn(),
  scheduleItem: vi.fn(),
  rescheduleItem: vi.fn(),
}));

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

  it("timed item card carries min-w-0 so the flex-1 card can shrink below its content's intrinsic width (Task 8 sweep fix)", () => {
    // Without min-w-0 on this flex-item card, the title/badge/Unschedule row
    // refuses to shrink below its content width, overflowing the 320px
    // viewport even though the title span itself truncates.
    const { container } = render(
      <Timeline day={dayPlanWithLongTimedTitle} variant="day" showUnschedule />,
    );
    const card = container.querySelector(".border-l-4.bg-card");
    expect(card).not.toBeNull();
    expect(card!.className).toMatch(/\bmin-w-0\b/);
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
    expect(container.querySelector(".border-l-4.border-l-hue-sun")).toBeTruthy();
  });

  it("day untimed rows use a dashed border", () => {
    const { container } = render(<Timeline day={dayPlanWithUntimedItem} variant="day" />);
    expect(container.querySelector(".border-dashed")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Task-8 regression: address must appear on untimed day rows
// ---------------------------------------------------------------------------

const UNTIMED_ITEM_ADDRESS = "2-3-1 Asakusa, Taito City, Tokyo";

const dayPlanWithUntimedItemAddress: DayPlan = {
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
        id: "item-untimed-addr-1",
        title: "Senso-ji Temple",
        category: "SIGHTSEEING",
        date: "2025-07-01",
        address: UNTIMED_ITEM_ADDRESS,
      },
    },
  ],
  transportEntries: [],
  accommodationEntries: [],
};

describe("Timeline — untimed day row address regression (Task 8 fix)", () => {
  it("renders the address for an untimed day item that has an address", () => {
    render(<Timeline day={dayPlanWithUntimedItemAddress} variant="day" />);
    expect(screen.getByText(UNTIMED_ITEM_ADDRESS)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 7: reachable Unschedule control (P1-5 UI half)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Task 9: accommodation-times day ordering via orderDayEntries
// ---------------------------------------------------------------------------

const TIMED_ITEM_TITLE = "Museum Visit";

const dayWithCheckoutAndItems: DayPlan = {
  dateISO: "2025-07-05",
  stop: {
    id: "stop-1",
    name: "Tokyo",
    timezone: "Asia/Tokyo",
    arriveDate: "2025-07-01",
    departDate: "2025-07-05",
    sortOrder: 0,
  },
  timedItems: [
    {
      kind: "item",
      item: {
        id: "item-museum",
        title: TIMED_ITEM_TITLE,
        category: "SIGHTSEEING",
        date: "2025-07-05",
        startTime: "11:00",
      },
    },
  ],
  untimedItems: [],
  transportEntries: [],
  accommodationEntries: [
    {
      kind: "accommodation-checkout",
      accommodation: {
        id: "acc-1",
        stopId: "stop-1",
        name: "Tokyo Hotel",
        checkIn: "2025-07-01",
        checkOut: "2025-07-05",
        checkOutTime: null,
      },
    },
  ],
};

const dayWithTimedCheckout: DayPlan = {
  dateISO: "2025-07-05",
  stop: {
    id: "stop-1",
    name: "Tokyo",
    timezone: "Asia/Tokyo",
    arriveDate: "2025-07-01",
    departDate: "2025-07-05",
    sortOrder: 0,
  },
  timedItems: [
    {
      kind: "item",
      item: {
        id: "item-bakery",
        title: "Bakery",
        category: "FOOD",
        date: "2025-07-05",
        startTime: "08:00",
      },
    },
  ],
  untimedItems: [],
  transportEntries: [],
  accommodationEntries: [
    {
      kind: "accommodation-checkout",
      accommodation: {
        id: "acc-1",
        stopId: "stop-1",
        name: "Tokyo Hotel",
        checkIn: "2025-07-01",
        checkOut: "2025-07-05",
        checkOutTime: "10:00",
      },
    },
  ],
};

const dayWithCheckinAndTransport: DayPlan = {
  dateISO: "2025-07-05",
  stop: {
    id: "stop-2",
    name: "Osaka",
    timezone: "Asia/Tokyo",
    arriveDate: "2025-07-05",
    departDate: "2025-07-08",
    sortOrder: 1,
  },
  timedItems: [],
  untimedItems: [],
  transportEntries: [
    {
      kind: "transport-arrival",
      transport: {
        id: "tr-1",
        mode: "TRAIN",
        depPlace: "Tokyo",
        arrPlace: "Osaka",
      },
      arrTimeLabel: "09:30",
    },
  ],
  accommodationEntries: [
    {
      kind: "accommodation-checkin",
      accommodation: {
        id: "acc-2",
        stopId: "stop-2",
        name: "Osaka Hotel",
        checkIn: "2025-07-05",
        checkOut: "2025-07-08",
        checkInTime: null,
      },
    },
  ],
};

describe("Timeline — accommodation-times day ordering (Task 9)", () => {
  it("renders an untimed check-out before everything else on the day", () => {
    const { container } = render(<Timeline day={dayWithCheckoutAndItems} variant="day" />);
    const text = container.textContent ?? "";
    expect(text.indexOf("Check-out")).toBeLessThan(text.indexOf(TIMED_ITEM_TITLE));
  });

  it("slots a timed check-out at its time and shows the time in the gutter", () => {
    render(<Timeline day={dayWithTimedCheckout} variant="day" />);
    expect(screen.getByText("10:00")).toBeInTheDocument();
    // 08:00 bakery renders above the 10:00 check-out
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Bakery")).toBeLessThan(text.indexOf("Check-out"));
  });

  it("renders an untimed check-in after transport entries", () => {
    const { container } = render(<Timeline day={dayWithCheckinAndTransport} variant="day" />);
    const text = container.textContent ?? "";
    expect(text.indexOf("Arrives")).toBeLessThan(text.indexOf("Check-in"));
  });
});

describe("Timeline — Unschedule control (Task 7)", () => {
  it("renders the Unschedule button for a timed item when showUnschedule is true and variant is day", () => {
    render(<Timeline day={dayPlan} variant="day" showUnschedule />);
    // dayPlan has both a timed and an untimed item — both should get the control.
    expect(screen.getAllByRole("button", { name: /unschedule/i })).toHaveLength(2);
  });

  it("does not render the Unschedule button when showUnschedule is absent", () => {
    render(<Timeline day={dayPlan} variant="day" />);
    expect(screen.queryByRole("button", { name: /unschedule/i })).not.toBeInTheDocument();
  });

  it("does not render the Unschedule button in the agenda variant even when showUnschedule is true", () => {
    render(<Timeline day={dayPlan} variant="agenda" showUnschedule />);
    expect(screen.queryByRole("button", { name: /unschedule/i })).not.toBeInTheDocument();
  });

  it("renders the Unschedule button for an untimed item when showUnschedule is true and variant is day", () => {
    render(<Timeline day={dayPlanWithUntimedItem} variant="day" showUnschedule />);
    expect(screen.getByRole("button", { name: /unschedule/i })).toBeInTheDocument();
  });
});
