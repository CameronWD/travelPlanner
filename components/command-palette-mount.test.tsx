import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShellUserProvider, type ShellUser } from "@/components/shell/shell-user";
import { CommandPaletteMount } from "./command-palette-mount";
import { EMPTY_ADMIN_QUEUE } from "@/lib/admin-queue";
vi.mock("@/lib/usage/client", () => ({ recordUsageAction: vi.fn() }));
import { recordUsageAction } from "@/lib/usage/client";

const mockUsePathname = vi.fn(() => "/trips/t1");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const mockSearchTrip = vi.fn<(tripId: string, query: string) => Promise<never[]>>(async () => []);
const mockListMyTrips = vi.fn(async () => []);
vi.mock("@/server/actions/search", () => ({
  searchTrip: (tripId: string, query: string) => mockSearchTrip(tripId, query),
  listMyTrips: () => mockListMyTrips(),
}));

const shell: ShellUser = {
  user: { id: "u1", name: "Cam", email: "c@x", image: null },
  isAdmin: false,
  adminQueue: EMPTY_ADMIN_QUEUE,
  trips: [{ id: "t1", slug: "christmas-in-europe-2026", name: "Christmas in Europe", statusLine: "" }],
  lastTrip: null,
};

beforeEach(() => {
  mockSearchTrip.mockClear();
  mockListMyTrips.mockClear();
  mockListMyTrips.mockResolvedValue([]);
});

/** Same event the Dock's search button (AppShellRail) dispatches to open the palette. */
function openPalette() {
  act(() => {
    window.dispatchEvent(new Event("teepee:open-palette"));
  });
}

/**
 * Closes the palette and flushes the tick Radix's FocusScope defers its
 * unmount focus-restoration to (@radix-ui/react-focus-scope: a `setTimeout`
 * inside its cleanup effect) — left pending past this test, it can fire
 * during a later, unrelated test file once the dialog is gone for real.
 */
async function closePalette(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("textbox", { name: /command search/i })).toBeNull());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("CommandPaletteMount", () => {
  // Task 10 extra requirement (c): usePathname() now returns the slug URL
  // (ADR 0064), so the plain regex this component used to read a trip id off
  // the path was actually reading a slug — and handing it straight to
  // searchTrip, a server action that queries the DB by id, would search for a
  // Trip that doesn't exist. Resolved via useTripIdFromRef against the same
  // shell trip list useTripHref reads.
  it("resolves a slug in the pathname to the Trip's id before calling searchTrip", async () => {
    mockUsePathname.mockReturnValue("/trips/christmas-in-europe-2026/plan");
    const user = userEvent.setup();
    render(
      <ShellUserProvider value={shell}>
        <CommandPaletteMount />
      </ShellUserProvider>,
    );

    openPalette();
    const input = await screen.findByRole("textbox", { name: /command search/i });
    await user.type(input, "Rome");

    await waitFor(() => expect(mockSearchTrip).toHaveBeenCalledWith("t1", "Rome"));
    await closePalette(user);
  });

  it("passes a bare id straight through — it isn't anyone's slug", async () => {
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    const user = userEvent.setup();
    render(
      <ShellUserProvider value={shell}>
        <CommandPaletteMount />
      </ShellUserProvider>,
    );

    openPalette();
    const input = await screen.findByRole("textbox", { name: /command search/i });
    await user.type(input, "Rome");

    await waitFor(() => expect(mockSearchTrip).toHaveBeenCalledWith("t1", "Rome"));
    await closePalette(user);
  });

  it("treats /trips/new as no trip, not a slug to resolve", async () => {
    mockUsePathname.mockReturnValue("/trips/new");
    const user = userEvent.setup();
    render(
      <ShellUserProvider value={shell}>
        <CommandPaletteMount />
      </ShellUserProvider>,
    );

    openPalette();
    await screen.findByRole("textbox", { name: /command search/i });
    expect(screen.queryByText("Add Item")).toBeNull();
    await closePalette(user);
  });
});

describe("CommandPaletteMount records search", () => {
  it("records search-opened for the open-palette event and for Ctrl+K, once each", async () => {
    vi.mocked(recordUsageAction).mockClear();
    mockUsePathname.mockReturnValue("/trips/t1");
    const user = userEvent.setup();
    render(
      <ShellUserProvider value={shell}>
        <CommandPaletteMount />
      </ShellUserProvider>,
    );
    openPalette();
    expect(recordUsageAction).toHaveBeenCalledTimes(1);
    expect(recordUsageAction).toHaveBeenLastCalledWith("search-opened");
    await closePalette(user);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true }));
    });
    expect(recordUsageAction).toHaveBeenCalledTimes(2);
    expect(recordUsageAction).toHaveBeenLastCalledWith("search-opened");
    await closePalette(user);
  });

  it("records nothing for other keys", () => {
    vi.mocked(recordUsageAction).mockClear();
    render(
      <ShellUserProvider value={shell}>
        <CommandPaletteMount />
      </ShellUserProvider>,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true }));
    });
    expect(recordUsageAction).not.toHaveBeenCalled();
  });
});

describe("CommandPaletteMount held shortcut", () => {
  it("records search-opened once for a held Ctrl+K, and still opens", () => {
    vi.mocked(recordUsageAction).mockClear();
    render(
      <ShellUserProvider value={shell}>
        <CommandPaletteMount />
      </ShellUserProvider>,
    );
    act(() => {
      for (const repeat of [false, true, true]) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, repeat, cancelable: true }));
      }
    });
    expect(recordUsageAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: /command search/i })).toBeInTheDocument();
  });
});
