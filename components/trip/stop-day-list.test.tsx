import { render, screen, within } from "@testing-library/react";
import { it, expect, vi, describe } from "vitest";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("@/server/actions/items", () => ({
  createItem: vi.fn().mockResolvedValue({ success: true }),
  updateItem: vi.fn().mockResolvedValue({ success: true }),
  scheduleItem: vi.fn().mockResolvedValue({ success: true }),
  unscheduleItem: vi.fn().mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null }),
  rescheduleItem: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
import { scheduleItem } from "@/server/actions/items";

import { StopDayList } from "./stop-day-list";
import type { StopDayItem } from "@/lib/stop-days";

const stop = { id: "s1", arriveDate: "2026-12-05", departDate: "2026-12-07" };
const items: StopDayItem[] = [
  { id: "a", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-06", startTime: "09:30", stopId: "s1" },
  { id: "b", title: "Seine cruise", category: "ACTIVITY", date: "2026-12-06", startTime: "14:00", stopId: "s1" },
  { id: "c", title: "Wander Marais", category: "SIGHTSEEING", date: "2026-12-06", startTime: null, stopId: "s1" },
];

const baseProps = {
  tripId: "t1",
  stop,
  items,
  stops: [{ id: "s1", name: "Paris" }],
};

describe("collapsed day rows", () => {
  it("renders one row per day of the stay with an inline item preview", () => {
    render(<StopDayList {...baseProps} />);
    expect(screen.getByRole("button", { name: /Sat 5 Dec/ })).toBeInTheDocument();
    const dec6 = screen.getByRole("button", { name: /Sun 6 Dec/ });
    expect(dec6).toHaveTextContent("Louvre");
    expect(dec6).toHaveTextContent("Seine cruise");
    expect(dec6).toHaveTextContent("+1");
    expect(screen.getByRole("button", { name: /Mon 7 Dec/ })).toBeInTheDocument();
  });

  it("marks empty days as 'Nothing planned' and keeps them collapsed by default", () => {
    render(<StopDayList {...baseProps} />);
    const dec5 = screen.getByRole("button", { name: /Sat 5 Dec/ });
    expect(dec5).toHaveTextContent(/nothing planned/i);
    expect(dec5).toHaveAttribute("aria-expanded", "false");
  });
});

describe("expanded day", () => {
  it("expands to timed rows in time order plus an Anytime group and an open-day link", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Sun 6 Dec/ }));
    const region = screen.getByTestId("day-detail-2026-12-06");
    const times = within(region).getAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent);
    expect(times).toEqual(["09:30", "14:00"]);
    expect(within(region).getByText("Anytime")).toBeInTheDocument();
    expect(within(region).getByText("Wander Marais")).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: /open day/i })).toHaveAttribute(
      "href",
      "/trips/t1/day/2026-12-06",
    );
  });

  it("offers + Add on an expanded empty day, opening the item dialog with that date", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Sat 5 Dec/ }));
    const region = screen.getByTestId("day-detail-2026-12-05");
    await user.click(within(region).getByRole("button", { name: /add to this day/i }));
    expect(await screen.findByLabelText(/^date$/i)).toHaveValue("2026-12-05");
  });

  it("moves an item to another day via the pick-a-day menu, keeping it on the same stop and preserving its times", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Sun 6 Dec/ }));
    const region = screen.getByTestId("day-detail-2026-12-06");
    await user.click(within(region).getByRole("button", { name: "Move Louvre to another day" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mon 7 Dec" }));
    // Louvre has startTime "09:30" and no endTime — must survive the move,
    // and the item must go through scheduleItem's in-place branch (which
    // keeps stopId) rather than rescheduleItem (which re-derives stopId from
    // the date and would re-file a changeover-day item onto the next stop).
    expect(scheduleItem).toHaveBeenCalledWith("a", { date: "2026-12-07", startTime: "09:30" });
  });

  it("moves an untimed item to another day with just the date", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Sun 6 Dec/ }));
    const region = screen.getByTestId("day-detail-2026-12-06");
    await user.click(within(region).getByRole("button", { name: "Move Wander Marais to another day" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mon 7 Dec" }));
    expect(scheduleItem).toHaveBeenCalledWith("c", { date: "2026-12-07" });
  });

  it("offers Unschedule on each expanded item row", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Sun 6 Dec/ }));
    const region = screen.getByTestId("day-detail-2026-12-06");
    expect(within(region).getAllByTitle("Unschedule").length).toBeGreaterThanOrEqual(3);
  });
});
