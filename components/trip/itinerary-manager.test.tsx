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
  reorderStops: vi.fn().mockResolvedValue({ success: true }),
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

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/chapters", () => ({
  createChapter: vi.fn().mockResolvedValue({ success: true }),
  updateChapter: vi.fn().mockResolvedValue({ success: true }),
  reorderChapters: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/components/ui/use-toast", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/ui/use-toast")>();
  return { ...mod, toast: vi.fn() };
});

import { deleteStop, moveStop, firmUpSegment, firmUpTrip } from "@/server/actions/stops";
import { toast } from "@/components/ui/use-toast";
import { ItineraryManager, type ItineraryStop } from "./itinerary-manager";

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
    // A rough stop (no dates) triggers the "Set dates" button
    const stop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    render(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    await user.click(screen.getByRole("button", { name: /set dates/i }));
    // Confirm the dialog
    await user.click(await screen.findByRole("button", { name: /date stops/i }));

    await waitFor(() => {
      expect(firmUpSegment).toHaveBeenCalledWith({ tripId: TRIP_ID, chapterId: null });
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

    await user.click(screen.getByRole("button", { name: /set dates/i }));
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

    await user.click(screen.getByRole("button", { name: /set dates/i }));
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

    const setDatesBtn = screen.getByRole("button", { name: /set dates/i });
    expect(setDatesBtn).not.toBeDisabled();

    await user.click(setDatesBtn);
    // Confirm the dialog so the action begins
    await user.click(await screen.findByRole("button", { name: /date stops/i }));

    // While in-flight, button should be disabled
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /set dates/i })).toBeDisabled();
    });

    // Resolve and check it's re-enabled
    resolveAction({ success: true });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /set dates/i })).not.toBeDisabled();
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
    // ...and we must NOT be stuck on the bare "Sketch your trip" empty state.
    expect(screen.queryByText(/sketch your trip/i)).toBeNull();
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

  it("does NOT render a reorder handle for a scheduled (dated) stop", () => {
    const datedStop = makeStop({
      id: "s-1",
      name: "Berlin",
      arriveDate: "2026-07-01",
      departDate: "2026-07-05",
    });

    render(
      <ItineraryManager {...baseProps} initialStops={[datedStop]} />,
    );

    // No reorder handle for a dated stop
    expect(screen.queryByLabelText(/reorder berlin/i)).toBeNull();
  });

  it("renders no reorder handles when all stops are dated", () => {
    const stops = [
      makeStop({ id: "s-1", name: "Rome", arriveDate: "2026-07-01", departDate: "2026-07-03" }),
      makeStop({ id: "s-2", name: "Milan", arriveDate: "2026-07-03", departDate: "2026-07-06" }),
    ];

    render(
      <ItineraryManager {...baseProps} initialStops={stops} />,
    );

    expect(screen.queryAllByLabelText(/reorder/i)).toHaveLength(0);
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
      expect(firmUpTrip).toHaveBeenCalledWith(TRIP_ID);
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

    // The chapter header has a "Set dates" button
    await user.click(screen.getByRole("button", { name: /set dates/i }));

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

    await user.click(screen.getByRole("button", { name: /set dates/i }));

    // Not called yet
    expect(firmUpSegment).not.toHaveBeenCalled();

    const confirmBtn = await screen.findByRole("button", { name: /date stops/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(firmUpSegment).toHaveBeenCalledWith({ tripId: TRIP_ID, chapterId: "ch-1" });
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

    await user.click(screen.getByRole("button", { name: /set dates/i }));

    const cancelBtn = await screen.findByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);

    expect(firmUpSegment).not.toHaveBeenCalled();
  });
});
