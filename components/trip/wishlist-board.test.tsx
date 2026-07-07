/**
 * Tests for WishlistBoard — focused on the undo-toast after unscheduling an item.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock WishlistMapLoader so Leaflet never touches jsdom.
vi.mock("./wishlist-map-loader", () => ({
  WishlistMapLoader: () => <div data-testid="wishlist-map" />,
}));

// ── Mock server actions ────────────────────────────────────────────────────────
// Must be declared before component imports so vi.mock hoisting works.

vi.mock("@/server/actions/items", () => ({
  deleteItem: vi.fn().mockResolvedValue({ success: true }),
  unscheduleItem: vi.fn().mockResolvedValue({ success: true }),
  scheduleItem: vi.fn().mockResolvedValue({ success: true }),
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
// ItemCard is mocked so we can expose an "Unschedule" button directly —
// the real card only renders it in mode="scheduled" but the handler lives
// in WishlistBoard. We stub the card to surface the action for testing.
vi.mock("./item-card", () => ({
  ItemCard: ({ item, onUnschedule, onSchedule, onEdit }: {
    item: { id: string; title: string };
    onUnschedule?: (id: string) => void;
    onSchedule?: (item: { id: string; title: string }) => void;
    onEdit?: (item: { id: string; title: string }) => void;
  }) => (
    <div>
      <span>{item.title}</span>
      {onEdit && (
        <button onClick={() => onEdit(item)}>Edit {item.title}</button>
      )}
      {onSchedule && (
        <button onClick={() => onSchedule(item)}>Schedule {item.title}</button>
      )}
      {onUnschedule && (
        <button onClick={() => onUnschedule(item.id)}>Unschedule</button>
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
  AddItemButton: () => null,
}));

// Capture forkId so tests can inspect what was passed to the dialog.
const lastScheduleDialogProps: { forkId?: string | null } = {};

vi.mock("./schedule-item-dialog", () => ({
  ScheduleItemDialog: ({ open, itemTitle, forkId }: { open: boolean; itemTitle: string; forkId?: string | null }) => {
    lastScheduleDialogProps.forkId = forkId;
    return open ? <div role="dialog" aria-label="Schedule item"><h2>Schedule item</h2><p>{itemTitle}</p></div> : null;
  },
}));

import { unscheduleItem, scheduleItem } from "@/server/actions/items";
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

describe("WishlistBoard — unschedule undo-toast", () => {
  it("shows a 'Moved to Wishlist' toast with Undo after unscheduling", async () => {
    const user = userEvent.setup();
    const item = makeItem();
    renderBoard([item]);

    const unscheduleBtn = await screen.findByRole("button", { name: "Unschedule" });
    await user.click(unscheduleBtn);

    await waitFor(() => {
      expect(screen.getByText("Moved to Wishlist")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("calls scheduleItem with the prior date and times when Undo is clicked", async () => {
    const user = userEvent.setup();
    const item = makeItem({
      id: "item-2",
      date: "2026-07-12",
      startTime: "09:00",
      endTime: "11:00",
    });
    renderBoard([item]);

    const unscheduleBtn = await screen.findByRole("button", { name: "Unschedule" });
    await user.click(unscheduleBtn);

    const undoBtn = await screen.findByRole("button", { name: "Undo" });
    await user.click(undoBtn);

    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith("item-2", {
        date: "2026-07-12",
        startTime: "09:00",
        endTime: "11:00",
      });
    });
  });

  it("calls scheduleItem with only date when item has no times", async () => {
    const user = userEvent.setup();
    const item = makeItem({
      id: "item-3",
      date: "2026-07-13",
      startTime: null,
      endTime: null,
    });
    renderBoard([item]);

    const unscheduleBtn = await screen.findByRole("button", { name: "Unschedule" });
    await user.click(unscheduleBtn);

    const undoBtn = await screen.findByRole("button", { name: "Undo" });
    await user.click(undoBtn);

    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith("item-3", {
        date: "2026-07-13",
      });
    });
  });

  it("calls unscheduleItem with the item id", async () => {
    const user = userEvent.setup();
    const item = makeItem({ id: "item-4" });
    renderBoard([item]);

    const unscheduleBtn = await screen.findByRole("button", { name: "Unschedule" });
    await user.click(unscheduleBtn);

    await waitFor(() => {
      expect(unscheduleItem).toHaveBeenCalledWith("item-4");
    });
  });

  it("does not show a toast when unscheduleItem fails", async () => {
    const user = userEvent.setup();
    vi.mocked(unscheduleItem).mockResolvedValueOnce({ success: false, errors: { date: ["Server error"] } });
    const item = makeItem({ id: "item-5" });
    renderBoard([item]);

    const unscheduleBtn = await screen.findByRole("button", { name: "Unschedule" });
    await user.click(unscheduleBtn);

    // Give time for async operations
    await waitFor(() => {
      expect(unscheduleItem).toHaveBeenCalledWith("item-5");
    });

    // Toast should NOT appear on failure
    expect(screen.queryByText("Moved to Wishlist")).not.toBeInTheDocument();
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

    expect(await screen.findByRole("dialog", { name: "Schedule item" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Schedule item" })).toBeInTheDocument();
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

    await screen.findByRole("dialog", { name: "Schedule item" });
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

    await screen.findByRole("dialog", { name: "Schedule item" });
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
        estimatedMinor: 4200,
        actualMinor: null,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: null,
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

    expect(await screen.findByRole("heading", { name: /suggested from your globe/i })).toBeInTheDocument();
  });
});
