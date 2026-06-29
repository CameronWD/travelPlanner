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
  setStopDates: vi.fn().mockResolvedValue({ success: true }),
  toggleStopPin: vi.fn().mockResolvedValue({ success: true }),
  makeStopRough: vi.fn().mockResolvedValue({ success: true }),
  createStop: vi.fn().mockResolvedValue({ success: true }),
  updateStop: vi.fn().mockResolvedValue({ success: true }),
  assignStopToChapter: vi.fn().mockResolvedValue({ success: true }),
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
}));

vi.mock("@/components/ui/use-toast", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/ui/use-toast")>();
  return { ...mod, toast: vi.fn() };
});

import { deleteStop, moveStop, firmUpSegment } from "@/server/actions/stops";
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
  // Default: user always confirms the browser dialog
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// 1. Delete confirmation gating
// ---------------------------------------------------------------------------

describe("delete confirmation gating", () => {
  it("does NOT call deleteStop when the confirm dialog is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    const stop = makeStop({ id: "stop-abc", name: "Rome" });

    render(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    // The delete button has aria-label "Delete {name}"
    await user.click(screen.getByRole("button", { name: "Delete Rome" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(deleteStop).not.toHaveBeenCalled();
  });

  it("calls deleteStop with the stop id when the confirm dialog is accepted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    const stop = makeStop({ id: "stop-abc", name: "Rome" });

    render(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Rome" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(deleteStop).toHaveBeenCalledWith("stop-abc");
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Reorder wiring
// ---------------------------------------------------------------------------

describe("reorder controls", () => {
  it("calls moveStop(stopId, 'down') when the move-down button is clicked", async () => {
    const user = userEvent.setup();
    // Two stops so neither is first-and-last simultaneously (otherwise both buttons disabled)
    const stopA = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    const stopB = makeStop({ id: "s-2", name: "Berlin", sortOrder: 1 });

    render(
      <ItineraryManager {...baseProps} initialStops={[stopA, stopB]} />,
    );

    // Paris is first (not last) → move-down button should be enabled
    // jsdom renders both the inline (sm:flex) and the overflow menu (sm:hidden),
    // so there may be multiple buttons. Use getAllByRole and take the first one.
    const moveDownButtons = screen.getAllByRole("button", { name: "Move Paris down" });
    await user.click(moveDownButtons[0]);

    await waitFor(() => {
      expect(moveStop).toHaveBeenCalledWith("s-1", "down");
    });
  });

  it("calls moveStop(stopId, 'up') when the move-up button is clicked", async () => {
    const user = userEvent.setup();
    const stopA = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    const stopB = makeStop({ id: "s-2", name: "Berlin", sortOrder: 1 });

    render(
      <ItineraryManager {...baseProps} initialStops={[stopA, stopB]} />,
    );

    // Berlin is last (not first) → move-up button should be enabled
    const moveUpButtons = screen.getAllByRole("button", { name: "Move Berlin up" });
    await user.click(moveUpButtons[0]);

    await waitFor(() => {
      expect(moveStop).toHaveBeenCalledWith("s-2", "up");
    });
  });

  it("move-up is disabled for the first stop", () => {
    const stop = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    render(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    // Both inline and overflow menu buttons should be disabled
    const upButtons = screen.getAllByRole("button", { name: "Move Paris up" });
    for (const btn of upButtons) {
      expect(btn).toBeDisabled();
    }
  });

  it("move-down is disabled for the last stop", () => {
    const stop = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    render(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    const downButtons = screen.getAllByRole("button", { name: "Move Paris down" });
    for (const btn of downButtons) {
      expect(btn).toBeDisabled();
    }
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
    vi.spyOn(window, "confirm").mockReturnValue(true);

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
