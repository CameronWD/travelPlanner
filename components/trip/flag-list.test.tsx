import { describe, it, expect } from "vitest";
import type { Route } from "next";
import { render, screen } from "@testing-library/react";
import { FlagList } from "./flag-list";
import type { Flag } from "@/lib/flags";

const BASE = "/trips/t" as Route;

describe("FlagList: Item Flags (spec 2026-10-17 R7)", () => {
  it("links an Item Flag to the Item's day", () => {
    const flags: Flag[] = [
      { id: "item-closed-i1", severity: "warning", message: "Memorium Nuremberg Trials is closed on Tuesdays.", targetType: "ITEM", targetId: "i1", date: "2026-12-08", stopId: "s1" },
    ];
    render(<FlagList flags={flags} tripBasePath={BASE} />);
    expect(screen.getByRole("link", { name: /closed on Tuesdays/ })).toHaveAttribute("href", "/trips/t/day/2026-12-08");
  });

  it("links an undated Item Flag to its Stop on the plan", () => {
    const flags: Flag[] = [
      { id: "book-by-soon-i2", severity: "info", message: "Book Tram pass by Fri 4 Dec, in 3 days.", targetType: "ITEM", targetId: "i2", stopId: "s1" },
    ];
    render(<FlagList flags={flags} tripBasePath={BASE} />);
    expect(screen.getByRole("link", { name: /Tram pass/ })).toHaveAttribute("href", "/trips/t/plan?stop=s1");
  });
});
