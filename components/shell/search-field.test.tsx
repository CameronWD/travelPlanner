import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import type { SearchHit } from "@/server/actions/search";
import { setMatchMedia } from "@/test/setup";
import { SearchField } from "./search-field";
import { CommandPaletteMount } from "@/components/command-palette-mount";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
  usePathname: () => "/trips/t1",
}));

const mockSearchTrip = vi.fn<(tripId: string, query: string) => Promise<SearchHit[]>>();
const mockListMyTrips = vi.fn<() => Promise<Array<{ id: string; name: string }>>>();
vi.mock("@/server/actions/search", () => ({
  searchTrip: (tripId: string, query: string) => mockSearchTrip(tripId, query),
  listMyTrips: () => mockListMyTrips(),
}));

function renderField(tripId: string | null = "t1") {
  return render(
    <div>
      <SearchField tripId={tripId} />
      <button type="button">Elsewhere</button>
    </div>,
  );
}

const field = () => screen.getByRole("combobox", { name: /search or jump/i });

beforeEach(() => {
  mockPush.mockReset();
  mockSearchTrip.mockReset();
  mockSearchTrip.mockResolvedValue([]);
  mockListMyTrips.mockReset();
  mockListMyTrips.mockResolvedValue([]);
  Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  setMatchMedia((q) => q === "(min-width: 640px)");
});

