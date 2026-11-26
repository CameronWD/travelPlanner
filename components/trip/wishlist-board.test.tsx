/**
 * Tests for WishlistBoard — Schedule button, List/Map toggle, fork threading,
 * placed-idea markers, edit-dialog cost forwarding, and the Globe suggestions
 * strip. The Unschedule affordance was removed from this component (Task 7):
 * it now lives on the day-view Timeline row instead, so this file also
 * verifies WishlistBoard never renders it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, act, waitFor } from "@testing-library/react";
import type { CostRow } from "@/lib/money/cost-row";
import userEvent from "@testing-library/user-event";

// Mock WishlistMapLoader so the map never touches jsdom.
const lastMapLoaderProps: { items?: { id: string }[] } = {};
vi.mock("./wishlist-map-loader", () => ({
  WishlistMapLoader: ({ items }: { items: { id: string }[] }) => {
    lastMapLoaderProps.items = items;
    return <div data-testid="wishlist-map" />;
  },
}));

// ── Mock server actions ────────────────────────────────────────────────────────
// Must be declared before component imports so vi.mock hoisting works.

vi.mock("@/server/actions/items", () => ({
  deleteItem: vi.fn().mockResolvedValue({ success: true }),
  addMarkerToWishlist: vi.fn().mockResolvedValue({ success: true }),
  placeIdeaAtStop: vi.fn().mockResolvedValue({ success: true }),
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
  ItemCard: ({ item, onSchedule, onEdit, onDelete, placed, tone }: {
    item: { id: string; title: string; stopName?: string | null };
    onSchedule?: (item: { id: string; title: string }) => void;
    onEdit?: (item: { id: string; title: string }) => void;
    onDelete?: (itemId: string) => void;
    placed?: boolean;
    tone?: string;
  }) => (
    <div data-testid={`stub-card-${item.id}`} data-tone={tone ?? "white"}>
      <span>{item.title}</span>
      {item.stopName && <span>{item.stopName}</span>}
      {placed && <span data-testid={`placed-marker-${item.id}`}>in this plan</span>}
      {onEdit && (
        <button onClick={() => onEdit(item)}>Edit {item.title}</button>
      )}
      {onSchedule && (
        <button onClick={() => onSchedule(item)}>Schedule {item.title}</button>
      )}
      {onDelete && <button onClick={() => onDelete(item.id)}>Delete {item.title}</button>}
    </div>
  ),
}));

vi.mock("./ai-activity-suggestions", () => ({
  AiActivitySuggestions: () => <div data-testid="ai-suggestions" />,
}));

const lastAddMenuProps: Record<string, unknown> = {};
vi.mock("./wishlist-add-menu", () => ({
  WishlistAddMenu: (props: { variant?: string; className?: string }) => {
    Object.assign(lastAddMenuProps, props);
    return (
      <button data-testid="wishlist-add-menu" data-variant={props.variant ?? "primary"} className={props.className}>
        Add an idea
      </button>
    );
  },
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

// Capture forkId / day options so tests can inspect what was passed to the dialog.
const lastScheduleDialogProps: {
  forkId?: string | null;
  dayOptions?: unknown;
  onAddToThingsToDo?: (stopId: string) => Promise<unknown>;
} = {};

vi.mock("./schedule-item-dialog", () => ({
  ScheduleItemDialog: ({ open, itemTitle, forkId, dayOptions, onAddToThingsToDo }: {
    open: boolean;
    itemTitle: string;
    forkId?: string | null;
    dayOptions?: unknown;
    onAddToThingsToDo?: (stopId: string) => Promise<unknown>;
  }) => {
    lastScheduleDialogProps.forkId = forkId;
    lastScheduleDialogProps.dayOptions = dayOptions;
    lastScheduleDialogProps.onAddToThingsToDo = onAddToThingsToDo;
    return open ? <div role="dialog" aria-label="Schedule Item"><h2>Schedule Item</h2><p>{itemTitle}</p></div> : null;
  },
}));

import type { MarkerView } from "@/components/globe/types";
import { Toaster } from "@/components/ui/toaster";
import { dismissToast } from "@/components/ui/use-toast";
import { WishlistBoard } from "./wishlist-board";
import { placeIdeaAtStop, deleteItem } from "@/server/actions/items";
import type { ItemCardItem } from "./item-card";
import type { VoteView } from "./vote-control";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<ItemCardItem> = {}): ItemCardItem {
  return {
    id: "item-1", bookingStateSet: false, endAddress: null,
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

function renderBoard(items: ItemCardItem[], costsByItemId?: Map<string, CostRow[]>) {
  return render(
    <>
      <Toaster />
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={items}
        costsByItemId={costsByItemId}
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
          { id: "i1", bookingStateSet: false, endAddress: null, title: "Colosseum", category: "SIGHTSEEING", lat: 41.89, lng: 12.49 },
          { id: "i2", bookingStateSet: false, endAddress: null, title: "No location", category: "FOOD" },
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
        forksEnabled
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
        forksEnabled
      />,
    );

    // Wait for the item to render
    await screen.findByText(item.title);
    expect(screen.queryByTestId("placed-marker-item-31")).not.toBeInTheDocument();
  });

  it("shows marker only for placed ideas when multiple items present", async () => {
    const placed = makeItem({ id: "item-40", bookingStateSet: false, endAddress: null, title: "Placed Idea", date: null, startTime: null, endTime: null });
    const unplaced = makeItem({ id: "item-41", bookingStateSet: false, endAddress: null, title: "Unplaced Idea", date: null, startTime: null, endTime: null, stopId: "stop-1", stopName: "Paris" });
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[placed, unplaced]}
        placedIdeaIds={["item-40"]}
        forksEnabled
      />,
    );

    expect(await screen.findByTestId("placed-marker-item-40")).toBeInTheDocument();
    expect(screen.queryByTestId("placed-marker-item-41")).not.toBeInTheDocument();
  });
  it("hides the marker when plan variants are off — 'in this plan' is a Fork affordance", async () => {
    const item = makeItem({ id: "item-32", date: null, startTime: null, endTime: null });
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[baseStop]}
        items={[item]}
        placedIdeaIds={["item-32"]}
        forksEnabled={false}
      />,
    );

    await screen.findByText(item.title);
    expect(screen.queryByTestId("placed-marker-item-32")).not.toBeInTheDocument();
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
        settlement: "BEFORE",
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

describe("WishlistBoard — Globe line", () => {
  it("says how many Globe places are on this route when hasGlobe and suggestedMarkers are provided", async () => {
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

    expect(await screen.findByText("1 place from your Globe is on this route")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See them" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 11 (phase 3): Wishlist to the Playground kit (DWishlist.jsx / Wishlist.jsx)
// ---------------------------------------------------------------------------

describe("WishlistBoard — Playground kit", () => {
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
    // The EmptyState's add, and the phone menu below md.
    expect(screen.getAllByRole("button", { name: "Add an idea" })).toHaveLength(2);
    expect(screen.queryByText(/No items yet/)).not.toBeInTheDocument();
  });

  // Fix round 1: with ideas but no stops (Globe adds land with stopId null),
  // a phone in list view must still have an add that isn't hidden on mobile.
  it("keeps a mobile-visible 'Add an idea' when there are ideas but no stops", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[]} items={[makeItem({ stopId: null, stopName: null })]} />);
    const adds = screen.getAllByRole("button", { name: "Add an idea" });
    expect(adds.some((b) => !/max-sm:hidden/.test(b.getAttribute("class") ?? ""))).toBe(true);
  });

  it("renders a stop-less idea when the trip has no stops", () => {
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[]}
        items={[makeItem({ id: "item-60", stopId: null, stopName: null, title: "Wander the old town" })]}
      />,
    );
    expect(screen.getByText("Wander the old town")).toBeInTheDocument();
  });

  it("still renders the empty state exactly once with no ideas and no stops", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[]} items={[]} />);
    expect(screen.getAllByText("No ideas yet")).toHaveLength(1);
  });
});

describe("WishlistBoard — one grid with Near a Stop chips", () => {
  const ROME = { id: "rome", name: "Rome", arriveDate: "2026-09-01", departDate: "2026-09-04", lat: 41.9, lng: 12.5 };
  const PARIS = { id: "paris", name: "Paris", arriveDate: "2026-09-05", departDate: "2026-09-08", lat: 48.86, lng: 2.35 };
  const idea = (id: string, title: string, coords: { lat?: number; lng?: number } = {}) =>
    makeItem({ id, title, date: null, startTime: null, endTime: null, stopId: null, stopName: null, ...coords });
  const COLOSSEUM = idea("col", "Colosseum", { lat: 41.89, lng: 12.49 });
  const LOUVRE = idea("lou", "Louvre", { lat: 48.861, lng: 2.336 });
  const SENSO_JI = idea("sen", "Senso-ji", { lat: 35.71, lng: 139.79 });
  const RAMEN = idea("ram", "Ramen somewhere");
  const FILTER = { name: "Filter ideas by where they are" };
  const vote = (level: "MUST" | "KEEN" | "MEH"): VoteView => ({
    userId: "u1", level, user: { id: "u1", name: "Cam", image: null },
  });
  const cardIds = () => screen.getAllByTestId(/^stub-card-/).map((c) => c.dataset.testid!.replace("stub-card-", ""));

  it("every idea is in one list, best voted first, with no Stop headings", () => {
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[ROME, PARIS]}
        items={[COLOSSEUM, LOUVRE, RAMEN]}
        votesByItemId={new Map([["ram", [vote("MUST")]], ["lou", [vote("KEEN")]]])}
        aiConfigured
      />,
    );
    expect(cardIds()).toEqual(["ram", "lou", "col"]);
    const lists = new Set(screen.getAllByTestId(/^stub-card-/).map((c) => c.closest("ul")));
    expect(lists.size).toBe(1);
    expect(screen.queryByRole("heading", { name: "Rome" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Paris" })).not.toBeInTheDocument();
    expect(screen.queryByText("Not tied to a stop yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 ideas/)).not.toBeInTheDocument();
  });

  it("chips: All, Near Rome, Elsewhere", async () => {
    const user = userEvent.setup();
    render(<WishlistBoard tripId={TRIP_ID} stops={[ROME]} items={[COLOSSEUM, RAMEN]} />);
    const group = screen.getByRole("group", FILTER);
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["All", "Near Rome", "Elsewhere"]);
    const all = within(group).getByRole("button", { name: "All", pressed: true });
    expect(all.className).toMatch(/\bborder-2\b/);

    await user.click(within(group).getByRole("button", { name: "Near Rome" }));
    await waitFor(() => expect(cardIds()).toEqual(["col"]));
    expect(within(group).getByRole("button", { name: "Near Rome", pressed: true })).toBeInTheDocument();

    await user.click(within(group).getByRole("button", { name: "All" }));
    expect(cardIds()).toEqual(["col", "ram"]);
  });

  it("no chips when there is nothing to choose between", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[ROME]} items={[RAMEN, SENSO_JI]} />);
    expect(screen.queryByRole("group", FILTER)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
  });

  it("a card says what it is near", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[ROME]} items={[COLOSSEUM, RAMEN]} />);
    expect(within(screen.getByTestId("stub-card-col")).getByText("Near Rome")).toBeInTheDocument();
    expect(within(screen.getByTestId("stub-card-ram")).queryByText(/Near/)).not.toBeInTheDocument();
  });

  it("the chips filter the map view too", async () => {
    const user = userEvent.setup();
    render(<WishlistBoard tripId={TRIP_ID} stops={[ROME]} items={[COLOSSEUM, SENSO_JI, RAMEN]} />);
    await user.click(screen.getByRole("radio", { name: /map/i }));
    expect(lastMapLoaderProps.items?.map((i) => i.id)).toEqual(["col", "sen"]);
    await user.click(within(screen.getByRole("group", FILTER)).getByRole("button", { name: "Near Rome" }));
    expect(lastMapLoaderProps.items?.map((i) => i.id)).toEqual(["col"]);
  });

  it("when the chosen chip empties, the filter returns to All", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <WishlistBoard tripId={TRIP_ID} stops={[ROME, PARIS]} items={[COLOSSEUM, LOUVRE, RAMEN]} />,
    );
    await user.click(within(screen.getByRole("group", FILTER)).getByRole("button", { name: "Near Rome" }));
    await waitFor(() => expect(cardIds()).toEqual(["col"]));

    rerender(<WishlistBoard tripId={TRIP_ID} stops={[ROME, PARIS]} items={[LOUVRE, RAMEN]} />);
    const group = screen.getByRole("group", FILTER);
    expect(within(group).getByRole("button", { name: "All", pressed: true })).toBeInTheDocument();
    expect(within(group).queryByRole("button", { name: "Near Rome" })).not.toBeInTheDocument();
    await waitFor(() => expect(cardIds()).toEqual(["lou", "ram"]));
  });

  it("below md the add menu is a full-width button under the grid", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[ROME]} items={[COLOSSEUM]} aiConfigured />);
    const menus = screen.getAllByTestId("wishlist-add-menu");
    expect(menus).toHaveLength(1);
    expect(menus[0].dataset.variant).toBe("secondary");
    expect(menus[0].className).toMatch(/\bmd:hidden\b/);
    expect(menus[0].className).toMatch(/\bw-full\b/);
    expect(lastAddMenuProps).toMatchObject({ tripId: TRIP_ID, aiConfigured: true });
    const grid = screen.getByTestId("stub-card-col").closest("ul")!;
    expect(grid.compareDocumentPosition(menus[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    render(<WishlistBoard tripId={TRIP_ID} stops={[ROME]} items={[]} />);
    expect(screen.getByTestId("wishlist-add-menu").className).toMatch(/\bmd:hidden\b/);
  });

  it("no AI suggestion rows on the board", () => {
    render(<WishlistBoard tripId={TRIP_ID} stops={[ROME, PARIS]} items={[COLOSSEUM]} aiConfigured />);
    expect(screen.queryByTestId("ai-suggestions")).not.toBeInTheDocument();
  });
});

describe("WishlistBoard — Schedule offers that place's days (spec 2026-10-05 §E)", () => {
  // `stops` (every Plan's, unfiltered) and `planStops` (the current Plan's)
  // deliberately disagree, so the test proves which one the dialog reads.
  const REAL_ROME = { id: "real-rome", name: "Rome", arriveDate: "2026-09-01", departDate: "2026-09-02" };
  const FORK_ROME = { id: "fork-rome", name: "Rome", lat: 41.9, lng: 12.5, arriveDate: "2026-09-19", departDate: "2026-09-21" };
  const FLORENCE_ROUGH = { id: "flo", name: "Florence", lat: 43.77, lng: 11.25, arriveDate: null, departDate: null };
  const COLOSSEUM = makeItem({ id: "idea-col", bookingStateSet: false, endAddress: null, title: "Colosseum", date: null, startTime: null, endTime: null, stopId: null, stopName: null, lat: 41.89, lng: 12.49 });
  const UFFIZI = makeItem({
    id: "idea-uff", title: "Uffizi", date: null, startTime: null, endTime: null, stopId: null, stopName: null, bookingStateSet: false, endAddress: null,
    lat: 43.768, lng: 11.255, address: "Piazzale degli Uffizi", link: "https://uffizi.it", notes: "Book ahead",
  });

  it("hands the dialog day options built from the current Plan's Stops (Fork active)", async () => {
    const user = userEvent.setup();
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[REAL_ROME]}
        planStops={[FORK_ROME]}
        items={[COLOSSEUM]}
        activeForkId="fork-abc"
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Schedule Colosseum" }));
    await screen.findByRole("dialog", { name: "Schedule Item" });
    expect(lastScheduleDialogProps.dayOptions).toEqual({
      near: true,
      roughStop: null,
      stays: [{ stopId: "fork-rome", stopName: "Rome", days: ["2026-09-19", "2026-09-20", "2026-09-21"] }],
    });
  });

  it("no planStops → no day options (the plain date field)", async () => {
    const user = userEvent.setup();
    render(<WishlistBoard tripId={TRIP_ID} stops={[REAL_ROME]} items={[COLOSSEUM]} />);
    await user.click(await screen.findByRole("button", { name: "Schedule Colosseum" }));
    await screen.findByRole("dialog", { name: "Schedule Item" });
    expect(lastScheduleDialogProps.dayOptions).toBeUndefined();
  });

  // Controller ruling R1 (task-16 brief): the brief's `createItem` path would
  // drop the idea's source link, photo and share-hidden flag, and re-geocode
  // its coordinates — so "Add to things to do" calls `placeIdeaAtStop`
  // (Task 15), which copies those fields intact, instead.
  it("Add to a rough Stop's things to do calls placeIdeaAtStop (R1)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toaster />
        <WishlistBoard
          tripId={TRIP_ID}
          stops={[REAL_ROME]}
          planStops={[FLORENCE_ROUGH, FORK_ROME]}
          items={[UFFIZI]}
          activeForkId="fork-abc"
        />
      </>,
    );
    await user.click(await screen.findByRole("button", { name: "Schedule Uffizi" }));
    await screen.findByRole("dialog", { name: "Schedule Item" });
    expect(lastScheduleDialogProps.dayOptions).toMatchObject({ roughStop: { id: "flo", name: "Florence" } });

    await act(async () => {
      await lastScheduleDialogProps.onAddToThingsToDo!("flo");
    });
    expect(placeIdeaAtStop).toHaveBeenCalledWith("idea-uff", "flo", "fork-abc");
    expect(await screen.findByText("Added to Florence's things to do")).toBeInTheDocument();
  });

  it("Add to a rough Stop's things to do with no active fork calls placeIdeaAtStop with undefined forkId", async () => {
    render(
      <>
        <Toaster />
        <WishlistBoard
          tripId={TRIP_ID}
          stops={[REAL_ROME]}
          planStops={[FLORENCE_ROUGH]}
          items={[UFFIZI]}
        />
      </>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Schedule Uffizi" }));
    await screen.findByRole("dialog", { name: "Schedule Item" });

    await act(async () => {
      await lastScheduleDialogProps.onAddToThingsToDo!("flo");
    });
    expect(placeIdeaAtStop).toHaveBeenCalledWith("idea-uff", "flo", undefined);
  });
});

describe("WishlistBoard — delete failures (spec 2026-10-06 §E)", () => {
  it("toasts the server's reason when deleteItem refuses", async () => {
    vi.mocked(deleteItem).mockResolvedValueOnce({ success: false, errors: { _: ["That idea was already removed."] } });
    const user = userEvent.setup();
    const item = makeItem({ id: "item-del", date: null, startTime: null, endTime: null });
    renderBoard([item]);
    await user.click(await screen.findByRole("button", { name: `Delete ${item.title}` }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("That idea was already removed.")).toBeInTheDocument();
  });
});

describe("WishlistBoard — deleting a paid idea", () => {
  it("asks what happened to the money and sends the answer", async () => {
    const user = userEvent.setup();
    const item = makeItem({ id: "item-paid", date: null, startTime: null, endTime: null });
    const paid = { id: "c-paid", costMinor: 23521, paidMinor: 23521, currency: "AUD", rateToHome: null, paidAt: new Date("2026-11-01"), dueDate: null, ownerType: "ITEM", ownerId: "item-paid", label: "Fare", category: null, settlement: "BEFORE" } as CostRow;
    renderBoard([item], new Map([["item-paid", [paid]]]));
    await user.click(await screen.findByRole("button", { name: `Delete ${item.title}` }));
    await user.click(await screen.findByRole("radio", { name: /Refund expected/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(deleteItem).toHaveBeenCalledWith("item-paid", [{ costId: "c-paid", refundMinor: 23521, refundedAt: null }]),
    );
  });

  it("keeps the plain confirmation when nothing was paid", async () => {
    const user = userEvent.setup();
    const item = makeItem({ id: "item-free", date: null, startTime: null, endTime: null });
    renderBoard([item]);
    await user.click(await screen.findByRole("button", { name: `Delete ${item.title}` }));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteItem).toHaveBeenCalledWith("item-free"));
  });
});

describe("WishlistBoard — delete in flight", () => {
  it("marks the idea's card busy while its delete runs", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(deleteItem).mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    const user = userEvent.setup();
    const item = makeItem({ id: "item-busy", date: null, startTime: null, endTime: null });
    renderBoard([item]);
    const card = await screen.findByTestId("stub-card-item-busy");
    expect(card.closest("[aria-busy]")).toBeNull();
    await user.click(await screen.findByRole("button", { name: `Delete ${item.title}` }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(card.closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    await act(async () => resolve({ success: true }));
    expect(card.closest("[aria-busy]")).toBeNull();
  });
});
