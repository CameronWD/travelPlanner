import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { stopBandBorderClass, stopPillClass } from "@/lib/stop-colours";
import { PACKED_DAY_THRESHOLD } from "@/lib/flags";
import { MonthGrid } from "./month-grid";
import type { DayPlan } from "@/lib/itinerary";

function dayPlan(dateISO: string, itemCount: number): DayPlan {
  const stop = {
    id: "s1", name: "Paris", country: "France", timezone: "Europe/Paris",
    arriveDate: "2026-07-14", departDate: "2026-07-15", sortOrder: 0,
  };
  const timedItems = Array.from({ length: itemCount }, (_, i) => ({
    kind: "item" as const,
    item: { id: `i${i}`, title: `Item ${i}`, category: "sightseeing" },
  }));
  return { dateISO, stop, timedItems, untimedItems: [], transportEntries: [], accommodationEntries: [] };
}

describe("MonthGrid — location hero", () => {
  it("shows the stop name on every in-window day of the stop", () => {
    render(
      <MonthGrid
        tripId="t1"
        monthAnchorISO="2026-07-01"
        days={[dayPlan("2026-07-14", 2), dayPlan("2026-07-15", 0)]}
        tripStart="2026-07-14"
        tripEnd="2026-07-15"
      />,
    );
    expect(screen.getAllByText("Paris").length).toBeGreaterThanOrEqual(2);
  });

  it("collapses activities to a count instead of listing item titles", () => {
    render(
      <MonthGrid
        tripId="t1"
        monthAnchorISO="2026-07-01"
        days={[dayPlan("2026-07-14", 2)]}
        tripStart="2026-07-14"
        tripEnd="2026-07-14"
      />,
    );
    expect(screen.getByText(/2 things/)).toBeInTheDocument();
    expect(screen.queryByText("Item 0")).not.toBeInTheDocument();
  });

  it("shows no location on a gap day", () => {
    render(
      <MonthGrid tripId="t1" monthAnchorISO="2026-07-01" days={[]} tripStart="2026-07-14" tripEnd="2026-07-14" />,
    );
    expect(screen.queryByText("Paris")).not.toBeInTheDocument();
  });
});

