import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ current: new URLSearchParams("plan=f1") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/trips/eu/budget",
  useSearchParams: () => search.current,
}));

import { BreakdownCard, BREAKDOWN_ROW_CLASS } from "./breakdown-card";
import type { BreakdownRow, BarSegment } from "@/lib/money/breakdown";

const OPTIONS = [
  { value: "category" as const, label: "Category" },
  { value: "place" as const, label: "Place" },
  { value: "day" as const, label: "Day" },
];
const ROWS: BreakdownRow[] = [
  { key: "cat:Transport", label: "Transport", hue: "sun", icon: "transport", pct: 42, costMinor: 624000, paidMinor: 517800, muted: false, missingRate: false },
  { key: "cat:Other", label: "Other", hue: "lilac", icon: "other", pct: 4, costMinor: 72000, paidMinor: 0, muted: false, missingRate: true },
];
const SEGS: BarSegment[] = [
  { key: "cat:Transport", hue: "sun", fraction: 0.9 },
  { key: "cat:Other", hue: "lilac", fraction: 0.1 },
];
const base = { by: "category" as const, options: OPTIONS, rows: ROWS, segments: SEGS, homeCurrency: "AUD", showPaid: true };

beforeEach(() => {
  replace.mockClear();
  search.current = new URLSearchParams("plan=f1");
});

describe("Where it goes (MONEY.md §5)", () => {
  it("is headed Where it goes, with the grouping control", () => {
    render(<BreakdownCard {...base} />);
    const card = screen.getByRole("region", { name: "Where it goes" });
    expect(within(card).getByRole("heading", { level: 2, name: "Where it goes" })).toBeInTheDocument();
    expect(within(card).getByRole("radio", { name: "Category" })).toHaveAttribute("data-state", "on");
    expect(within(card).getByRole("combobox", { name: "Group by" })).toHaveValue("category");
  });

  it("rows: swatch in the hue, name, %, paid and amount; the No rate chip", () => {
    render(<BreakdownCard {...base} />);
    const transport = screen.getByRole("listitem", { name: "Transport" });
    expect(transport.className).toBe(BREAKDOWN_ROW_CLASS);
    expect(within(transport).getByTestId("breakdown-swatch").className).toContain("bg-hue-sun");
    expect(within(transport).getByText("42%")).toBeInTheDocument();
    expect(within(transport).getByText("$5,178 paid")).toHaveClass("text-teal-text");
    expect(within(transport).getByText("$6,240")).toHaveClass("tabular-nums");
    const other = screen.getByRole("listitem", { name: "Other" });
    expect(within(other).getByText("No rate")).toHaveClass("bg-sun", "whitespace-nowrap", "shrink-0");
    expect(within(other).queryByText(/paid/)).toBeNull();
  });

  it("hides paid on a fork", () => {
    render(<BreakdownCard {...base} showPaid={false} />);
    expect(screen.queryByText("$5,178 paid")).toBeNull();
  });

  it("the stacked bar is decorative and sized by fraction; Day has no bar", () => {
    const { rerender, container } = render(<BreakdownCard {...base} />);
    const bar = container.querySelector("[data-slot='stacked-bar']")!;
    expect(bar).toHaveAttribute("aria-hidden", "true");
    const segs = bar.querySelectorAll("[data-slot='stacked-segment']");
    expect(segs).toHaveLength(2);
    expect((segs[0] as HTMLElement).style.width).toBe("90%");
    rerender(<BreakdownCard {...base} by="day" rows={[{ ...ROWS[0], key: "day:x", label: "Sat 12 Dec", pct: null, hue: "stone", icon: null }]} />);
    expect(container.querySelector("[data-slot='stacked-bar']")).toBeNull();
    expect(screen.queryByText("42%")).toBeNull();
  });

  it("chapter rows use the ChapterChip; muted rows have no swatch", () => {
    render(
      <BreakdownCard
        {...base}
        by="place"
        rows={[
          { key: "ch:c1", label: "Italy", hue: "coral", icon: null, chapterColour: "orange", pct: 60, costMinor: 60000, paidMinor: 0, muted: false, missingRate: false },
          { key: "rec:ungrouped", label: "Ungrouped", hue: null, icon: null, pct: 40, costMinor: 40000, paidMinor: 0, muted: true, missingRate: false },
        ]}
      />,
    );
    expect(within(screen.getByRole("listitem", { name: "Italy" })).getByText("Italy")).toBeInTheDocument();
    const ungrouped = screen.getByRole("listitem", { name: "Ungrouped" });
    expect(within(ungrouped).queryByTestId("breakdown-swatch")).toBeNull();
    expect(within(ungrouped).getByText("Ungrouped")).toHaveClass("text-muted-foreground");
  });

  it("switching replaces ?by= without scrolling and keeps ?plan=", async () => {
    const user = userEvent.setup();
    render(<BreakdownCard {...base} />);
    await user.click(screen.getByRole("radio", { name: "Place" }));
    expect(replace).toHaveBeenCalledWith("/trips/eu/budget?plan=f1&by=place", { scroll: false });
  });

  it("choosing Category drops ?by=, from the phone select too", async () => {
    const user = userEvent.setup();
    search.current = new URLSearchParams("by=day");
    render(<BreakdownCard {...base} by="day" />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Group by" }), "category");
    expect(replace).toHaveBeenCalledWith("/trips/eu/budget", { scroll: false });
  });
});
