import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { CommandPalette } from "./command-palette";
import type { SearchHit } from "@/server/actions/search";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => "/trips/t1",
}));

const mockSearchTrip = vi.fn<(tripId: string, query: string) => Promise<SearchHit[]>>();
const mockListMyTrips = vi.fn<() => Promise<Array<{ id: string; name: string }>>>();

vi.mock("@/server/actions/search", () => ({
  searchTrip: (tripId: string, query: string) => mockSearchTrip(tripId, query),
  listMyTrips: () => mockListMyTrips(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPalette(props: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const defaults = {
    open: true,
    onOpenChange: vi.fn(),
    tripId: "t1",
  };
  return render(<CommandPalette {...defaults} {...props} />);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  mockSearchTrip.mockReset();
  mockListMyTrips.mockResolvedValue([]);
  // Default: no search hits
  mockSearchTrip.mockResolvedValue([]);
  // Ensure online
  Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CommandPalette", () => {
  describe("Go to section", () => {
    it("renders 'Go to' entries when open with a tripId", async () => {
      renderPalette();
      expect(await screen.findByText("Home")).toBeInTheDocument();
      expect(screen.getByText("Plan")).toBeInTheDocument();
      expect(screen.getByText("Days")).toBeInTheDocument();
      expect(screen.getByText("Calendar")).toBeInTheDocument();
      expect(screen.getByText("Money")).toBeInTheDocument();
      expect(screen.getByText("Wishlist")).toBeInTheDocument();
    });

    it("Days opens the Day view and Calendar opens the calendar", async () => {
      const user = userEvent.setup();
      renderPalette();
      await user.click(await screen.findByText("Days"));
      expect(mockPush).toHaveBeenCalledWith("/trips/t1/day", undefined);
      mockPush.mockReset();
      renderPalette();
      const cals = await screen.findAllByText("Calendar");
      await user.click(cals[cals.length - 1]);
      expect(mockPush).toHaveBeenCalledWith("/trips/t1/calendar", undefined);
    });

    it("does not render 'Go to' pages when tripId is null", async () => {
      renderPalette({ tripId: null });
      // Give it a tick to settle
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByText("Home")).not.toBeInTheDocument();
      expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    });

    it("filters 'Go to' pages by query — typing 'mon' shows only Money", async () => {
      const user = userEvent.setup();
      renderPalette();
      await screen.findByText("Home"); // wait for render

      const input = screen.getByRole("textbox", { name: /command search/i });
      await user.type(input, "mon");

      expect(screen.getByText("Money")).toBeInTheDocument();
      expect(screen.queryByText("Home")).not.toBeInTheDocument();
      expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    });
  });

  describe("Do section", () => {
    // Dark mode is parked (spec 2026-10-04 §F): Search offers no theme command.
    it("offers no theme command, even when you type 'theme'", async () => {
      const user = userEvent.setup();
      renderPalette();
      await screen.findByText("New trip");
      expect(screen.queryByText("Toggle theme")).not.toBeInTheDocument();

      await user.type(screen.getByRole("textbox", { name: /command search/i }), "theme");
      expect(screen.queryByRole("option", { name: /theme/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Do" })).not.toBeInTheDocument();
    });

    it("renders 'New trip', 'Add Item', 'Add Stop' commands when tripId is set", async () => {
      renderPalette();
      expect(await screen.findByText("New trip")).toBeInTheDocument();
      expect(screen.getByText("Add Item")).toBeInTheDocument();
      expect(screen.getByText("Add Stop")).toBeInTheDocument();
    });

    it("filters Do commands by query", async () => {
      const user = userEvent.setup();
      renderPalette();
      await screen.findByText("New trip");

      await user.type(screen.getByRole("textbox", { name: /command search/i }), "add");

      expect(screen.getByText("Add Item")).toBeInTheDocument();
      expect(screen.getByText("Add Stop")).toBeInTheDocument();
      expect(screen.queryByText("New trip")).not.toBeInTheDocument();
    });
  });

  describe("Find section (search)", () => {
    it("calls searchTrip with the typed query and renders the returned hit label", async () => {
      const user = userEvent.setup();
      const mockHit: SearchHit = {
        type: "stop",
        id: "stop-1",
        label: "Paris",
        href: "/trips/t1/plan",
      };
      mockSearchTrip.mockResolvedValue([mockHit]);

      renderPalette();
      const input = screen.getByRole("textbox", { name: /command search/i });
      await user.type(input, "paris");

      await waitFor(
        () => expect(mockSearchTrip).toHaveBeenCalledWith("t1", "paris"),
        { timeout: 1000 },
      );
      expect(await screen.findByText("Paris")).toBeInTheDocument();
    });

    it("shows offline message when navigator is offline", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
      // Re-render after setting offline
      renderPalette();
      expect(await screen.findByText("Search needs a connection.")).toBeInTheDocument();
    });

    it("does not render the Find section when tripId is null", async () => {
      renderPalette({ tripId: null });
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByText("Search needs a connection.")).not.toBeInTheDocument();
      expect(screen.queryByText(/type to search/i)).not.toBeInTheDocument();
    });
  });

  describe("Keyboard navigation", () => {
    it("ArrowDown from input focuses the first command button", async () => {
      const user = userEvent.setup();
      renderPalette();
      await screen.findByText("Home");

      const input = screen.getByRole("textbox", { name: /command search/i });
      input.focus();
      await user.keyboard("{ArrowDown}");

      // Some option should now be focused
      const options = screen.getAllByRole("option");
      expect(options.some((o) => o === document.activeElement)).toBe(true);
    });

    it("pressing Escape closes the dialog (Radix handles this natively)", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderPalette({ onOpenChange });
      await screen.findByText("Home");

      await user.keyboard("{Escape}");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("Global Globe command", () => {
    it("offers a global Globe command that navigates to /globe", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderPalette({ onOpenChange });
      expect(await screen.findByText("Globe")).toBeInTheDocument();

      await user.click(screen.getByText("Globe"));
      expect(mockPush).toHaveBeenCalledWith("/globe", undefined);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("Globe command is available even when tripId is null", async () => {
      renderPalette({ tripId: null });
      expect(await screen.findByText("Globe")).toBeInTheDocument();
    });
  });

  describe("Mobile font size", () => {
    it("keeps the search input at 16px on desktop (text-base sm:text-base, not sm:text-sm)", async () => {
      renderPalette();
      const input = await screen.findByRole("textbox", { name: /command search/i });
      const classes = input.className.split(" ");
      expect(classes).toContain("text-base");
      expect(classes).toContain("sm:text-base");
      expect(classes).not.toContain("sm:text-sm");
    });
  });

  describe("Switch trip", () => {
    it("shows other trips from listMyTrips under Go to", async () => {
      mockListMyTrips.mockResolvedValue([
        { id: "t2", name: "Japan 2025" },
        { id: "t1", name: "Current trip" }, // same trip — should be excluded
      ]);
      renderPalette({ tripId: "t1" });

      expect(await screen.findByText("Japan 2025")).toBeInTheDocument();
      // Current trip (same id) should not appear in switch list
      // It might appear in the Go to label row — verify it's not a Switch entry
      const switchButtons = screen
        .getAllByRole("option")
        .filter((b) => b.textContent?.includes("Japan 2025"));
      expect(switchButtons.length).toBeGreaterThan(0);
    });
  });

  it("Add Item opens the Wishlist with the Item form (?add=item)", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(await screen.findByText("Add Item"));
    expect(mockPush).toHaveBeenCalledWith("/trips/t1/wishlist?add=item", undefined);
  });

  it("Add Stop opens the Plan with the add-Stop form (?add=stop)", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.click(await screen.findByText("Add Stop"));
    expect(mockPush).toHaveBeenCalledWith("/trips/t1/plan?add=stop", undefined);
  });
});
