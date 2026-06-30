/**
 * Tests for WishlistBoard — focused on the undo-toast after unscheduling an item.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock server actions ────────────────────────────────────────────────────────
// Must be declared before component imports so vi.mock hoisting works.

vi.mock("@/server/actions/items", () => ({
  deleteItem: vi.fn().mockResolvedValue({ success: true }),
  unscheduleItem: vi.fn().mockResolvedValue({ success: true }),
  scheduleItem: vi.fn().mockResolvedValue({ success: true }),
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
  ItemCard: ({ item, onUnschedule, onSchedule }: {
    item: { id: string; title: string };
    onUnschedule?: (id: string) => void;
    onSchedule?: (item: { id: string; title: string }) => void;
  }) => (
    <div>
      <span>{item.title}</span>
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

vi.mock("./item-form-dialog", () => ({
  ItemFormDialog: () => null,
  AddItemButton: () => null,
}));

vi.mock("./schedule-item-dialog", () => ({
  ScheduleItemDialog: ({ open, itemTitle }: { open: boolean; itemTitle: string }) =>
    open ? <div role="dialog" aria-label="Schedule item"><h2>Schedule item</h2><p>{itemTitle}</p></div> : null,
}));

import { unscheduleItem, scheduleItem } from "@/server/actions/items";
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
