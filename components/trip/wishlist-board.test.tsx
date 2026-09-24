/**
 * Tests for WishlistBoard — Schedule button, List/Map toggle, fork threading,
 * placed-idea markers, edit-dialog cost forwarding, and the Globe suggestions
 * strip. The Unschedule affordance was removed from this component (Task 7):
 * it now lives on the day-view Timeline row instead, so this file also
 * verifies WishlistBoard never renders it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock WishlistMapLoader so Leaflet never touches jsdom.
vi.mock("./wishlist-map-loader", () => ({
  WishlistMapLoader: () => <div data-testid="wishlist-map" />,
}));

// ── Mock server actions ────────────────────────────────────────────────────────
// Must be declared before component imports so vi.mock hoisting works.

vi.mock("@/server/actions/items", () => ({
  deleteItem: vi.fn().mockResolvedValue({ success: true }),
  addMarkerToWishlist: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/votes", () => ({
  setVote: vi.fn().mockResolvedValue({ success: true }),
  clearVote: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn().mockResolvedValue({ success: true }),
  deleteNote: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock heavy child components to keep the test lightweight.
// Task 7: ItemCard no longer takes an onUnschedule prop at all — the real
// Unschedule control now lives on the day-view Timeline row instead, so this
// stub deliberately has nothing left to surface for it.
// Task 11 (phase 3): the "in this plan" marker moved INSIDE the card (the
// kit's "in plan ✓" card), so the board now hands ItemCard `placed` and the
// kit's decorative `tone`; the stub renders both so the board's wiring stays
// pinned here and ItemCard's rendering of them is pinned in item-card.test.
vi.mock("./item-card", () => ({
  ItemCard: ({ item, onSchedule, onEdit, placed, tone }: {
    item: { id: string; title: string };
    onSchedule?: (item: { id: string; title: string }) => void;
    onEdit?: (item: { id: string; title: string }) => void;
    placed?: boolean;
    tone?: string;
  }) => (
    <div data-testid={`stub-card-${item.id}`} data-tone={tone ?? "white"}>
      <span>{item.title}</span>
      {placed && <span data-testid={`placed-marker-${item.id}`}>in this plan</span>}
      {onEdit && (
        <button onClick={() => onEdit(item)}>Edit {item.title}</button>
      )}
      {onSchedule && (
        <button onClick={() => onSchedule(item)}>Schedule {item.title}</button>
      )}
    </div>
  ),
}));

vi.mock("./ai-activity-suggestions", () => ({
  AiActivitySuggestions: () => null,
}));

// Capture props so tests can assert what the dialogs receive.
const lastItemFormDialogProps: Record<string, unknown> = {};
// Reset between tests — see beforeEach below.

vi.mock("./item-form-dialog", () => ({
  ItemFormDialog: (props: Record<string, unknown>) => {
    Object.assign(lastItemFormDialogProps, props);
    return null;
  },
  // Renders its label + variant so the kit's "Add an idea" affordances are visible to tests.
  AddItemButton: ({ label, variant, className }: { label?: string; variant?: string; className?: string }) => (
    <button data-variant={variant ?? "primary"} className={className}>{label ?? "Add Item"}</button>
  ),
}));

// Capture forkId so tests can inspect what was passed to the dialog.
const lastScheduleDialogProps: { forkId?: string | null } = {};

vi.mock("./schedule-item-dialog", () => ({
  ScheduleItemDialog: ({ open, itemTitle, forkId }: { open: boolean; itemTitle: string; forkId?: string | null }) => {
    lastScheduleDialogProps.forkId = forkId;
    return open ? <div role="dialog" aria-label="Schedule Item"><h2>Schedule Item</h2><p>{itemTitle}</p></div> : null;
  },
}));

import type { MarkerView } from "@/components/globe/types";
import { Toaster } from "@/components/ui/toaster";
import { dismissToast } from "@/components/ui/use-toast";
import { WishlistBoard } from "./wishlist-board";
import type { ItemCardItem } from "./item-card";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<ItemCardItem> = {}): ItemCardItem {
  return {
    id: "item-1",
    title: "Eiffel Tower",
    category: "SIGHTSEEING",
    date: "2026-07-10",
    startTime: "10:00",
    endTime: "12:00",
    stopId: "stop-1",
    stopName: "Paris",
    ...overrides,
  };
}

const TRIP_ID = "trip-1";

const baseStop = {
  id: "stop-1",
  name: "Paris",
  arriveDate: "2026-07-10",
  departDate: "2026-07-15",
};

function renderBoard(items: ItemCardItem[]) {
  return render(
    <>
      <Toaster />
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={items}
      />
    </>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  dismissToast(); // reset the module-level toast store between tests
  // Reset captured dialog props.
  for (const key of Object.keys(lastItemFormDialogProps)) {
    delete lastItemFormDialogProps[key];
  }
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WishlistBoard — Unschedule control removed (Task 7)", () => {
  it("never renders an Unschedule affordance — the control now lives on the day-view Timeline row", async () => {
    const item = makeItem();
    renderBoard([item]);

    await screen.findByText(item.title);
    expect(screen.queryByRole("button", { name: /unschedule/i })).not.toBeInTheDocument();
  });
});

describe("WishlistBoard — Schedule button", () => {
  it("renders a Schedule button for an unscheduled wishlist item", async () => {
    const item = makeItem({ id: "item-10", date: null, startTime: null, endTime: null });
    renderBoard([item]);

    expect(await screen.findByRole("button", { name: `Schedule ${item.title}` })).toBeInTheDocument();
  });

  it("opens ScheduleItemDialog when Schedule button is clicked", async () => {
    const user = userEvent.setup();
    const item = makeItem({ id: "item-11", date: null, startTime: null, endTime: null });
    renderBoard([item]);

    const scheduleBtn = await screen.findByRole("button", { name: `Schedule ${item.title}` });
    await user.click(scheduleBtn);

    expect(await screen.findByRole("dialog", { name: "Schedule Item" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Schedule Item" })).toBeInTheDocument();
  });
});

describe("WishlistBoard — List/Map toggle", () => {
  it("defaults to List and reveals the map only when Map is chosen", async () => {
    const user = userEvent.setup();
    render(
      <WishlistBoard
        tripId="t1"
        stops={[]}
        items={[
          { id: "i1", title: "Colosseum", category: "SIGHTSEEING", lat: 41.89, lng: 12.49 },
          { id: "i2", title: "No location", category: "FOOD" },
        ]}
      />,
    );
    // List is the default — map must not be rendered
    expect(screen.queryByTestId("wishlist-map")).not.toBeInTheDocument();
    // Click the Map toggle
    await user.click(screen.getByRole("radio", { name: /map/i }));
    // Map renders
    expect(screen.getByTestId("wishlist-map")).toBeInTheDocument();
    // Unlocated count line
    expect(screen.getByText(/1 not on the map/i)).toBeInTheDocument();
  });
});

describe("WishlistBoard — activeForkId threading to ScheduleItemDialog", () => {
  it("passes activeForkId to ScheduleItemDialog when a fork is active", async () => {
    const user = userEvent.setup();
    const item = makeItem({ id: "item-20", date: null, startTime: null, endTime: null });
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[item]}
        activeForkId="fork-abc"
      />,
    );

    const scheduleBtn = await screen.findByRole("button", { name: `Schedule ${item.title}` });
    await user.click(scheduleBtn);

    await screen.findByRole("dialog", { name: "Schedule Item" });
    expect(lastScheduleDialogProps.forkId).toBe("fork-abc");
  });

  it("passes undefined forkId to ScheduleItemDialog when no fork is active", async () => {
    const user = userEvent.setup();
    const item = makeItem({ id: "item-21", date: null, startTime: null, endTime: null });
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[item]}
      />,
    );

    const scheduleBtn = await screen.findByRole("button", { name: `Schedule ${item.title}` });
    await user.click(scheduleBtn);

    await screen.findByRole("dialog", { name: "Schedule Item" });
    // activeForkId not passed → undefined
    expect(lastScheduleDialogProps.forkId).toBeUndefined();
  });
});

describe("WishlistBoard — placed idea marker", () => {
  it("shows the 'in this plan' marker for ideas in placedIdeaIds", async () => {
    const item = makeItem({ id: "item-30", date: null, startTime: null, endTime: null });
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[item]}
        placedIdeaIds={["item-30"]}
      />,
    );

    expect(await screen.findByTestId("placed-marker-item-30")).toBeInTheDocument();
    expect(screen.getByTestId("placed-marker-item-30")).toHaveTextContent("in this plan");
  });

  it("does not show the marker for ideas NOT in placedIdeaIds", async () => {
    const item = makeItem({ id: "item-31", date: null, startTime: null, endTime: null });
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[item]}
        placedIdeaIds={[]}
      />,
    );

    // Wait for the item to render
    await screen.findByText(item.title);
    expect(screen.queryByTestId("placed-marker-item-31")).not.toBeInTheDocument();
  });

  it("shows marker only for placed ideas when multiple items present", async () => {
    const placed = makeItem({ id: "item-40", title: "Placed Idea", date: null, startTime: null, endTime: null });
    const unplaced = makeItem({ id: "item-41", title: "Unplaced Idea", date: null, startTime: null, endTime: null, stopId: "stop-1", stopName: "Paris" });
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[placed, unplaced]}
        placedIdeaIds={["item-40"]}
      />,
    );

    expect(await screen.findByTestId("placed-marker-item-40")).toBeInTheDocument();
    expect(screen.queryByTestId("placed-marker-item-41")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Fix round 1: caller wiring — homeCurrency + costs forwarded to ItemFormDialog
// ---------------------------------------------------------------------------

describe("WishlistBoard — homeCurrency + costs forwarded to edit dialog", () => {
  it("forwards homeCurrency and costs to ItemFormDialog when editing an item", async () => {
    const user = userEvent.setup();
    const item = makeItem({ id: "item-50", date: null, startTime: null, endTime: null });
    const costs = [
      {
        id: "cost-1",
        costMinor: 4200,
        paidMinor: null,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: null,
        dueDate: null,
        ownerType: "ITEM" as const,
        ownerId: "item-50",
        label: null,
        category: null,
      },
    ];
    const costsByItemId = new Map([["item-50", costs]]);

    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[item]}
        homeCurrency="JPY"
        costsByItemId={costsByItemId}
      />,
    );

    const editBtn = await screen.findByRole("button", { name: `Edit ${item.title}` });
    await user.click(editBtn);

    // ItemFormDialog mock captures props into lastItemFormDialogProps
    expect(lastItemFormDialogProps.homeCurrency).toBe("JPY");
    expect(lastItemFormDialogProps.costs).toEqual(costs);
  });

  it("forwards homeCurrency to ItemFormDialog when editing even without costsByItemId", async () => {
    const user = userEvent.setup();
    const item = makeItem({ id: "item-51", date: null, startTime: null, endTime: null });

    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[item]}
        homeCurrency="GBP"
      />,
    );

    const editBtn = await screen.findByRole("button", { name: `Edit ${item.title}` });
    await user.click(editBtn);

    expect(lastItemFormDialogProps.homeCurrency).toBe("GBP");
    expect(lastItemFormDialogProps.costs).toBeUndefined();
  });
});

describe("WishlistBoard — Globe suggestions strip", () => {
  it("renders the 'Suggested from your Globe' heading when hasGlobe and suggestedMarkers are provided", async () => {
    const oneMarker: MarkerView = {
      id: "m1",
      title: "Senso-ji Temple",
      category: "SIGHTSEEING",
      note: null,
      link: null,
      timing: null,
      lat: 35.71,
      lng: 139.79,
      city: "Tokyo",
      country: "Japan",
      countryCode: "jp",
    };

    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[]}
        hasGlobe={true}
        globeMarkers={[oneMarker]}
        addedMarkerIds={[]}
        suggestedMarkers={[oneMarker]}
      />,
    );

    expect(await screen.findByText(/from your globe/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 11 (phase 3): Wishlist to the Playground kit (DWishlist.jsx / Wishlist.jsx)
// ---------------------------------------------------------------------------

describe("WishlistBoard — Playground kit", () => {
  it("heads the board with the kit's display title and an idea-count badge", () => {
    renderBoard([
      makeItem({ id: "a", title: "One" }),
      makeItem({ id: "b", title: "Two" }),
    ]);
    const h = screen.getByRole("heading", { level: 2, name: "Wishlist" });
    expect(h.className).toMatch(/\bfont-extrabold\b/);
    expect(within(h.parentElement as HTMLElement).getByText("2 ideas")).toBeInTheDocument();
  });

  it("uses the kit's 'Add an idea' copy for the add action", () => {
    renderBoard([makeItem()]);
    expect(screen.getAllByRole("button", { name: "Add an idea" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Add Item" })).not.toBeInTheDocument();
  });

  it("ends the idea grid with the kit's dashed 'Add an idea' tile", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[baseStop]} items={[makeItem({ stopId: null, stopName: null })]} />);
    const dashed = screen
      .getAllByRole("button", { name: "Add an idea" })
      .filter((b) => b.dataset.variant === "dashed");
    expect(dashed).toHaveLength(1);
  });

  it("lays ideas out in the kit's card grid, every second-of-three card in the sun tone", () => {
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={["a", "b", "c", "d", "e"].map((id) => makeItem({ id, title: `Idea ${id}`, stopId: null, stopName: null }))}
      />,
    );
    const tones = ["a", "b", "c", "d", "e"].map((id) => screen.getByTestId(`stub-card-${id}`).dataset.tone);
    expect(tones).toEqual(["white", "sun", "white", "white", "sun"]);
    const grid = screen.getByTestId("stub-card-a").closest("ul");
    expect(grid?.className).toMatch(/\bgrid\b/);
  });

  it("shows the kit's empty state (EmptyState, kit copy, add action) when there are no ideas", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[baseStop]} items={[]} />);
    const title = screen.getByRole("heading", { name: "No ideas yet" });
    const panel = title.closest("div.border-dashed") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(within(panel).getByText("Drop in anything you might want to do. Your people can vote.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Add an idea" })).toBeInTheDocument();
    // One add affordance on an empty board — the EmptyState's.
    expect(screen.getAllByRole("button", { name: "Add an idea" })).toHaveLength(1);
    expect(screen.queryByText(/No items yet/)).not.toBeInTheDocument();
  });

  it("filters the map with kit Chips that report their pressed state", async () => {
    const user = userEvent.setup();
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[makeItem({ lat: 48.85, lng: 2.35 })]}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /map/i }));
    const all = screen.getByRole("button", { name: "All", pressed: true });
    expect(all.className).toMatch(/\bborder-2\b/);
    const paris = screen.getByRole("button", { name: "Paris", pressed: false });
    await user.click(paris);
    expect(screen.getByRole("button", { name: "Paris", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All", pressed: false })).toBeInTheDocument();
  });

  it("renders 'Add from Globe' as a kit secondary Button", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[]} items={[]} hasGlobe />);
    const btn = screen.getByRole("button", { name: "Add from Globe" });
    expect(btn.className).toMatch(/\bborder-2\b/);
    expect(btn.className).toMatch(/\bshadow-hard-1\b/);
  });

  it("offers Globe suggestions as kit Chips with accessible names", () => {
    const marker: MarkerView = {
      id: "m2", title: "Senso-ji Temple", category: "SIGHTSEEING", note: null, link: null, timing: null,
      lat: 35.71, lng: 139.79, city: "Tokyo", country: "Japan", countryCode: "jp",
    };
    render(
      <WishlistBoard tripId={TRIP_ID} stops={[]} items={[]} hasGlobe globeMarkers={[marker]} addedMarkerIds={[]} suggestedMarkers={[marker]} />,
    );
    const chip = screen.getByRole("button", { name: "Add Senso-ji Temple" });
    expect(chip.className).toMatch(/\bborder-2\b/);
    expect(chip.className).not.toMatch(/shadow-soft/);
  });

  // Fix round 1: with ideas but no stops (Globe adds land with stopId null),
  // a phone in list view must still have an add that isn't hidden on mobile.
  it("keeps a mobile-visible 'Add an idea' when there are ideas but no stops", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[]} items={[makeItem({ stopId: null, stopName: null })]} />);
    const adds = screen.getAllByRole("button", { name: "Add an idea" });
    expect(adds.some((b) => !/max-sm:hidden/.test(b.getAttribute("class") ?? ""))).toBe(true);
  });

  // Bug: with a trip that has no stops at all, the List view's stop-grouped
  // section was gated on `stops.length > 0`, so a stop-less idea (stopId
  // null) never rendered even though it belongs in the "Anywhere" group.
  it("renders a stop-less idea in the 'Anywhere' group when the trip has no stops", () => {
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[]}
        items={[makeItem({ id: "item-60", stopId: null, stopName: null, title: "Wander the old town" })]}
      />,
    );
    expect(screen.getByText("Wander the old town")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anywhere" })).toBeInTheDocument();
  });

  it("still renders the empty state exactly once with no ideas and no stops", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[]} items={[]} />);
    expect(screen.getAllByText("No ideas yet")).toHaveLength(1);
  });
});
