import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DayIdeas } from "./day-ideas";

// Mock the server action so its next/server import chain doesn't load in jsdom.
vi.mock("@/server/actions/items", () => ({
  scheduleItem: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock the toast so we don't need the toast provider.
vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));

import { scheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";

describe("DayIdeas", () => {
  it("renders the stop's things to do and wishlist ideas with add buttons", () => {
    render(
      <DayIdeas
        tripId="t1"
        date="2026-12-09"
        thingsToDo={[
          { id: "th1", title: "Residenz", category: "SIGHTSEEING", startTime: "14:00", endTime: null },
        ]}
        wishlistIdeas={[
          { id: "w1", title: "Marienplatz", category: "ATTRACTION", distanceKm: 0.4, reason: "nearby" },
          { id: "w2", title: "Hofbrauhaus", category: "FOOD", distanceKm: null, reason: "country" },
          { id: "w3", title: "Random jot", category: "OTHER", distanceKm: null, reason: "unlocated" },
        ]}
      />,
    );

    expect(screen.getByText("Day ideas")).toBeInTheDocument();
    expect(screen.getByText("Residenz")).toBeInTheDocument();
    expect(screen.getByText("Marienplatz")).toBeInTheDocument();
    expect(screen.getByText("Hofbrauhaus")).toBeInTheDocument();
    expect(screen.getByText("Random jot")).toBeInTheDocument();

    // nearby distance label
    expect(screen.getByText("≈400 m")).toBeInTheDocument();
    // country tag
    expect(screen.getByText("same country")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /add residenz/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add marienplatz/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add hofbrauhaus/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add random jot/i })).toBeInTheDocument();

    expect(screen.getByText("See full wishlist")).toHaveAttribute(
      "href",
      "/trips/t1/wishlist",
    );
  });

  it("schedules a thing-to-do preserving its existing times", async () => {
    render(
      <DayIdeas
        tripId="t1"
        date="2026-12-09"
        thingsToDo={[
          { id: "th1", title: "Residenz", category: "SIGHTSEEING", startTime: "14:00", endTime: null },
        ]}
        wishlistIdeas={[]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /add residenz/i }));
    expect(scheduleItem).toHaveBeenCalledWith("th1", { date: "2026-12-09", startTime: "14:00" });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Added to today" }),
    );
  });

  it("schedules a wishlist idea via the copy-in branch (date only)", async () => {
    render(
      <DayIdeas
        tripId="t1"
        date="2026-12-09"
        thingsToDo={[]}
        wishlistIdeas={[
          { id: "w1", title: "Marienplatz", category: "ATTRACTION", distanceKm: 0.4, reason: "nearby" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /add marienplatz/i }));
    expect(scheduleItem).toHaveBeenCalledWith("w1", { date: "2026-12-09" });
  });

  it("shows a destructive toast on the first error when scheduling fails", async () => {
    vi.mocked(scheduleItem).mockResolvedValueOnce({
      success: false,
      errors: { date: ["Invalid date"] },
    } as never);

    render(
      <DayIdeas
        tripId="t1"
        date="2026-12-09"
        thingsToDo={[
          { id: "th1", title: "Residenz", category: "SIGHTSEEING", startTime: null, endTime: null },
        ]}
        wishlistIdeas={[]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /add residenz/i }));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", description: "Invalid date" }),
    );
  });

  it("renders nothing when there is nothing to offer", () => {
    const { container } = render(
      <DayIdeas tripId="t1" date="2026-12-09" thingsToDo={[]} wishlistIdeas={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("never uses banned suggestion/recommendation/POI language", () => {
    const { container } = render(
      <DayIdeas
        tripId="t1"
        date="2026-12-09"
        thingsToDo={[
          { id: "th1", title: "Residenz", category: "SIGHTSEEING", startTime: null, endTime: null },
        ]}
        wishlistIdeas={[]}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/suggestion/i);
    expect(text).not.toMatch(/recommend/i);
    expect(text).not.toMatch(/\bPOI\b/i);
  });
});
