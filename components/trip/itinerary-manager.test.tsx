/**
 * Focused tests for ItineraryManager — highest-risk flows only:
 *  1. Delete confirmation gating (stop)
 *  2. Reorder wiring (moveStop up/down)
 *  3. Firm-up "Set dates" → firmUpSegment + conflict toast
 *  4. Optimistic pending state while action is in-flight
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock all server actions the component (and its children) import ──────────
// Must be declared before the component import so vi.mock hoisting works.

vi.mock("@/server/actions/stops", () => ({
  deleteStop: vi.fn().mockResolvedValue({ success: true }),
  moveStop: vi.fn().mockResolvedValue({ success: true }),
  firmUpSegment: vi.fn().mockResolvedValue({ success: true }),
  firmUpTrip: vi.fn().mockResolvedValue({ success: true }),
  setStopDates: vi.fn().mockResolvedValue({ success: true }),
  toggleStopPin: vi.fn().mockResolvedValue({ success: true }),
  makeStopRough: vi.fn().mockResolvedValue({ success: true }),
  createStop: vi.fn().mockResolvedValue({ success: true }),
  updateStop: vi.fn().mockResolvedValue({ success: true }),
  assignStopToChapter: vi.fn().mockResolvedValue({ success: true }),
  reorderStops: vi.fn().mockResolvedValue({ success: true, changed: [], conflicts: [] }),
  restoreStops: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/transport", () => ({
  deleteTransport: vi.fn().mockResolvedValue({ success: true }),
  createTransport: vi.fn().mockResolvedValue({ success: true }),
  updateTransport: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/accommodation", () => ({
  deleteAccommodation: vi.fn().mockResolvedValue({ success: true }),
  createAccommodation: vi.fn().mockResolvedValue({ success: true }),
  updateAccommodation: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn().mockResolvedValue({ success: true }),
  deleteNote: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ success: true }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/chapters", () => ({
  createChapter: vi.fn().mockResolvedValue({ success: true }),
  updateChapter: vi.fn().mockResolvedValue({ success: true }),
  reorderChapters: vi.fn().mockResolvedValue({ success: true }),
  deleteChapter: vi.fn().mockResolvedValue({ success: true }),
}));

// StopCard now imports ItemFormDialog which calls createItem/updateItem.
vi.mock("@/server/actions/items", () => ({
  createItem: vi.fn().mockResolvedValue({ success: true }),
  updateItem: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/components/ui/use-toast", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/ui/use-toast")>();
  return { ...mod, toast: vi.fn() };
});

import { deleteStop, moveStop, firmUpSegment, firmUpTrip, createStop } from "@/server/actions/stops";
import { createTransport } from "@/server/actions/transport";
import { createAccommodation } from "@/server/actions/accommodation";
import { createChapter, deleteChapter } from "@/server/actions/chapters";
import { toast } from "@/components/ui/use-toast";
import { ItineraryManager, summariseReorder, type ItineraryStop } from "./itinerary-manager";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStop(overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id: "stop-1",
    name: "Paris",
    country: "France",
    timezone: null,
    arriveDate: null,
    departDate: null,
    nights: 3,
    pinned: false,
    chapterId: null,
    chapterSortOrder: 0,
    sortOrder: 0,
    notes: null,
    lat: null,
    lng: null,
    accommodations: [],
    ...overrides,
  };
}

const TRIP_ID = "trip-1";

const baseProps = {
  tripId: TRIP_ID,
  initialTransports: [],
  chapters: [],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Delete confirmation gating
// ---------------------------------------------------------------------------

describe("delete confirmation gating", () => {
  it("does NOT call deleteStop when the confirm dialog is cancelled", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "stop-abc", name: "Rome" });

    render(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    // The delete button has aria-label "Delete {name}"
    await user.click(screen.getByRole("button", { name: "Delete Rome" }));

    // Dialog should appear — click Cancel
    const cancelBtn = await screen.findByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    expect(deleteStop).not.toHaveBeenCalled();
  });

  it("calls deleteStop with the stop id when the confirm dialog is accepted", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "stop-abc", name: "Rome" });

    render(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Rome" }));

    // Dialog should appear — click Delete
    const deleteBtn = await screen.findByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(deleteStop).toHaveBeenCalledWith("stop-abc");
    });
  });

  it("shows the stop name in the delete dialog title", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "stop-abc", name: "Rome" });

    render(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Rome" }));

    // Dialog title contains the stop name in quotes
    expect(await screen.findByText(/Delete "Rome"\?/)).toBeInTheDocument();
  });

  it("shows the stop name in the make-rough dialog title", async () => {
    const user = userEvent.setup();
    // A dated stop has a "Make rough" action in the overflow menu
    const stop = makeStop({
      id: "stop-abc",
      name: "Venice",
      arriveDate: "2026-08-01",
      departDate: "2026-08-05",
    });

    render(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    // Open overflow menu and click Make rough (two overflow buttons exist: mobile + desktop)
    const overflowBtns = screen.getAllByRole("button", { name: "More actions for Venice" });
    await user.click(overflowBtns[0]);
    await user.click(await screen.findByRole("menuitem", { name: /make rough/i }));

    // Dialog title contains the stop name in quotes
    expect(await screen.findByText(/Make "Venice" rough again\?/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Reorder wiring
// ---------------------------------------------------------------------------

describe("reorder controls", () => {
  it("calls moveStop(stopId, 'down') when the move-down overflow item is clicked", async () => {
    const user = userEvent.setup();
    // Two stops so neither is first-and-last simultaneously (otherwise both buttons disabled)
    const stopA = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    const stopB = makeStop({ id: "s-2", name: "Berlin", sortOrder: 1 });

    render(
      <ItineraryManager {...baseProps} initialStops={[stopA, stopB]} />,
    );

    // Inline desktop arrows are retired. Reorder is now in the overflow menu (rough stops only).
    // Open the Paris overflow menu and click "Move down".
    await user.click(screen.getByRole("button", { name: "More actions for Paris" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move down" }));

    await waitFor(() => {
      expect(moveStop).toHaveBeenCalledWith("s-1", "down");
    });
  });

  it("calls moveStop(stopId, 'up') when the move-up overflow item is clicked", async () => {
    const user = userEvent.setup();
    const stopA = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    const stopB = makeStop({ id: "s-2", name: "Berlin", sortOrder: 1 });

    render(
      <ItineraryManager {...baseProps} initialStops={[stopA, stopB]} />,
    );

    // Berlin is last (not first) → move-up item should be enabled.
    await user.click(screen.getByRole("button", { name: "More actions for Berlin" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move up" }));

    await waitFor(() => {
      expect(moveStop).toHaveBeenCalledWith("s-2", "up");
    });
  });

  it("move-up overflow item is disabled for the first stop", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    render(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    await user.click(screen.getByRole("button", { name: "More actions for Paris" }));
    const upItem = await screen.findByRole("menuitem", { name: "Move up" });
    expect(upItem).toHaveAttribute("data-disabled");
  });

  it("move-down overflow item is disabled for the last stop", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    render(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    await user.click(screen.getByRole("button", { name: "More actions for Paris" }));
    const downItem = await screen.findByRole("menuitem", { name: "Move down" });
    expect(downItem).toHaveAttribute("data-disabled");
  });
});

// ---------------------------------------------------------------------------
// 3. Firm-up / Set dates → firmUpSegment + conflict path
// ---------------------------------------------------------------------------

describe("firm-up (Set dates)", () => {
  it("calls firmUpSegment with tripId and chapterId=null for ungrouped rough stops", async () => {
    const user = userEvent.setup();
    // A rough stop (no dates) triggers the per-segment "Set dates" button
    const stop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    // Use exact match to distinguish from the prominent "Set dates for all stops" button
    await user.click(screen.getByRole("button", { name: /^set dates$/i }));
    // Confirm the dialog
    await user.click(await screen.findByRole("button", { name: /date stops/i }));

    await waitFor(() => {
      expect(firmUpSegment).toHaveBeenCalledWith({ tripId: TRIP_ID, chapterId: null, forkId: undefined });
    });
  });

  it("surfaces a toast when firmUpSegment returns conflicts", async () => {
    // Override to return a conflict
    vi.mocked(firmUpSegment).mockResolvedValueOnce({
      success: true,
      conflicts: [{ stopId: "s-1", message: "Pinned date collision" }],
    });

    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    // Use exact match to distinguish from the prominent "Set dates for all stops" button
    await user.click(screen.getByRole("button", { name: /^set dates$/i }));
    // Confirm the dialog
    await user.click(await screen.findByRole("button", { name: /date stops/i }));

    await waitFor(() => {
      expect(firmUpSegment).toHaveBeenCalled();
    });

    // The component calls toast({ title: "Heads up — ..." }) on conflicts
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/heads up/i),
      }),
    );
  });

  it("shows a destructive toast when firmUpSegment returns an anchorDate error", async () => {
    vi.mocked(firmUpSegment).mockResolvedValueOnce({
      success: false,
      errors: { anchorDate: ["Pick a start date for this leg first."] },
    });

    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    // Use exact match to distinguish from the prominent "Set dates for all stops" button
    await user.click(screen.getByRole("button", { name: /^set dates$/i }));
    // Confirm the dialog
    await user.click(await screen.findByRole("button", { name: /date stops/i }));

    await waitFor(() => {
      expect(firmUpSegment).toHaveBeenCalled();
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Optimistic pending state
// ---------------------------------------------------------------------------

describe("optimistic pending state", () => {
  it("disables the firm-up button while the action is in flight and re-enables after", async () => {
    let resolveAction!: (v: { success: true }) => void;
    const pendingPromise = new Promise<{ success: true }>((res) => {
      resolveAction = res;
    });
    vi.mocked(firmUpSegment).mockReturnValueOnce(pendingPromise);

    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    // Use exact match to target the per-segment "Set dates" (not "Set dates for all stops")
    const setDatesBtn = screen.getByRole("button", { name: /^set dates$/i });
    expect(setDatesBtn).not.toBeDisabled();

    await user.click(setDatesBtn);
    // Confirm the dialog so the action begins
    await user.click(await screen.findByRole("button", { name: /date stops/i }));

    // While in-flight, button should be disabled
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^set dates$/i })).toBeDisabled();
    });

    // Resolve and check it's re-enabled
    resolveAction({ success: true });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^set dates$/i })).not.toBeDisabled();
    });
  });

  it("stop card enters pending state (pointer-events-none) while deleteStop is in flight", async () => {
    let resolveDelete!: (v: { success: true }) => void;
    const pendingPromise = new Promise<{ success: true }>((res) => {
      resolveDelete = res;
    });
    vi.mocked(deleteStop).mockReturnValueOnce(pendingPromise);

    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris" });

    const { container } = render(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Paris" }));

    // Confirm the dialog
    const deleteBtn = await screen.findByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    // While in-flight, the StopCard root div gets pointer-events-none AND the delete button is disabled
    await waitFor(() => {
      const card = container.querySelector(".pointer-events-none");
      expect(card).not.toBeNull();
      expect(screen.getByRole("button", { name: "Delete Paris" })).toBeDisabled();
    });

    resolveDelete({ success: true });

    await waitFor(() => {
      expect(container.querySelector(".pointer-events-none")).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Rough chapters on an empty trip
//    Regression: a date-less chapter must be visible (and accept rough stops)
//    even before any stop exists, instead of being hidden behind the empty state.
// ---------------------------------------------------------------------------

describe("rough chapters with no stops yet", () => {
  it("renders a date-less chapter even when the trip has zero stops", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[
          { id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 },
        ]}
      />,
    );

    // The chapter must be visible so rough stops can be added into it...
    expect(screen.getByText("France")).toBeInTheDocument();
    // ...and we must NOT be stuck on the bare "Add your first Stop" empty state.
    expect(screen.queryByRole("heading", { name: /add your first stop/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5b. Empty-state heading when there are zero stops and no chapters
// ---------------------------------------------------------------------------

describe("zero-stops empty state", () => {
  it("renders the EmptyState heading 'Add your first Stop' when there are no stops and no chapters", () => {
    render(
      <ItineraryManager {...baseProps} initialStops={[]} chapters={[]} />,
    );
    expect(
      screen.getByRole("heading", { name: /add your first stop/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. Drag handle smoke tests
// ---------------------------------------------------------------------------

describe("drag handle rendering", () => {
  it("renders a reorder handle for a rough stop (no dates)", () => {
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(
      <ItineraryManager {...baseProps} initialStops={[roughStop]} />,
    );

    // The SortableStop wrapper renders a grip button with aria-label "Reorder <name>"
    expect(screen.getByLabelText(/reorder paris/i)).toBeInTheDocument();
  });

  it("renders a reorder handle for a scheduled (dated) stop (ADR 0021)", () => {
    // ADR 0021 reverses the old ADR 0014 rough-only rule: dated stops are
    // draggable now, so they carry a reorder handle too.
    const datedStop = makeStop({
      id: "s-1",
      name: "Berlin",
      arriveDate: "2026-07-01",
      departDate: "2026-07-05",
    });

    render(
      <ItineraryManager {...baseProps} initialStops={[datedStop]} />,
    );

    expect(screen.getByLabelText(/reorder berlin/i)).toBeInTheDocument();
  });

  it("renders a reorder handle on every stop when all stops are dated (ADR 0021)", () => {
    const stops = [
      makeStop({ id: "s-1", name: "Rome", arriveDate: "2026-07-01", departDate: "2026-07-03" }),
      makeStop({ id: "s-2", name: "Milan", arriveDate: "2026-07-03", departDate: "2026-07-06" }),
    ];

    render(
      <ItineraryManager {...baseProps} initialStops={stops} />,
    );

    expect(screen.queryAllByLabelText(/reorder/i)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Whole-trip firm-up confirm dialog
// ---------------------------------------------------------------------------

describe("whole-trip firm-up confirm dialog", () => {
  it("opens a confirm dialog with rough-stop count when 'Date all stops from start' is clicked", async () => {
    const user = userEvent.setup();
    const roughStop1 = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });
    const roughStop2 = makeStop({ id: "s-2", name: "Berlin", arriveDate: null, departDate: null, sortOrder: 1 });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop1, roughStop2]}
        tripStartDate="2026-08-01"
      />,
    );

    await user.click(screen.getByRole("button", { name: /date all stops from start/i }));

    // Dialog should appear with rough count in its content
    expect(await screen.findByText(/2 rough stop/i)).toBeInTheDocument();
  });

  it("fires firmUpTrip only after the user confirms", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        tripStartDate="2026-08-01"
      />,
    );

    await user.click(screen.getByRole("button", { name: /date all stops from start/i }));

    // firmUpTrip should NOT have been called yet
    expect(firmUpTrip).not.toHaveBeenCalled();

    // Confirm the dialog
    const confirmBtn = await screen.findByRole("button", { name: /date stops/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(firmUpTrip).toHaveBeenCalledWith(TRIP_ID, undefined, undefined);
    });
  });

  it("does NOT fire firmUpTrip when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        tripStartDate="2026-08-01"
      />,
    );

    await user.click(screen.getByRole("button", { name: /date all stops from start/i }));

    const cancelBtn = await screen.findByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);

    expect(firmUpTrip).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 9. Chapter collapse localStorage persistence
// ---------------------------------------------------------------------------

describe("chapter collapse localStorage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes collapsed chapter ids to localStorage on toggle", async () => {
    const user = userEvent.setup();
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[
          { id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 },
        ]}
      />,
    );

    // Click the chapter header to collapse it
    const collapseBtn = screen.getByRole("button", { name: /france chapter.*collapse/i });
    await user.click(collapseBtn);

    const stored = localStorage.getItem("itinerary-collapse:trip-1");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed).toContain("ch-1");
  });

  it("hydrates collapse state from localStorage on mount", () => {
    // Pre-populate localStorage before render
    localStorage.setItem("itinerary-collapse:trip-1", JSON.stringify(["ch-1"]));

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[
          { id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 },
        ]}
      />,
    );

    // Chapter header should report collapsed (aria-expanded="false")
    const collapseBtn = screen.getByRole("button", { name: /france chapter.*expand/i });
    expect(collapseBtn).toHaveAttribute("aria-expanded", "false");
  });
});

// ---------------------------------------------------------------------------
// 8. Per-chapter firm-up confirm dialog
// ---------------------------------------------------------------------------

describe("per-chapter firm-up confirm dialog", () => {
  it("opens a confirm dialog with the chapter rough-stop count when 'Set dates' is clicked on a rough chapter", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({
      id: "s-1",
      name: "Lyon",
      arriveDate: null,
      departDate: null,
      chapterId: "ch-1",
    });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        chapters={[{ id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 }]}
      />,
    );

    // The chapter header has a "Set dates" button (exact match, not the prominent "Set dates for all stops")
    await user.click(screen.getByRole("button", { name: /^set dates$/i }));

    // Dialog should appear with rough count
    expect(await screen.findByText(/1 rough stop/i)).toBeInTheDocument();
  });

  it("fires firmUpSegment only after the user confirms per-chapter dialog", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({
      id: "s-1",
      name: "Lyon",
      arriveDate: null,
      departDate: null,
      chapterId: "ch-1",
    });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        chapters={[{ id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 }]}
      />,
    );

    // Use exact match to target the per-chapter "Set dates" (not "Set dates for all stops")
    await user.click(screen.getByRole("button", { name: /^set dates$/i }));

    // Not called yet
    expect(firmUpSegment).not.toHaveBeenCalled();

    const confirmBtn = await screen.findByRole("button", { name: /date stops/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(firmUpSegment).toHaveBeenCalledWith({ tripId: TRIP_ID, chapterId: "ch-1", forkId: undefined });
    });
  });

  it("does NOT fire firmUpSegment when the per-chapter dialog is cancelled", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({
      id: "s-1",
      name: "Lyon",
      arriveDate: null,
      departDate: null,
      chapterId: "ch-1",
    });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        chapters={[{ id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 }]}
      />,
    );

    // Use exact match to target the per-chapter "Set dates" (not "Set dates for all stops")
    await user.click(screen.getByRole("button", { name: /^set dates$/i }));

    const cancelBtn = await screen.findByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);

    expect(firmUpSegment).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 10. Fork-aware action forwarding
// ---------------------------------------------------------------------------

const FORK_ID = "fork-abc";

describe("fork-aware firmUpSegment", () => {
  it("calls firmUpSegment with forkId when ItineraryManager has forkId prop", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[stop]}
        forkId={FORK_ID}
      />,
    );

    // Use exact match to target the per-segment "Set dates" (not "Set dates for all stops")
    await user.click(screen.getByRole("button", { name: /^set dates$/i }));
    await user.click(await screen.findByRole("button", { name: /date stops/i }));

    await waitFor(() => {
      expect(firmUpSegment).toHaveBeenCalledWith({
        tripId: TRIP_ID,
        chapterId: null,
        forkId: FORK_ID,
      });
    });
  });
});

describe("fork-aware firmUpTrip", () => {
  it("calls firmUpTrip with forkId as the third arg when ItineraryManager has forkId prop", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[stop]}
        forkId={FORK_ID}
        tripStartDate="2026-08-01"
      />,
    );

    await user.click(screen.getByRole("button", { name: /date all stops from start/i }));
    await user.click(await screen.findByRole("button", { name: /date stops/i }));

    await waitFor(() => {
      expect(firmUpTrip).toHaveBeenCalledWith(TRIP_ID, undefined, FORK_ID);
    });
  });
});

describe("fork-aware createStop", () => {
  it("calls createStop with forkId when the Add stop dialog is submitted with a forkId prop", async () => {
    const user = userEvent.setup();

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop()]}
        forkId={FORK_ID}
      />,
    );

    // Open Add stop dialog via the "Add stop" button
    await user.click(screen.getByRole("button", { name: /^add stop$/i }));

    // Fill in the stop name (required)
    const nameInput = await screen.findByPlaceholderText(/e\.g\. London/i);
    await user.type(nameInput, "Berlin");

    // Submit the form
    await user.click(screen.getByRole("button", { name: /^add stop$/i, hidden: false }));

    await waitFor(() => {
      expect(createStop).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ name: "Berlin" }),
        FORK_ID,
      );
    });
  });
});

describe("fork-aware createChapter", () => {
  it("calls createChapter with forkId when the New chapter dialog is submitted with a forkId prop", async () => {
    const user = userEvent.setup();

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        forkId={FORK_ID}
      />,
    );

    // Open New chapter dialog (in the empty state action buttons)
    await user.click(screen.getByRole("button", { name: /new chapter/i }));

    // Fill in the chapter name (required)
    const nameInput = await screen.findByPlaceholderText(/e\.g\. France/i);
    await user.type(nameInput, "Germany");

    // Submit the form
    const submitBtn = screen.getByRole("button", { name: /^add chapter$/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createChapter).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ name: "Germany" }),
        undefined, // originStopId
        FORK_ID,
      );
    });
  });
});

describe("fork-aware createTransport", () => {
  it("calls createTransport with forkId when the Add transport dialog is submitted with a forkId prop", async () => {
    const user = userEvent.setup();

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop()]}
        forkId={FORK_ID}
      />,
    );

    // Open transport dialog via the "Add transport (other)" button
    await user.click(screen.getByRole("button", { name: /add transport \(other\)/i }));

    // The form has a mode select; FLIGHT is the default so we can submit directly.
    // Fill in the dep place to satisfy some minimal input.
    const submitBtn = await screen.findByRole("button", { name: /^add transport$/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createTransport).toHaveBeenCalledWith(
        TRIP_ID,
        expect.anything(),
        FORK_ID,
      );
    });
  });
});

describe("fork-aware createAccommodation", () => {
  it("calls createAccommodation with forkId when the Add accommodation dialog is submitted with a forkId prop", async () => {
    const user = userEvent.setup();

    // Need a dated stop to show the "Add accommodation" button
    const datedStop = makeStop({
      id: "s-dated",
      name: "Vienna",
      arriveDate: "2026-08-01",
      departDate: "2026-08-05",
    });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[datedStop]}
        forkId={FORK_ID}
      />,
    );

    // Open the add accommodation dialog
    await user.click(screen.getByRole("button", { name: /add accommodation/i }));

    // Fill in the name (required)
    const nameInput = await screen.findByPlaceholderText(/e\.g\. Hilton/i);
    await user.type(nameInput, "Hotel Berlin");

    // Submit
    await user.click(screen.getByRole("button", { name: /^add accommodation$/i }));

    await waitFor(() => {
      expect(createAccommodation).toHaveBeenCalledWith(
        expect.objectContaining({ stopId: "s-dated", name: "Hotel Berlin" }),
        FORK_ID,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// 12. Delete/remove chapter — empty chapter card
// ---------------------------------------------------------------------------

describe("empty chapter remove control", () => {
  const emptyChapter = {
    id: "ch-empty",
    name: "Asia",
    colour: "rose" as const,
    startDate: null,
    endDate: null,
    sortOrder: 0,
  };

  it("renders a 'Remove Asia chapter' button on an empty chapter card", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[emptyChapter]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Remove Asia chapter" }),
    ).toBeInTheDocument();
  });

  it("does NOT call deleteChapter when the confirm dialog is cancelled", async () => {
    const user = userEvent.setup();

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[emptyChapter]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Asia chapter" }));

    const cancelBtn = await screen.findByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    expect(deleteChapter).not.toHaveBeenCalled();
  });

  it("calls deleteChapter with the chapter id when confirmed", async () => {
    const user = userEvent.setup();

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[emptyChapter]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Asia chapter" }));

    const removeBtn = await screen.findByRole("button", { name: "Remove" });
    await user.click(removeBtn);

    await waitFor(() => {
      expect(deleteChapter).toHaveBeenCalledWith("ch-empty");
    });
  });
});

// ---------------------------------------------------------------------------
// Task 10: draggable scheduled entities + Undo toast (ADR 0021)
//
// jsdom has no layout engine and dnd-kit pointer dragging can't be simulated
// with real coordinates, so the RAW pointer gesture is left to manual
// verification. Here we assert the wiring that makes a scheduled drag possible:
//   - dated stops now carry a drag handle (SortableStop is applied to ALL stops)
//   - dated chapter headers now carry a drag handle (SortableChapterHeader)
//   - the pure toast-summary helper used on the scheduled drop path
// ---------------------------------------------------------------------------

describe("Task 10: scheduled entities are draggable (wiring)", () => {
  it("renders a reorder drag handle on a DATED (scheduled) stop", () => {
    const dated = makeStop({
      id: "d-1",
      name: "Venice",
      arriveDate: "2026-08-01",
      departDate: "2026-08-05",
    });

    render(<ItineraryManager {...baseProps} initialStops={[dated]} />);

    // SortableStop provides an aria-label="Reorder {name}" grip button.
    // Previously only rough stops got this; ADR 0021 gives it to dated stops too.
    expect(
      screen.getByRole("button", { name: "Reorder Venice" }),
    ).toBeInTheDocument();
  });

  it("renders a reorder drag handle on a DATED chapter header", () => {
    const datedChapter = {
      id: "ch-dated",
      name: "Italy",
      colour: "rose" as const,
      startDate: "2026-08-01",
      endDate: "2026-08-10",
      sortOrder: 0,
    };
    const dated = makeStop({
      id: "d-1",
      name: "Venice",
      arriveDate: "2026-08-01",
      departDate: "2026-08-05",
      chapterId: "ch-dated",
    });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[dated]}
        chapters={[datedChapter]}
      />,
    );

    // A populated dated chapter now gets a "Reorder chapter" handle in its header.
    expect(
      screen.getByRole("button", { name: "Reorder chapter" }),
    ).toBeInTheDocument();
  });

  it("still renders a reorder drag handle on a ROUGH stop (unchanged)", () => {
    const rough = makeStop({ id: "r-1", name: "Paris", arriveDate: null, departDate: null });
    render(<ItineraryManager {...baseProps} initialStops={[rough]} />);
    expect(
      screen.getByRole("button", { name: "Reorder Paris" }),
    ).toBeInTheDocument();
  });
});

describe("Task 10: summariseReorder (Undo toast copy)", () => {
  it("names the moved entity and the count of shifted stops (plural)", () => {
    const { title, description } = summariseReorder(
      "Florence",
      [
        { id: "a", arriveDate: "2026-07-10", departDate: "2026-07-13" },
        { id: "b", arriveDate: "2026-07-13", departDate: "2026-07-15" },
      ],
      [],
    );
    expect(title).toBe("Moved Florence; 2 stops had dates shifted");
    expect(description).toBeUndefined();
  });

  it("uses the singular 'stop' for a single shifted date", () => {
    const { title } = summariseReorder(
      "Rome",
      [{ id: "a", arriveDate: "2026-07-10", departDate: "2026-07-13" }],
      [],
    );
    expect(title).toBe("Moved Rome; 1 stop had dates shifted");
  });

  it("omits the shift clause when nothing shifted", () => {
    const { title } = summariseReorder("Rome", [], []);
    expect(title).toBe("Moved Rome");
  });

  it("adds a pinned-conflict note to the description when a pin no longer fits", () => {
    const { description } = summariseReorder(
      "Rome",
      [{ id: "a", arriveDate: "2026-07-10", departDate: "2026-07-13" }],
      [{ stopId: "p", message: "pin can't fit" }],
    );
    expect(description).toMatch(/pinned stop no longer fits/i);
    expect(description).toMatch(/flags/i);
  });
});

// ---------------------------------------------------------------------------
// Task 12: Prominent whole-trip firm-up control at the top of the plan editor
// ---------------------------------------------------------------------------

describe("Task 12: prominent firm-up control at top of plan editor", () => {
  it("renders a prominent 'Set dates for all stops' button at the top when rough stops exist", () => {
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(
      <ItineraryManager {...baseProps} initialStops={[roughStop]} />,
    );

    // The prominent button must be present in the DOM
    expect(
      screen.getByRole("button", { name: /set dates for all stops/i }),
    ).toBeInTheDocument();
  });

  it("does NOT render the prominent 'Set dates for all stops' button when all stops are dated", () => {
    const datedStop = makeStop({
      id: "s-1",
      name: "Paris",
      arriveDate: "2026-08-01",
      departDate: "2026-08-05",
    });

    render(
      <ItineraryManager {...baseProps} initialStops={[datedStop]} />,
    );

    expect(
      screen.queryByRole("button", { name: /set dates for all stops/i }),
    ).not.toBeInTheDocument();
  });

  it("fires firmUpTrip after the confirm dialog is accepted via the prominent button", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        tripStartDate="2026-08-01"
      />,
    );

    await user.click(screen.getByRole("button", { name: /set dates for all stops/i }));

    // Not called yet — confirm dialog gates the action
    expect(firmUpTrip).not.toHaveBeenCalled();

    const confirmBtn = await screen.findByRole("button", { name: /date stops/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(firmUpTrip).toHaveBeenCalledWith(TRIP_ID, undefined, undefined);
    });
  });

  it("does NOT fire firmUpTrip when the prominent button confirm dialog is cancelled", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(
      <ItineraryManager {...baseProps} initialStops={[roughStop]} />,
    );

    await user.click(screen.getByRole("button", { name: /set dates for all stops/i }));

    const cancelBtn = await screen.findByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);

    expect(firmUpTrip).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Home base bookend fixtures
// ---------------------------------------------------------------------------

function makeTransport(overrides: Partial<import("./itinerary-manager").ItineraryTransport> = {}): import("./itinerary-manager").ItineraryTransport {
  return {
    id: "tr-1",
    mode: "FLIGHT",
    fromStopId: null,
    toStopId: null,
    depIsHome: false,
    arrIsHome: false,
    depPlace: null,
    arrPlace: null,
    depAt: null,
    arrAt: null,
    reference: null,
    notes: null,
    sortOrder: 0,
    costs: [],
    ...overrides,
  };
}

describe("home base bookends", () => {
  it("renders a Home base card at the top when a home base is set", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Paris" })]}
        homeBaseName="Sydney"
        roundTrip={false}
      />,
    );
    expect(screen.getByText(/Trip starts here/i)).toBeInTheDocument();
    expect(screen.getByText("Sydney")).toBeInTheDocument();
  });

  it("does NOT render a Home base card when no home base is set", () => {
    render(
      <ItineraryManager {...baseProps} initialStops={[makeStop({ id: "s1", name: "Paris" })]} />,
    );
    expect(screen.queryByText(/Trip starts here/i)).not.toBeInTheDocument();
  });

  it("prompts to add the outbound flight when the home base has no outbound leg yet", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Paris" })]}
        homeBaseName="Sydney"
        roundTrip={false}
      />,
    );
    expect(screen.getByRole("button", { name: /add transport to Paris/i })).toBeInTheDocument();
  });

  it("renders the outbound leg as a bookend (not in the 'Other transport' box)", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Paris" })]}
        initialTransports={[makeTransport({ id: "out", depIsHome: true, toStopId: "s1" })]}
        homeBaseName="Sydney"
        roundTrip={false}
      />,
    );
    // The outbound leg exists → no "add outbound" prompt, and no "Other transport" section.
    expect(screen.queryByRole("button", { name: /add transport to Paris/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Other transport/i)).not.toBeInTheDocument();
  });

  it("renders a bottom Home base card + return prompt on a round trip", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Paris" })]}
        homeBaseName="Sydney"
        roundTrip={true}
      />,
    );
    expect(screen.getByText(/Trip ends here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add transport home to Sydney/i })).toBeInTheDocument();
  });

  it("omits the bottom Home base card on a one-way trip", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Paris" })]}
        homeBaseName="Sydney"
        roundTrip={false}
      />,
    );
    expect(screen.queryByText(/Trip ends here/i)).not.toBeInTheDocument();
  });
});
