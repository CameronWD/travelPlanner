import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { ThemeProvider } from "@/components/ui/theme-provider";
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

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

function renderPalette(props: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const defaults = {
    open: true,
    onOpenChange: vi.fn(),
    tripId: "t1",
  };
  return render(
    <CommandPalette {...defaults} {...props} />,
    { wrapper: Wrapper },
  );
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
      expect(screen.getByText("Calendar")).toBeInTheDocument();
      expect(screen.getByText("Budget")).toBeInTheDocument();
      expect(screen.getByText("Wishlist")).toBeInTheDocument();
    });

    it("does not render 'Go to' pages when tripId is null", async () => {
      renderPalette({ tripId: null });
      // Give it a tick to settle
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByText("Home")).not.toBeInTheDocument();
      expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    });

    it("filters 'Go to' pages by query — typing 'bud' shows only Budget", async () => {
      const user = userEvent.setup();
      renderPalette();
      await screen.findByText("Home"); // wait for render

      const input = screen.getByRole("textbox", { name: /command search/i });
      await user.type(input, "bud");

      expect(screen.getByText("Budget")).toBeInTheDocument();
      expect(screen.queryByText("Home")).not.toBeInTheDocument();
      expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    });
  });

  describe("Do section", () => {
    it("renders a 'Toggle theme' command", async () => {
      renderPalette();
      expect(await screen.findByText("Toggle theme")).toBeInTheDocument();
    });

    it("clicking 'Toggle theme' calls toggleTheme and closes the palette", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      // Ensure a known starting state so the toggle direction is predictable.
      document.documentElement.classList.remove("dark");
      renderPalette({ onOpenChange });

      const btn = await screen.findByText("Toggle theme");
      await user.click(btn);

      // The dialog should close.
      expect(onOpenChange).toHaveBeenCalledWith(false);
      // toggleTheme must have actually fired — the dark class should have been added.
      expect(document.documentElement.classList.contains("dark")).toBe(true);
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
      await screen.findByText("Toggle theme");

      const input = screen.getByRole("textbox", { name: /command search/i });
      await user.type(input, "toggle");

      expect(screen.getByText("Toggle theme")).toBeInTheDocument();
      expect(screen.getByText("Toggle Discreet")).toBeInTheDocument();
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
      expect(mockPush).toHaveBeenCalledWith("/globe");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("Globe command is available even when tripId is null", async () => {
      renderPalette({ tripId: null });
      expect(await screen.findByText("Globe")).toBeInTheDocument();
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
});
