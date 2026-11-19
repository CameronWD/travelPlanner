import { describe, it, expect, vi } from "vitest";
import type { Route } from "next";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { markFlagFine } = vi.hoisted(() => ({ markFlagFine: vi.fn() }));
vi.mock("@/server/actions/flag-dismissals", () => ({ markFlagFine, unmarkFlagFine: vi.fn() }));

import { FlagList } from "./flag-list";
import type { Flag } from "@/lib/flags";

const BASE = "/trips/t" as Route;

describe("FlagList: Item Flags (spec 2026-10-17 R7)", () => {
  it("links an Item Flag to the Item's day", () => {
    const flags: Flag[] = [
      { id: "item-closed-i1", severity: "warning", message: "Memorium Nuremberg Trials is closed on Tuesdays.", targetType: "ITEM", targetId: "i1", date: "2026-12-08", stopId: "s1" },
    ];
    render(<FlagList flags={flags} tripId="t1" tripBasePath={BASE} />);
    expect(screen.getByRole("link", { name: /closed on Tuesdays/ })).toHaveAttribute("href", "/trips/t/day/2026-12-08");
  });

  it("links an undated Item Flag to its Stop on the plan", () => {
    const flags: Flag[] = [
      { id: "book-by-soon-i2", severity: "info", message: "Book Tram pass by Fri 4 Dec, in 3 days.", targetType: "ITEM", targetId: "i2", stopId: "s1" },
    ];
    render(<FlagList flags={flags} tripId="t1" tripBasePath={BASE} />);
    expect(screen.getByRole("link", { name: /Tram pass/ })).toHaveAttribute("href", "/trips/t/plan?stop=s1");
  });
});

describe("FlagList: Marked fine (spec 2026-11-18 T5)", () => {
  const tight: Flag = {
    id: "tight-a-b", severity: "warning", message: "Tight on 2026-07-02 between Louvre and Lunch.", targetType: "DAY", date: "2026-07-02",
    fingerprint: "fp-1", between: { from: "Louvre", to: "Lunch" }, hop: { fromItemId: "a", toItemId: "b", mode: "WALK", modeSetByHand: false },
  };
  const other: Flag = { ...tight, id: "tight-c-d", message: "Cutting it close on 2026-07-02 between Tea and Tower.", fingerprint: "fp-2", between: { from: "Tea", to: "Tower" } };
  const packed: Flag = { id: "packed-2026-07-02", severity: "info", message: "2026-07-02 looks packed.", targetType: "DAY", date: "2026-07-02" };

  it('offers "This is fine" on tight rows only, beside the link, each named for its two things', async () => {
    markFlagFine.mockResolvedValue({ success: true });
    render(<FlagList flags={[tight, other, packed]} tripId="t1" tripBasePath={BASE} />);
    expect(screen.getAllByRole("button", { name: /^This is fine/ })).toHaveLength(2);
    const button = screen.getByRole("button", { name: "This is fine: Louvre to Lunch" });
    expect(button.closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: /between Louvre and Lunch/ })).toHaveAttribute("href", "/trips/t/day/2026-07-02");
    await userEvent.click(button);
    expect(markFlagFine).toHaveBeenCalledWith("t1", "tight-a-b", "fp-1");
  });
});

describe("FlagList: tight rows and empty days", () => {
  const tight: Flag = {
    id: "tight-a-b", severity: "warning", message: "Tight between Louvre and Lunch.", targetType: "DAY", date: "2026-07-02",
    fingerprint: "fp-1", between: { from: "Louvre", to: "Lunch" }, hop: { fromItemId: "a", toItemId: "b", mode: "WALK", modeSetByHand: false },
  };
  const empty = (d: string): Flag => ({ id: `empty-day-${d}`, severity: "info", message: `Nothing scheduled on ${d}.`, targetType: "DAY", date: d });

  it("keeps This is fine inside the same card as its message", () => {
    render(<FlagList flags={[tight]} tripId="t1" tripBasePath={BASE} />);
    const card = screen.getByRole("link", { name: /Louvre and Lunch/ }).parentElement?.parentElement;
    expect(card).toContainElement(screen.getByRole("button", { name: /^This is fine/ }));
  });

  it("folds three empty days into one line that opens to the days", () => {
    const { container } = render(<FlagList flags={[empty("2026-07-02"), empty("2026-07-03"), empty("2026-07-04")]} tripId="t1" tripBasePath={BASE} />);
    expect(screen.getByText("Nothing scheduled on 3 days")).toBeInTheDocument();
    expect(container.querySelectorAll("details li")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: /Notes \(3\)/ })).toBeInTheDocument();
  });

  it("shows a single empty day as a plain row", () => {
    const { container } = render(<FlagList flags={[empty("2026-07-02")]} tripId="t1" tripBasePath={BASE} />);
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByRole("link", { name: /Nothing scheduled on/ })).toBeInTheDocument();
  });
});
