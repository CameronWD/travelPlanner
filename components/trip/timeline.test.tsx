import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Timeline, dayHasEntries } from "./timeline";
import { HUE_CLASSES } from "@/lib/hues";
import { dayHasEntries as itineraryDayHasEntries } from "@/lib/itinerary";
import type { DayPlan } from "@/lib/itinerary";
import type { DayEntryEditor, DayEntryTarget } from "./day-entry-link";

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
// The day page's click-to-open island — stubbed so these tests see only
// whether Timeline wraps a row title, and for which kind of entity.
vi.mock("./day-entry-link", () => ({
  DayEntryLink: (props: { target: DayEntryTarget; children: React.ReactNode }) => (
    <button data-testid="entry-link" data-kind={props.target.kind}>
      {props.children}
    </button>
  ),
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

const emptyDay: DayPlan = {
  ...dayPlan,
  timedItems: [],
  untimedItems: [],
  transportEntries: [],
  accommodationEntries: [],
};

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

describe("Timeline — long-name wrapping (LA-021)", () => {
  it("check-in row text wraps instead of truncating, with no now-redundant title", () => {
    render(<Timeline day={dayPlanWithCheckin} variant="day" />);
    const span = screen.getByText(`Check-in — ${LONG_ACCOMMODATION_NAME}`);
    expect(span.className).not.toContain("truncate");
    expect(span.className).toContain("break-words");
    expect(span).not.toHaveAttribute("title");
  });

  it("check-out row text wraps instead of truncating, with no now-redundant title", () => {
    render(<Timeline day={dayPlanWithCheckout} variant="day" />);
    const span = screen.getByText(`Check-out — ${LONG_ACCOMMODATION_NAME}`);
    expect(span.className).not.toContain("truncate");
    expect(span.className).toContain("break-words");
    expect(span).not.toHaveAttribute("title");
  });

  it("transport departure from/to labels wrap instead of truncating for long place names", () => {
    render(<Timeline day={dayPlanWithTransport} variant="day" />);
    const depSpan = screen.getByText(LONG_DEP_PLACE);
    const arrSpan = screen.getByText(LONG_ARR_PLACE);
    for (const span of [depSpan, arrSpan]) {
      expect(span.className).not.toContain("truncate");
      expect(span.className).toContain("break-words");
      expect(span).not.toHaveAttribute("title");
    }
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

  // Playground reskin (Task 12a): the gutter is the kit Days time column
  // (Days.jsx: a 44px `--type-label` column), in tabular figures.
  // Was `w-9` (36px) + font-mono before the reskin.
  it("TimeGutter is the kit 44px time column (w-11) in tabular figures", () => {
    const { container } = render(
      <Timeline day={dayPlanWithLongTimedTitle} variant="day" />,
    );
    const gutterSpan = container.querySelector("span.w-11");
    expect(gutterSpan).not.toBeNull();
    expect(gutterSpan!.className).toMatch(/\bshrink-0\b/);
    expect(gutterSpan!.className).toMatch(/\btabular-nums\b/);
    expect(gutterSpan!.textContent).toBe("09:00");
  });

  it("timed item row body carries min-w-0 so the flex-1 card can shrink below its content's intrinsic width (Task 8 sweep fix)", () => {
    // Without min-w-0 on this flex-item card, the title/badge/Unschedule row
    // refuses to shrink below its content width, overflowing the 320px
    // viewport even though the title span itself truncates.
    const { container } = render(
      <Timeline day={dayPlanWithLongTimedTitle} variant="day" showUnschedule />,
    );
    // Reskin: the row body (title + actions) is the flex-1 track now, not a
    // left-bordered card — same min-w-0 guarantee.
    const body = container.querySelector("[data-timeline-row] .flex-1.min-w-0");
    expect(body).not.toBeNull();
    expect(body!.className).toMatch(/\bmin-w-0\b/);
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

// Playground reskin (Task 12a) replaced the Task 8 shapes these used to pin
// (a 4px category-hued left border card for timed rows, a dashed card for
// untimed rows) with the kit timeline row: time · 28px hue tile · title/sub,
// rows split by a 2px dotted rule (Days.jsx / onthego.jsx Today).
describe("Timeline — kit day rows (Task 12a)", () => {
  it("day timed rows carry the category as a 2px-outlined hue tile (identity via lib/hues.ts)", () => {
    const { container } = render(<Timeline day={dayPlanWithTimedFood} variant="day" />);
    const tile = container.querySelector("[data-timeline-row] [data-testid='timeline-tile']");
    expect(tile).not.toBeNull();
    const cls = tile!.className.split(/\s+/);
    // FOOD → sun hue
    expect(cls).toContain(HUE_CLASSES.sun.fill);
    expect(cls).toContain("text-on-accent");
    expect(cls).toContain("border-2");
    expect(cls).toContain("border-border");
    expect(tile!.getAttribute("aria-hidden")).toBe("true");
  });

  it("day untimed rows use the same kit row (dotted divider), not a dashed card", () => {
    const { container } = render(<Timeline day={dayPlanWithUntimedItem} variant="day" />);
    const row = container.querySelector("[data-timeline-row]");
    expect(row).not.toBeNull();
    expect(row!.className).toMatch(/\bborder-dotted\b/);
    expect(container.querySelector(".border-dashed")).toBeNull();
  });

  it("day variant has none of the pre-reskin shapes", () => {
    for (const day of [dayPlan, dayPlanWithCheckin, dayPlanWithCheckout, dayPlanWithTransport, dayPlanWithTimedFood]) {
      const { container, unmount } = render(<Timeline day={day} variant="day" showUnschedule />);
      expect(container.innerHTML).not.toMatch(/shadow-soft|rounded-2xl|border-l-4|bg-hue-(leaf|pink)\/25|bg-primary\/5|font-mono/);
      unmount();
    }
  });

  it("the category name stays readable as text next to the hue tile", () => {
    render(<Timeline day={dayPlanWithTimedFood} variant="day" />);
    expect(screen.getByText("Food & Drink")).toBeInTheDocument();
  });

  it("the directions link keeps its accessible name and gets a ≥44px coarse-pointer hit area", () => {
    render(
      <Timeline
        day={dayPlan}
        variant="day"
        itemDirections={{ [ITEM_ID]: { google: GOOGLE_URL, apple: null } }}
      />,
    );
    const link = screen.getByRole("link", { name: `Directions to ${ITEM_TITLE}` });
    expect(link.className).toMatch(/pointer-coarse:after:absolute/);
    expect(link.className).toMatch(/pointer-coarse:after:-inset-2\.5/);
  });

  it("an empty day renders the kit empty treatment in the day variant", () => {
    render(<Timeline day={emptyDay} variant="day" />);
    expect(screen.getByRole("heading", { name: "Nothing planned" })).toBeInTheDocument();
  });

  it("an empty day keeps the one-line fallback in the agenda variant (calendar, Task 12b)", () => {
    render(<Timeline day={emptyDay} variant="agenda" />);
    expect(screen.getByText("Nothing planned.")).toBeInTheDocument();
  });

  it("the agenda variant uses the same kit Days rows as the day variant (calendar, Task 12b)", () => {
    const { container } = render(<Timeline day={dayPlan} variant="agenda" />);
    const rows = container.querySelectorAll("[data-timeline-row]");
    // dayPlan: one timed + one untimed item.
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId("timeline-tile")).toHaveLength(2);
    expect(container.innerHTML).not.toMatch(/px-2 py-1|bg-muted-foreground\/30/);
  });
});

describe("dayHasEntries (shared with phase-travelling)", () => {
  it("is the same helper phase-travelling imports from lib/itinerary (one check, both call sites)", () => {
    expect(dayHasEntries).toBe(itineraryDayHasEntries);
  });
  it("is false for a day with nothing on it", () => {
    expect(dayHasEntries(emptyDay)).toBe(false);
  });
  it("is true for items, transport or accommodation alone", () => {
    expect(dayHasEntries(dayPlan)).toBe(true);
    expect(dayHasEntries(dayPlanWithTransport)).toBe(true);
    expect(dayHasEntries(dayPlanWithCheckin)).toBe(true);
    expect(dayHasEntries(dayPlanWithUntimedItem)).toBe(true);
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
// Task 7 (LA-021 / LA-012): titles and addresses wrap instead of truncating
// — this component is shared with the public share page.
// ---------------------------------------------------------------------------

const WRAP_ITEM_TITLE = "Vatican Museums & Sistine Chapel";
const WRAP_ITEM_ADDRESS = "Sparkassenstraße 10, 80331 München, Germany";

const dayPlanWithWrappingItem: DayPlan = {
  dateISO: "2025-07-01",
  stop: {
    id: "stop-1",
    name: "Rome",
    timezone: "Europe/Rome",
    arriveDate: "2025-07-01",
    departDate: "2025-07-03",
    sortOrder: 0,
  },
  timedItems: [
    {
      kind: "item",
      item: {
        id: "item-wrap-1",
        title: WRAP_ITEM_TITLE,
        category: "SIGHTSEEING",
        date: "2025-07-01",
        startTime: "09:00",
        address: WRAP_ITEM_ADDRESS,
      },
    },
  ],
  untimedItems: [],
  transportEntries: [],
  accommodationEntries: [],
};

describe("Timeline — item titles and addresses wrap (LA-021 / LA-012)", () => {
  it("item titles and addresses wrap instead of truncating", () => {
    render(<Timeline day={dayPlanWithWrappingItem} variant="day" />);
    const title = screen.getByText(WRAP_ITEM_TITLE);
    expect(title.className).not.toContain("truncate");
    expect(title.className).toContain("break-words");
    expect(title).not.toHaveAttribute("title");

    const address = screen.getByText(WRAP_ITEM_ADDRESS);
    expect(address.className).not.toContain("truncate");
    expect(address.className).toContain("break-words");
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

describe("Timeline — day-page entries open their details (editor)", () => {
  it("wraps entry titles in DayEntryLink when an editor is supplied, and not otherwise", () => {
    const editor: DayEntryEditor = {
      tripId: "t1", stops: [], items: { [ITEM_ID]: { id: ITEM_ID, title: ITEM_TITLE, category: "ACTIVITY" } },
      transports: {}, accommodations: {}, costsByOwner: {},
    };
    const { unmount } = render(<Timeline day={dayPlan} variant="day" editor={editor} />);
    const links = screen.getAllByTestId("entry-link");
    expect(links.map((l) => l.getAttribute("data-kind"))).toContain("item");
    expect(screen.getByRole("button", { name: ITEM_TITLE })).toBeInTheDocument();
    // The untimed item is not in the editor's map, so it stays a plain title.
    expect(screen.queryByRole("button", { name: UNTIMED_ITEM_TITLE })).toBeNull();
    unmount();
    render(<Timeline day={dayPlan} variant="day" />);
    expect(screen.queryByTestId("entry-link")).toBeNull();
  });

  it("wraps transport and accommodation titles when they are in the editor", () => {
    const editor: DayEntryEditor = {
      tripId: "t1",
      stops: [],
      items: {},
      transports: { "tr-1": { id: "tr-1", mode: "TRAIN", sortOrder: 0 } },
      accommodations: {
        "acc-2": {
          accommodation: { id: "acc-2", stopId: "stop-2", name: "Osaka Hotel", checkIn: "2025-07-05", checkOut: "2025-07-08" },
          stopDateRange: { arriveDate: "2025-07-05", departDate: "2025-07-08" },
        },
      },
      costsByOwner: {},
    };
    render(<Timeline day={dayWithCheckinAndTransport} variant="day" editor={editor} />);
    const kinds = screen.getAllByTestId("entry-link").map((l) => l.getAttribute("data-kind"));
    expect(kinds).toEqual(expect.arrayContaining(["transport", "accommodation"]));
    expect(screen.getByRole("button", { name: /Check-in — Osaka Hotel/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Arrives — Train/ })).toBeInTheDocument();
  });
});

describe("Timeline — Place category (map-pin icon)", () => {
  const PLACE_ITEM_TITLE = "Kyoto";

  const dayPlanWithPlace: DayPlan = {
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
          id: "item-place-1",
          title: PLACE_ITEM_TITLE,
          category: "PLACE",
          date: "2025-07-01",
          startTime: "09:00",
          endTime: "10:00",
        },
      },
    ],
    untimedItems: [],
    transportEntries: [],
    accommodationEntries: [],
  };

  it("renders a timed item's title for the Place category without throwing", () => {
    render(<Timeline day={dayPlanWithPlace} variant="day" />);
    expect(screen.getByText(PLACE_ITEM_TITLE)).toBeInTheDocument();
  });
});

describe("Timeline — Anytime bucket grouped by Category", () => {
  const dayPlanWithTwoUntimedCategories: DayPlan = {
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
          id: "item-untimed-food-2",
          title: "Browse Tsukiji Market",
          category: "FOOD",
          date: "2025-07-01",
        },
      },
      {
        kind: "item",
        item: {
          id: "item-untimed-sightseeing-1",
          title: "Senso-ji Temple",
          category: "SIGHTSEEING",
          date: "2025-07-01",
        },
      },
    ],
    transportEntries: [],
    accommodationEntries: [],
  };

  it("renders two group labels under Anytime, in CATEGORIES order", () => {
    render(<Timeline day={dayPlanWithTwoUntimedCategories} variant="day" />);
    const headings = screen.getAllByRole("heading", { level: 4 });
    expect(headings.map((h) => h.textContent)).toEqual(["Sightseeing", "Food & Drink"]);
  });
});

describe("Timeline — Item hidden from shares (Task 9)", () => {
  const HIDDEN_ITEM_ID = "item-hidden-1";
  const HIDDEN_ITEM_TITLE = "Surprise anniversary dinner";
  const VISIBLE_ITEM_ID = "item-visible-1";
  const VISIBLE_ITEM_TITLE = "Morning walk";

  const dayPlanWithHiddenItem: DayPlan = {
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
          id: HIDDEN_ITEM_ID,
          title: HIDDEN_ITEM_TITLE,
          category: "FOOD",
          date: "2025-07-01",
          startTime: "19:00",
          hiddenFromShares: true,
        },
      },
      {
        kind: "item",
        item: {
          id: VISIBLE_ITEM_ID,
          title: VISIBLE_ITEM_TITLE,
          category: "ACTIVITY",
          date: "2025-07-01",
          startTime: "08:00",
        },
      },
    ],
    untimedItems: [],
    transportEntries: [],
    accommodationEntries: [],
  };

  it("marks an Item hidden from shares with a labelled EyeOff icon", () => {
    render(<Timeline day={dayPlanWithHiddenItem} variant="day" />);
    const hiddenRow = screen.getByText(HIDDEN_ITEM_TITLE).closest("[data-timeline-row]") as HTMLElement;
    expect(within(hiddenRow).getByRole("img", { name: "Hidden from shares" })).toBeInTheDocument();
  });

  it("does not mark an Item that is not hidden from shares", () => {
    render(<Timeline day={dayPlanWithHiddenItem} variant="day" />);
    const visibleRow = screen.getByText(VISIBLE_ITEM_TITLE).closest("[data-timeline-row]") as HTMLElement;
    expect(within(visibleRow).queryByRole("img", { name: "Hidden from shares" })).toBeNull();
  });
});