describe("SearchField", () => {
  it("is a real text input: a combobox with the placeholder, collapsed until focused", () => {
    renderField();
    const input = field();
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("placeholder", "Search or jump…");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("uses the Playground field styling: 44px, card, 2px ink border, 12px radius", () => {
    renderField();
    const wrapper = field().closest("[data-search-field]")!;
    const classes = `${wrapper.className} ${field().className}`.split(/\s+/);
    for (const c of ["h-11", "bg-card", "border-2", "border-border", "rounded-[12px]"]) {
      expect(classes).toContain(c);
    }
  });

  it("focusing shows Go to and Do groups in a listbox the input controls", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(field());
    const input = field();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(within(listbox).getByRole("group", { name: "Go to" })).toBeInTheDocument();
    expect(within(listbox).getByRole("group", { name: "Do" })).toBeInTheDocument();
    // Find only appears once you type.
    expect(within(listbox).queryByRole("group", { name: "Find" })).not.toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Plan" })).toBeInTheDocument();
    // Dark mode is parked (spec 2026-10-04 §F): no theme command in Do.
    expect(within(listbox).queryByRole("option", { name: /theme/i })).not.toBeInTheDocument();
  });

  it("typing 'theme' offers no theme command and no empty Do group", async () => {
    const user = userEvent.setup();
    renderField();
    await user.type(field(), "theme");
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByRole("option", { name: /theme/i })).not.toBeInTheDocument();
    expect(within(listbox).queryByRole("group", { name: "Do" })).not.toBeInTheDocument();
  });

  it("typing 'par' calls searchTrip and shows a Find result", async () => {
    const user = userEvent.setup();
    mockSearchTrip.mockResolvedValue([
      { type: "stop", id: "s1", label: "Paris", href: "/trips/t1/stops/s1" },
    ]);
    renderField();
    await user.type(field(), "par");
    await waitFor(() => expect(mockSearchTrip).toHaveBeenCalledWith("t1", "par"));
    const find = await screen.findByRole("group", { name: "Find" });
    expect(await within(find).findByRole("option", { name: /Paris/ })).toBeInTheDocument();
  });

  it("ArrowDown moves the active option (aria-activedescendant) and Enter navigates", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(field());
    expect(field()).not.toHaveAttribute("aria-activedescendant");

    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(field()).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    // Focus stays in the field — the caret never leaves.
    expect(field()).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(field()).toHaveAttribute("aria-activedescendant", options[1].id);
    await user.keyboard("{ArrowUp}");
    expect(field()).toHaveAttribute("aria-activedescendant", options[0].id);

    await user.keyboard("{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/trips/t1", undefined);
    expect(field()).toHaveAttribute("aria-expanded", "false");
  });

  it("Enter after typing jumps to the top match", async () => {
    const user = userEvent.setup();
    renderField();
    await user.type(field(), "mon");
    await user.keyboard("{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/trips/t1/budget", undefined);
  });

  it("clicking an option activates it", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(field());
    await user.click(screen.getByRole("option", { name: "Globe" }));
    expect(mockPush).toHaveBeenCalledWith("/globe", undefined);
  });

  it("Esc clears the text first, then closes and blurs", async () => {
    const user = userEvent.setup();
    renderField();
    await user.type(field(), "plan");
    expect(field()).toHaveValue("plan");

    await user.keyboard("{Escape}");
    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(field()).not.toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clicking outside closes the panel", async () => {
    const user = userEvent.setup();
    renderField();
    await user.click(field());
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("offline: Find says so plainly while Go to and Do still work", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    const user = userEvent.setup();
    renderField();
    await user.type(field(), "p");
    expect(await screen.findByText("Search needs a connection.")).toBeInTheDocument();
    expect(mockSearchTrip).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Plan" })).toBeInTheDocument();
  });

  it("outside a Trip there is no Find and no trip pages", async () => {
    const user = userEvent.setup();
    renderField(null);
    await user.type(field(), "p");
    expect(screen.queryByRole("group", { name: "Find" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Plan" })).not.toBeInTheDocument();
    expect(mockSearchTrip).not.toHaveBeenCalled();
  });

  it("shows no ⌘K keycap text anywhere in the field", async () => {
    const user = userEvent.setup();
    const { container } = renderField();
    await user.click(field());
    expect(screen.queryByText("⌘K")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/⌘K|Ctrl K/);
    expect(container.querySelector("kbd")).toBeNull();
  });

  it("has an accessible name containing its visible text (label-in-name)", () => {
    renderField();
    const name = field().getAttribute("aria-label") ?? "";
    expect(name.toLowerCase()).toContain("search or jump");
  });
});

describe("⌘K / Ctrl+K", () => {
  function renderWithMount() {
    return render(
      <>
        <CommandPaletteMount />
        <SearchField tripId="t1" />
      </>,
    );
  }

  it("focuses the sidebar field at ≥1280px instead of opening the dialog", async () => {
    setMatchMedia((q) => q === "(min-width: 1280px)" || q === "(min-width: 640px)");
    const user = userEvent.setup();
    renderWithMount();
    await user.keyboard("{Control>}k{/Control}");
    expect(field()).toHaveFocus();
    expect(screen.queryByRole("textbox", { name: /command search/i })).not.toBeInTheDocument();
  });

  it("opens the full-screen palette below 1280px", async () => {
    const user = userEvent.setup();
    renderWithMount();
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("textbox", { name: /command search/i })).toBeInTheDocument();
  });
});

describe("results panel placement (spec decision 2)", () => {
  it("renders the open panel in document.body, fixed and opaque, not inside the field's own tree", async () => {
    const { container } = renderField();
    const input = screen.getByRole("combobox", { name: "Search or jump" });
    fireEvent.focus(input);
    const panel = document.querySelector("[data-search-panel]") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(container.contains(panel)).toBe(false);
    const cls = panel.className.split(/\s+/);
    expect(cls).toContain("fixed");
    expect(cls).toContain("bg-popover");
    expect(cls).not.toContain("bg-card");
    // aria-controls still points at the listbox inside the portal
    expect(document.getElementById(input.getAttribute("aria-controls")!)).toBeTruthy();
  });

  it("closes the panel when focus leaves the field", () => {
    renderField();
    const input = screen.getByRole("combobox", { name: "Search or jump" });
    fireEvent.focus(input);
    expect(document.querySelector("[data-search-panel]")).toBeTruthy();
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(document.querySelector("[data-search-panel]")).toBeNull();
  });
});