describe("MonthGrid — mobile containment (Step 1; kit tiles, Task 12b)", () => {
  // Pre-reskin the grid was a 560px-min table inside a horizontal scroller.
  // The kit (Days.jsx) fits all seven 50px tiles into a phone width instead,
  // so the containment guarantee is now "tiles may shrink", not "scroll".
  it("day grid fits the viewport: no min-width floor, tiles may shrink (min-w-0)", () => {
    const { container } = render(
      <MonthGrid
        tripId="t1"
        monthAnchorISO="2026-07-01"
        days={[]}
        tripStart="2026-07-01"
        tripEnd="2026-07-31"
      />,
    );
    // The day-cells grid is the second grid-cols-7 element (after the weekday header)
    const grids = container.querySelectorAll(".grid-cols-7");
    const dayGrid = grids[1];
    expect(dayGrid).toBeTruthy();
    expect(dayGrid.className).not.toMatch(/min-w-\[/);
    for (const cell of Array.from(dayGrid.children)) {
      expect(cell.classList.contains("min-w-0")).toBe(true);
    }
  });

  it("has no horizontal scroll wrapper", () => {
    const { container } = render(
      <MonthGrid
        tripId="t1"
        monthAnchorISO="2026-07-01"
        days={[]}
        tripStart="2026-07-01"
        tripEnd="2026-07-31"
      />,
    );
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
  });
});

describe("MonthGrid — kit Days tiles (Task 12b)", () => {
  const JULY = { tripId: "t1", monthAnchorISO: "2026-07-01", tripStart: "2026-07-14", tripEnd: "2026-07-15" };

  it("marks today's tile with aria-current=\"date\" and lifts it (kit selected tile)", () => {
    render(<MonthGrid {...JULY} days={[dayPlan("2026-07-14", 0), dayPlan("2026-07-15", 0)]} todayISO="2026-07-15" />);
    const today = screen.getByRole("link", { name: /Wed 15 Jul 2026/ });
    expect(today).toHaveAttribute("aria-current", "date");
    expect(today.className).toMatch(/shadow-hard-/);
    expect(screen.getByRole("link", { name: /Tue 14 Jul 2026/ })).not.toHaveAttribute("aria-current");
  });

  it("in-window days are links to the Day page named with the full date", () => {
    render(<MonthGrid {...JULY} days={[dayPlan("2026-07-14", 2)]} />);
    const link = screen.getByRole("link", { name: /Tue 14 Jul 2026/ });
    expect(link).toHaveAttribute("href", "/trips/t1/day/2026-07-14");
    expect(link).toHaveAccessibleName(/Paris/);
    expect(link).toHaveAccessibleName(/2 things/);
  });

  it("names the stop's country in the tile label, and omits it when absent", () => {
    const noCountry = { ...dayPlan("2026-07-15", 0), stop: { ...dayPlan("2026-07-15", 0).stop!, country: null } };
    render(<MonthGrid {...JULY} days={[dayPlan("2026-07-14", 0), noCountry as DayPlan]} />);
    expect(screen.getByRole("link", { name: /Tue 14 Jul 2026/ })).toHaveAccessibleName(/Paris, France/);
    const bare = screen.getByRole("link", { name: /Wed 15 Jul 2026/ });
    expect(bare).toHaveAccessibleName(/Paris/);
    expect(bare).not.toHaveAccessibleName(/France|null|undefined|, ,/);
  });

  it("the stop band and tile tint come from lib/stop-colours.ts", () => {
    render(<MonthGrid {...JULY} days={[dayPlan("2026-07-14", 0)]} />);
    const link = screen.getByRole("link", { name: /Tue 14 Jul 2026/ });
    // sortOrder 0 → first stop hue.
    for (const cls of stopBandBorderClass(0).split(" ")) expect(link.classList.contains(cls)).toBe(true);
    for (const cls of stopPillClass(0).split(" ")) expect(link.classList.contains(cls)).toBe(true);
  });

  it("tiles are the kit shape: 2px outline, rounded, no pre-reskin table rules", () => {
    const { container } = render(<MonthGrid {...JULY} days={[dayPlan("2026-07-14", 0)]} />);
    const link = screen.getByRole("link", { name: /Tue 14 Jul 2026/ });
    expect(link.className).toMatch(/\bborder-2\b/);
    expect(link.className).toMatch(/\brounded-(sm|md)\b/);
    expect(container.innerHTML).not.toMatch(/\bborder-r\b|\bborder-b\b|rounded-xl border border-border|bg-muted\/(20|40)/);
  });

  it("days outside the month are hidden placeholders, not dim table cells", () => {
    const { container } = render(<MonthGrid {...JULY} days={[]} />);
    // July 2026 starts on a Wednesday → Mon 29 + Tue 30 June pad the first week.
    const padding = container.querySelectorAll("[data-month-pad]");
    expect(padding.length).toBeGreaterThan(0);
    for (const cell of Array.from(padding)) {
      expect(cell).toHaveAttribute("aria-hidden", "true");
      expect(cell.className).toMatch(/\binvisible\b/);
    }
  });

  it("the things count is a kit chip; a packed day turns it coral", () => {
    render(<MonthGrid {...JULY} days={[dayPlan("2026-07-14", PACKED_DAY_THRESHOLD + 1), dayPlan("2026-07-15", 1)]} />);
    // The badge shows a bare number below `xl` and "N things" from `xl` (LA-022/053) —
    // both live in the DOM at once, so the visible "N things" text (unique — the
    // chip's own concatenated text differs from either child) anchors the query,
    // then `.parentElement` is the chip itself (no aria-label to key off: the
    // enclosing Link already names the day with "N things", so one on the chip
    // would be inert duplicate text).
    const packed = screen.getByText(`${PACKED_DAY_THRESHOLD + 1} things`).parentElement!;
    expect(packed.className).toMatch(/\bbg-coral\b/);
    expect(packed.className).toMatch(/\bborder-2\b/);
    const calm = screen.getByText("1 thing").parentElement!;
    expect(calm.className).not.toMatch(/\bbg-coral\b/);
  });

  it("shows a stop legend under the grid (kit legend chips), one chip per stop", () => {
    const berlin = { ...dayPlan("2026-07-15", 0), stop: { ...dayPlan("2026-07-15", 0).stop!, id: "s2", name: "Berlin", sortOrder: 1 } };
    render(<MonthGrid {...JULY} days={[dayPlan("2026-07-14", 0), berlin]} />);
    const legend = screen.getByRole("list", { name: "Stops" });
    const chips = within(legend).getAllByRole("listitem");
    expect(chips.map((c) => c.textContent)).toEqual(["Paris", "Berlin"]);
    for (const cls of stopPillClass(1).split(" ")) expect(chips[1].classList.contains(cls)).toBe(true);
  });

  it("names the check-in glyph for screen readers and appends it to the tile label (Task 15 H1)", () => {
    const day: DayPlan = {
      ...dayPlan("2026-07-14", 0),
      accommodationEntries: [
        {
          kind: "accommodation-checkin",
          accommodation: { id: "a1", stopId: "s1", name: "Hotel Paris", checkIn: "2026-07-14", checkOut: "2026-07-16" },
        },
      ],
    };
    render(<MonthGrid {...JULY} days={[day]} />);
    expect(screen.getByRole("img", { name: "Check-in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tue 14 Jul 2026/ })).toHaveAccessibleName(/check-in/);
  });

  it("names the check-out glyph for screen readers and appends it to the tile label (Task 15 H1)", () => {
    const day: DayPlan = {
      ...dayPlan("2026-07-15", 0),
      accommodationEntries: [
        {
          kind: "accommodation-checkout",
          accommodation: { id: "a1", stopId: "s1", name: "Hotel Paris", checkIn: "2026-07-10", checkOut: "2026-07-15" },
        },
      ],
    };
    render(<MonthGrid {...JULY} days={[day]} />);
    expect(screen.getByRole("img", { name: "Check-out" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wed 15 Jul 2026/ })).toHaveAccessibleName(/check-out/);
  });

  it("appends the transport mode and direction to the tile label (Task 15 H1)", () => {
    const day: DayPlan = {
      ...dayPlan("2026-07-14", 0),
      transportEntries: [
        { kind: "transport-departure", transport: { id: "tr1", mode: "FLIGHT" }, arrivesSameDay: true },
      ],
    };
    render(<MonthGrid {...JULY} days={[day]} />);
    expect(screen.getByRole("link", { name: /Tue 14 Jul 2026/ })).toHaveAccessibleName(/flight departs/);
  });

  it("appends an arriving transport's mode and direction to the tile label (Task 15 H1)", () => {
    const day: DayPlan = {
      ...dayPlan("2026-07-15", 0),
      transportEntries: [{ kind: "transport-arrival", transport: { id: "tr2", mode: "TRAIN" } }],
    };
    render(<MonthGrid {...JULY} days={[day]} />);
    expect(screen.getByRole("link", { name: /Wed 15 Jul 2026/ })).toHaveAccessibleName(/train arrives/);
  });

  it("shows a Markers legend with Check-in, Check-out and each transport mode present in the month (Task 15 H1)", () => {
    const checkinDay: DayPlan = {
      ...dayPlan("2026-07-14", 0),
      accommodationEntries: [
        {
          kind: "accommodation-checkin",
          accommodation: { id: "a1", stopId: "s1", name: "Hotel Paris", checkIn: "2026-07-14", checkOut: "2026-07-16" },
        },
      ],
    };
    const transportDay: DayPlan = {
      ...dayPlan("2026-07-15", 0),
      transportEntries: [{ kind: "transport-arrival", transport: { id: "tr2", mode: "TRAIN" } }],
    };
    render(<MonthGrid {...JULY} days={[checkinDay, transportDay]} />);
    const legend = screen.getByRole("list", { name: "Markers" });
    expect(within(legend).getByText("Check-in")).toBeInTheDocument();
    expect(within(legend).getByText("Check-out")).toBeInTheDocument();
    expect(within(legend).getByText("Train")).toBeInTheDocument();
    expect(within(legend).queryByText("Flight")).not.toBeInTheDocument();
  });

  it("tablet day cells drop the country line and keep the badge inside the cell (LA-022 / LA-053)", () => {
    render(<MonthGrid {...JULY} days={[dayPlan("2026-07-14", 2)]} />);
    const country = screen.getByText("France");
    expect(country.className).toContain("lg:block");
    expect(country.className).not.toContain("sm:block");
    const badge = screen.getByText("2 things").parentElement!;
    expect(badge.className).toContain("max-w-full");
  });

  // LA-022 residual: `sm:line-clamp-2 sm:whitespace-normal` alone still let a
  // single unbreakable word ("Rovaniemi", "London") overflow its line and
  // get ellipsized by the base `truncate`'s inherited `text-overflow` — on
  // every wrapped line, not just a true last line. `sm:break-words` lets the
  // browser break inside the word instead, so short names render in full and
  // long ones get a real 2-line clamp. The legend chip below the grid also
  // renders the stop name (without these classes), so this filters on the
  // cell label's own `uppercase` class to avoid matching that chip instead.
  it("clamps the city label to 2 lines and lets it wrap/break at sm, instead of single-line-truncating (LA-022)", () => {
    render(<MonthGrid {...JULY} days={[dayPlan("2026-07-14", 1)]} />);
    const cellLabel = screen
      .getAllByText("Paris")
      .find((el) => el.className.includes("uppercase"))!;
    expect(cellLabel).not.toBeUndefined();
    expect(cellLabel.className).toContain("truncate");
    expect(cellLabel.className).toContain("sm:line-clamp-2");
    expect(cellLabel.className).toContain("sm:whitespace-normal");
    expect(cellLabel.className).toContain("sm:break-words");
  });
});
