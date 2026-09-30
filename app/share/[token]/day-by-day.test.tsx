import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { scrollToId } = vi.hoisted(() => ({ scrollToId: vi.fn() }));
vi.mock("@/lib/scroll-to", () => ({ scrollToId }));

import { DayByDay, type DayByDayStop } from "./day-by-day";

const row = (title: string) => ({ key: title, time: "10:00", title, sub: null, kind: "item" as const, category: "SIGHTSEEING", mode: null, done: false });
const stops: DayByDayStop[] = [
  { id: "lon", name: "London", number: 1, sortOrder: 0, arriveDate: "2026-12-05", departDate: "2026-12-10", nights: 5, status: "past",
    days: [{ dateISO: "2026-12-05", isToday: false, title: null, rows: [row("Borough Market")] }],
    legAfter: { mode: "TRAIN", label: "Train to Paris", line: "Thu 10 Dec · St Pancras 09:31 → Gare du Nord 12:47" } },
  { id: "par", name: "Paris", number: 2, sortOrder: 1, arriveDate: "2026-12-10", departDate: "2026-12-15", nights: 5, status: "current",
    days: [
      { dateISO: "2026-12-11", isToday: false, title: null, rows: [row("Louvre")] },
      { dateISO: "2026-12-12", isToday: true, title: "Versailles day", rows: [row("Palace + gardens")] },
    ],
    legAfter: null },
];

describe("DayByDay (SHARE.md §7)", () => {
  beforeEach(() => scrollToId.mockClear());

  it("opens the initial stop with its head band and day rows; others are folded", () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(screen.getByRole("heading", { name: "Day by day" })).toBeInTheDocument();
    expect(screen.getAllByTestId("share-day")).toHaveLength(2);
    expect(screen.getByText("Versailles day")).toBeInTheDocument();
    expect(screen.queryByText("Borough Market")).not.toBeInTheDocument();
    expect(screen.getByText("London · 1 day")).toBeInTheDocument();
  });

  it("marks today with aria-current, a TODAY pill and a sun tint", () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    const today = screen.getAllByTestId("share-day").find((d) => d.getAttribute("aria-current") === "date")!;
    expect(within(today).getByText("Today")).toBeInTheDocument();
    expect(today.className).toMatch(/bg-sun\/15/);
  });

  it("past folded stops are dashed and say Done", () => {
    const { container } = render(<DayByDay stops={stops} initialOpenId="par" />);
    const folded = container.querySelector("[data-stop-folded='lon']")!;
    expect(folded.className).toMatch(/border-dashed/);
    expect(within(folded as HTMLElement).getByText("Done")).toBeInTheDocument();
  });

  it("Show opens a folded stop and folds the open one", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    await userEvent.click(within(screen.getByText("London · 1 day").closest("[data-stop-folded]") as HTMLElement).getByRole("button", { name: /show/i }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
    expect(screen.queryByText("Louvre")).not.toBeInTheDocument();
  });

  it("the stop index opens and scrolls to a stop", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    const index = screen.getByRole("navigation", { name: "Stops" });
    await userEvent.click(within(index).getByRole("button", { name: /London/ }));
    expect(scrollToId).toHaveBeenCalledWith("share-stop-lon", expect.objectContaining({ reduced: expect.any(Boolean) }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
  });

  it("the mobile picker names the open stop and switches it", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "London" }));
    expect(scrollToId).toHaveBeenCalledWith("share-stop-lon", expect.objectContaining({ reduced: expect.any(Boolean) }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
    expect(screen.queryByText("Louvre")).not.toBeInTheDocument();
  });

  it("draws the leg line with no booking reference", () => {
    render(<DayByDay stops={stops} initialOpenId={null} />);
    expect(screen.getByText("Train to Paris")).toBeInTheDocument();
    expect(screen.getByText("Thu 10 Dec · St Pancras 09:31 → Gare du Nord 12:47")).toBeInTheDocument();
  });

  it("with nothing open (After), every stop is folded", () => {
    render(<DayByDay stops={stops} initialOpenId={null} />);
    expect(screen.queryAllByTestId("share-day")).toHaveLength(0);
  });

  it("gives every small control a tap-target", () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(screen.getByRole("button", { name: /hide/i }).className).toMatch(/tap-target/);
    expect(screen.getByRole("button", { name: /show/i }).className).toMatch(/tap-target/);
    const index = screen.getByRole("navigation", { name: "Stops" });
    for (const b of within(index).getAllByRole("button")) expect(b.className).toMatch(/tap-target/);
  });

  it("Hide folds the open stop", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    await userEvent.click(screen.getByRole("button", { name: /hide/i }));
    expect(screen.queryAllByTestId("share-day")).toHaveLength(0);
  });

  it("uses no banned styles", () => {
    const { container } = render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });
});
