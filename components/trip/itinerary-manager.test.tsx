/**
 * Focused tests for ItineraryManager — highest-risk flows only:
 *  1. Delete confirmation gating (stop)
 *  2. Reorder wiring (moveStop up/down)
 *  3. Firm-up "Firm up" → firmUpSegment + conflict toast
 *  4. Optimistic pending state while action is in-flight
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock all server actions the component (and its children) import ──────────
// Must be declared before the component import so vi.mock hoisting works.

vi.mock("@/server/actions/stops", () => ({
  deleteStop: vi.fn().mockResolvedValue({ success: true }),
  // ARCH-DAT-4: DeleteStopDialog fetches this preview on open. Default to an
  // empty (no-losses) preview so the existing plain-confirm-style tests below
  // keep exercising the "no loss list" branch unless a test overrides it.
  previewStopDeletion: vi.fn().mockResolvedValue({
    success: true,
    preview: { accommodations: [], unpaidCosts: [], attachmentCount: 0, noteCount: 0 },
  }),
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
  reorderTransports: vi.fn().mockResolvedValue({ success: true }),
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
  assignStopToChapter: vi.fn().mockResolvedValue({ success: true }),
  suggestChaptersFromCountries: vi.fn().mockResolvedValue({ success: true, created: 0 }),
}));

// Task 7: StopCard's "Add a reminder" menu item opens AddReminderDialog,
// which calls this.
vi.mock("@/server/actions/reminders", () => ({
  addReminder: vi.fn().mockResolvedValue({ success: true, id: "rem-new" }),
}));

// The plan components import ItemFormDialog (createItem/updateItem) and call
// scheduleItem/rescheduleItem/unscheduleItem for the day-aware plan editor.
vi.mock("@/server/actions/items", () => ({
  createItem: vi.fn().mockResolvedValue({ success: true }),
  updateItem: vi.fn().mockResolvedValue({ success: true }),
  scheduleItem: vi.fn().mockResolvedValue({ success: true }),
  unscheduleItem: vi.fn().mockResolvedValue({ success: true }),
  rescheduleItem: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/votes", () => ({ upsertVote: vi.fn(), deleteVote: vi.fn() }));
// Day rows call setDayTitle (Task 5) — stub it so these
// tests don't hit the real server action (which imports lib/db → Postgres).
vi.mock("@/server/actions/day-titles", () => ({
  setDayTitle: vi.fn().mockResolvedValue({ success: true }),
}));
// Task 9's Item dialog Photo field imports these — stub so rendering it
// doesn't hit the real server action (which imports lib/db → Postgres).
vi.mock("@/server/actions/item-photo", () => ({
  setItemPhoto: vi.fn().mockResolvedValue({ success: true, attachmentId: "att-new-1" }),
  removeItemPhoto: vi.fn().mockResolvedValue({ success: true }),
}));
// Task 20's transport sheet renders AiBookingParser when "Paste a booking" is
// clicked — stub it at the component boundary (matching plan-header-actions'
// mock) so it doesn't pull in the real server action (which imports lib/db →
// Postgres).
vi.mock("@/components/trip/ai-booking-parser", () => ({
  AiBookingParser: () => <div data-testid="ai-booking-parser" />,
}));

// Task 6 added a useRouter() call to StopCard (used to refresh after
// schedule/unschedule/reschedule actions). jsdom has no app router mounted,
// so it must be mocked.
// Stands in for the Add a stop sheet's place search (it would geocode over the network).
vi.mock("@/components/ui/place-combobox", () => ({
  PlaceCombobox: (p: { value: string; onValueChange: (t: string) => void; onPick: (x: unknown) => void }) => (
    <div>
      <input aria-label="Place" value={p.value} onChange={(e) => p.onValueChange(e.target.value)} />
      <button type="button" onClick={() => p.onPick({ name: "Berlin", region: "Berlin, Germany", lat: 52.52, lng: 13.4, countryCode: "de" })}>pick Berlin</button>
    </div>
  ),
}));

const { navState, routerReplaceMock } = vi.hoisted(() => ({
  navState: { search: "" },
  routerReplaceMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: routerReplaceMock }),
  usePathname: () => "/trips/trip-1/plan",
  useSearchParams: () => new URLSearchParams(navState.search),
}));

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/ui/undo-toast", () => ({ toastWithUndo: vi.fn() }));

vi.mock("@/components/ui/use-toast", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/ui/use-toast")>();
  return { ...mod, toast: vi.fn() };
});

// jsdom has no layout engine, so a real dnd-kit pointer/keyboard gesture can't
// be simulated with real coordinates (see the "Task 10: scheduled entities are
// draggable" describe block below). To still exercise the actual production
// handleDragEnd (rather than just asserting a source snippet exists), wrap the
// real DndContext to capture the onDragEnd callback the component wires up to
// it, so a test can invoke it directly with a synthetic DragEndEvent — this
// bypasses dnd-kit's sensor/coordinate machinery entirely rather than trying
// (and failing) to simulate it.
const dndCapture = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: unknown) => void | Promise<void>) | undefined,
  onDragOver: undefined as ((event: unknown) => void) | undefined,
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      dndCapture.onDragEnd = props.onDragEnd as (event: unknown) => void | Promise<void>;
      dndCapture.onDragOver = props.onDragOver as (event: unknown) => void;
      const ActualDndContext = actual.DndContext;
      return <ActualDndContext {...props} />;
    },
  };
});

import type * as React from "react";
import { deleteStop, moveStop, firmUpSegment, firmUpTrip, createStop, reorderStops } from "@/server/actions/stops";
import { createTransport, deleteTransport } from "@/server/actions/transport";
import { createAccommodation } from "@/server/actions/accommodation";
import { addReminder } from "@/server/actions/reminders";
import { createChapter, deleteChapter, assignStopToChapter, suggestChaptersFromCountries } from "@/server/actions/chapters";
import { toast } from "@/components/ui/use-toast";
import { ItineraryManager, summariseReorder, undoPayloadFor, type ItineraryStop, type ItineraryTransport } from "./itinerary-manager";
import { PlanBody, usePlanBody } from "@/components/plan/plan-body";

/** The desktop list — every stop, leg and bookend query goes through it (Task 17 adds a mobile twin). */
const desktop = () => within(screen.getByTestId("plan-desktop-list"));
/** Stands in for the Plan header's Add a stop (PlanHeaderActions), which reaches the manager through PlanBody. */
function HeaderAddStop() {
  const { actions } = usePlanBody();
  return <button onClick={actions.addStop}>header add</button>;
}

function renderPlan(ui: React.ReactElement, open: string[] = []) {
  return render(<PlanBody initialOpen={open} today="2030-01-01">{ui}</PlanBody>);
}

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

// Shared fixtures for the desktop/mobile list describes (Task 17 moved these
// to file scope so the mobile list tests can reuse them verbatim).
const PARIS = makeStop({ id: "par", name: "Paris", arriveDate: "2026-12-10", departDate: "2026-12-15", timezone: "Europe/Paris", sortOrder: 0 });
const ROME = makeStop({ id: "rom", name: "Rome", arriveDate: "2026-12-15", departDate: "2026-12-22", timezone: "Europe/Rome", sortOrder: 1 });

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  navState.search = "";
});

// ---------------------------------------------------------------------------
// 1. Delete confirmation gating
// ---------------------------------------------------------------------------

describe("delete confirmation gating", () => {
  it("does NOT call deleteStop when the confirm dialog is cancelled", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "stop-abc", name: "Rome" });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    // Delete lives in the Stop card's overflow menu as "Delete {name}"
    await user.click(desktop().getByRole("button", { name: "More actions for Rome" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Delete Rome/ }));

    // Dialog should appear — click Cancel
    const cancelBtn = await screen.findByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    expect(deleteStop).not.toHaveBeenCalled();
  });

  it("calls deleteStop with the stop id when the confirm dialog is accepted", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "stop-abc", name: "Rome" });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    await user.click(desktop().getByRole("button", { name: "More actions for Rome" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Delete Rome/ }));

    // Dialog should appear — click Delete
    const deleteBtn = await screen.findByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(deleteStop).toHaveBeenCalledWith("stop-abc");
    });
  });

  it("ARCH-DAT-1: surfaces the server refusal as a toast when deleteStop resolves success:false", async () => {
    // deleteStop never throws on an authorisation refusal (ARCH-DAT-1b) — it
    // resolves { success: false, errors }. Regression test for the handler
    // silently swallowing that: a stale page (rendered isOwner=true before a
    // role change) still shows the control, but the server still refuses.
    const user = userEvent.setup();
    const stop = makeStop({ id: "stop-abc", name: "Rome" });
    vi.mocked(deleteStop).mockResolvedValueOnce({
      success: false,
      errors: { _: ["Only the trip owner can delete a Stop."] },
    });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    await user.click(desktop().getByRole("button", { name: "More actions for Rome" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Delete Rome/ }));
    const deleteBtn = await screen.findByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Only the trip owner can delete a Stop.",
        }),
      );
    });
    // The refusal must not be treated as a successful delete: the Stop stays.
    expect(desktop().getByRole("heading", { name: "Rome" })).toBeInTheDocument();
  });

  it("ARCH-DAT-1: hides the Delete Stop control for a non-owner", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "stop-abc", name: "Rome" });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[stop]} isOwner={false} />,
    );

    expect(desktop().queryByRole("button", { name: /^Delete Rome/ })).not.toBeInTheDocument();
    await user.click(desktop().getByRole("button", { name: "More actions for Rome" }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^Delete Rome/ })).not.toBeInTheDocument();
  });

  it("shows the stop name in the delete dialog title", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "stop-abc", name: "Rome" });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    await user.click(desktop().getByRole("button", { name: "More actions for Rome" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Delete Rome/ }));

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

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    // Open the Stop card's overflow menu and click Make rough
    await user.click(desktop().getByRole("button", { name: "More actions for Venice" }));
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

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[stopA, stopB]} />,
    );

    // Inline desktop arrows are retired. Reorder is now in the overflow menu (rough stops only).
    // Open the Paris overflow menu and click "Move down".
    await user.click(desktop().getByRole("button", { name: "More actions for Paris" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move down" }));

    await waitFor(() => {
      expect(moveStop).toHaveBeenCalledWith("s-1", "down");
    });
  });

  it("calls moveStop(stopId, 'up') when the move-up overflow item is clicked", async () => {
    const user = userEvent.setup();
    const stopA = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    const stopB = makeStop({ id: "s-2", name: "Berlin", sortOrder: 1 });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[stopA, stopB]} />,
    );

    // Berlin is last (not first) → move-up item should be enabled.
    await user.click(desktop().getByRole("button", { name: "More actions for Berlin" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move up" }));

    await waitFor(() => {
      expect(moveStop).toHaveBeenCalledWith("s-2", "up");
    });
  });

  it("move-up overflow item is disabled for the first stop", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    renderPlan(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    await user.click(desktop().getByRole("button", { name: "More actions for Paris" }));
    const upItem = await screen.findByRole("menuitem", { name: "Move up" });
    expect(upItem).toHaveAttribute("data-disabled");
  });

  it("move-down overflow item is disabled for the last stop", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", sortOrder: 0 });
    renderPlan(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    await user.click(desktop().getByRole("button", { name: "More actions for Paris" }));
    const downItem = await screen.findByRole("menuitem", { name: "Move down" });
    expect(downItem).toHaveAttribute("data-disabled");
  });
});

// ---------------------------------------------------------------------------
// 3. Firm up → firmUpSegment + conflict path
// ---------------------------------------------------------------------------

const ROUGH_CHAPTER = { id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 };

// The ungrouped per-segment "Firm up" is gone (deviation 7); a rough chapter
// divider carries its own "Firm up" pill.
describe("firm-up (Firm up)", () => {
  const roughInChapter = () => makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null, chapterId: "ch-1" });

  it("surfaces a toast when firmUpSegment returns conflicts", async () => {
    vi.mocked(firmUpSegment).mockResolvedValueOnce({
      success: true,
      conflicts: [{ stopId: "s-1", message: "Pinned date collision" }],
    });

    const user = userEvent.setup();
    renderPlan(<ItineraryManager {...baseProps} initialStops={[roughInChapter()]} chapters={[ROUGH_CHAPTER]} />);

    await user.click(desktop().getByRole("button", { name: /^firm up$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^firm up$/i }));

    await waitFor(() => {
      expect(firmUpSegment).toHaveBeenCalledWith({ tripId: TRIP_ID, chapterId: "ch-1", forkId: undefined });
    });
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
    renderPlan(<ItineraryManager {...baseProps} initialStops={[roughInChapter()]} chapters={[ROUGH_CHAPTER]} />);

    await user.click(desktop().getByRole("button", { name: /^firm up$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^firm up$/i }));

    await waitFor(() => {
      expect(firmUpSegment).toHaveBeenCalled();
    });
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
      }),
    );
  });

  it("offers no ungrouped per-segment Firm up — the top row's 'Firm up all stops' covers it", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[makeStop({ arriveDate: null, departDate: null })]} />);
    expect(desktop().queryByRole("button", { name: /^firm up$/i })).toBeNull();
    expect(desktop().getByRole("button", { name: "Firm up all stops" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Optimistic pending state
// ---------------------------------------------------------------------------

describe("optimistic pending state", () => {
  it("disables 'Firm up all stops' while the action is in flight and re-enables after", async () => {
    let resolveAction!: (v: { success: true }) => void;
    const pendingPromise = new Promise<{ success: true }>((res) => {
      resolveAction = res;
    });
    vi.mocked(firmUpTrip).mockReturnValueOnce(pendingPromise);

    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    const firmUpBtn = desktop().getByRole("button", { name: "Firm up all stops" });
    expect(firmUpBtn).not.toBeDisabled();

    await user.click(firmUpBtn);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^firm up$/i }));

    await waitFor(() => {
      expect(desktop().getByRole("button", { name: /firm up all stops/i })).toBeDisabled();
    });

    resolveAction({ success: true });

    await waitFor(() => {
      expect(desktop().getByRole("button", { name: "Firm up all stops" })).not.toBeDisabled();
    });
  });

  it("delete-stop dialog's own Delete button enters a pending state while deleteStop is in flight", async () => {
    // ARCH-DAT-4: the delete confirmation is now DeleteStopDialog (it fetches
    // a loss preview before deleting), so the in-flight indicator moved from
    // the StopCard row itself (the old plain useConfirm flow) to the dialog's
    // own Delete button — same place PromoteForkDialog shows its spinner.
    let resolveDelete!: (v: { success: true }) => void;
    const pendingPromise = new Promise<{ success: true }>((res) => {
      resolveDelete = res;
    });
    vi.mocked(deleteStop).mockReturnValueOnce(pendingPromise);

    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris" });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[stop]} />,
    );

    await user.click(desktop().getByRole("button", { name: "More actions for Paris" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Delete Paris/ }));

    // Confirm the dialog
    const dialog = await screen.findByRole("dialog");
    const deleteBtn = within(dialog).getByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    // While in-flight, the dialog's own Delete button is disabled; Cancel is too.
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Delete" })).toBeDisabled();
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    });

    resolveDelete({ success: true });

    // Resolving closes the dialog.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[
          { id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 },
        ]}
      />,
    );

    // The chapter must be visible so rough stops can be added into it...
    expect(desktop().getByText("France")).toBeInTheDocument();
    // ...and we must NOT be stuck on the bare "No stops yet" empty state.
    expect(screen.queryByRole("heading", { name: "No stops yet" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5b. Empty-state heading when there are zero stops and no chapters
// ---------------------------------------------------------------------------

describe("zero-stops empty state", () => {
  it("renders 'No stops yet' when there are no stops and no chapters, and 'Add a stop' opens the add-stop dialog", async () => {
    const user = userEvent.setup();
    renderPlan(<ItineraryManager {...baseProps} initialStops={[]} chapters={[]} />);
    expect(screen.getByRole("heading", { name: "No stops yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a stop" }));
    expect(await screen.findByRole("dialog", { name: "Add a stop" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. Drag handle smoke tests
// ---------------------------------------------------------------------------

describe("drag handle rendering", () => {
  it("renders a reorder handle for a rough stop (no dates)", () => {
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[roughStop]} />,
    );

    // The SortableStop wrapper renders a grip button with aria-label "Reorder <name>"
    expect(desktop().getByLabelText(/reorder paris/i)).toBeInTheDocument();
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

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[datedStop]} />,
    );

    expect(desktop().getByLabelText(/reorder berlin/i)).toBeInTheDocument();
  });

  it("renders a reorder handle on every stop when all stops are dated (ADR 0021)", () => {
    const stops = [
      makeStop({ id: "s-1", name: "Rome", arriveDate: "2026-07-01", departDate: "2026-07-03" }),
      makeStop({ id: "s-2", name: "Milan", arriveDate: "2026-07-03", departDate: "2026-07-06" }),
    ];

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={stops} />,
    );

    expect(desktop().queryAllByLabelText(/reorder/i)).toHaveLength(2);
  });

  // dnd-kit's fallback ids come from a module-global counter, so a server that
  // has rendered the Plan before would hand out different ids than the client.
  it("drag handles' aria-describedby is the same on every render (no hydration mismatch)", () => {
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });
    const describedBy = () =>
      screen.getAllByTestId("drag-handle-stop").map((el) => el.getAttribute("aria-describedby"));

    const first = renderPlan(<ItineraryManager {...baseProps} initialStops={[roughStop]} />);
    const ids = describedBy();
    first.unmount();
    renderPlan(<ItineraryManager {...baseProps} initialStops={[roughStop]} />);

    expect(describedBy()).toEqual(ids);
  });

  it("stop drag handle carries data-testid='drag-handle-stop'", () => {
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[roughStop]} />,
    );

    expect(desktop().getByTestId("drag-handle-stop")).toBeInTheDocument();
  });

  it("chapter drag handle carries data-testid='drag-handle-chapter'", () => {
    const chapter = {
      id: "ch-1",
      name: "France",
      colour: "rose" as const,
      startDate: null,
      endDate: null,
      sortOrder: 0,
    };
    const roughStop = makeStop({
      id: "s-1",
      name: "Paris",
      arriveDate: null,
      departDate: null,
      chapterId: "ch-1",
    });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[roughStop]} chapters={[chapter]} />,
    );

    expect(desktop().getByTestId("drag-handle-chapter")).toBeInTheDocument();
  });

  // LA-037: drag handles get an invisible 44px coarse-pointer tap target.
  it("stop drag handle has a 44px tap target (LA-037)", () => {
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[roughStop]} />,
    );

    expect(desktop().getByTestId("drag-handle-stop").className).toContain("tap-target");
  });

  it("a dated stop's handle shows on hover/focus only; a rough stop's always (deviation 3)", () => {
    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[
          makeStop({ id: "d", name: "Rome", arriveDate: "2026-07-01", departDate: "2026-07-03", sortOrder: 0 }),
          makeStop({ id: "r", name: "Milan", sortOrder: 1 }),
        ]}
      />,
    );
    expect(desktop().getByLabelText("Reorder Rome").className).toContain("pointer-fine:opacity-0");
    expect(desktop().getByLabelText("Reorder Rome").className).toContain("group-hover/row:opacity-100");
    expect(desktop().getByLabelText("Reorder Milan").className).not.toContain("opacity-0");
  });
});

// ---------------------------------------------------------------------------
// 7. Whole-trip firm-up confirm dialog
// ---------------------------------------------------------------------------

describe("whole-trip firm-up confirm dialog", () => {
  it("opens a confirm dialog with rough-stop count when 'Firm up all stops' is clicked", async () => {
    const user = userEvent.setup();
    const roughStop1 = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });
    const roughStop2 = makeStop({ id: "s-2", name: "Berlin", arriveDate: null, departDate: null, sortOrder: 1 });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop1, roughStop2]}
        tripStartDate="2026-08-01"
      />,
    );

    await user.click(desktop().getByRole("button", { name: "Firm up all stops" }));

    // Dialog should appear with rough count in its content
    expect(await screen.findByText(/2 rough stop/i)).toBeInTheDocument();
  });

  it("fires firmUpTrip only after the user confirms", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        tripStartDate="2026-08-01"
      />,
    );

    await user.click(desktop().getByRole("button", { name: "Firm up all stops" }));

    // firmUpTrip should NOT have been called yet
    expect(firmUpTrip).not.toHaveBeenCalled();

    // Confirm the dialog — scope to it since its confirm button shares the
    // "Firm up" wording with the triggers still on the page
    const dialog = await screen.findByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /^firm up$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(firmUpTrip).toHaveBeenCalledWith(TRIP_ID, undefined, undefined);
    });
  });

  it("does NOT fire firmUpTrip when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        tripStartDate="2026-08-01"
      />,
    );

    await user.click(desktop().getByRole("button", { name: "Firm up all stops" }));

    const cancelBtn = await screen.findByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);

    expect(firmUpTrip).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8. Per-chapter firm-up confirm dialog
// ---------------------------------------------------------------------------

describe("per-chapter firm-up confirm dialog", () => {
  it("opens a confirm dialog with the chapter rough-stop count when 'Firm up' is clicked on a rough chapter", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({
      id: "s-1",
      name: "Lyon",
      arriveDate: null,
      departDate: null,
      chapterId: "ch-1",
    });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        chapters={[{ id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 }]}
      />,
    );

    // The chapter header has a "Firm up" button (exact match, not the prominent "Firm up all stops")
    await user.click(desktop().getByRole("button", { name: /^firm up$/i }));

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

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        chapters={[{ id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 }]}
      />,
    );

    // Use exact match to target the per-chapter "Firm up" (not "Firm up all stops")
    await user.click(desktop().getByRole("button", { name: /^firm up$/i }));

    // Not called yet
    expect(firmUpSegment).not.toHaveBeenCalled();

    // Confirm the dialog — scope to it since its confirm button shares the
    // trigger's "Firm up" text
    const dialog = await screen.findByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /^firm up$/i });
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

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        chapters={[{ id: "ch-1", name: "France", colour: "rose", startDate: null, endDate: null, sortOrder: 0 }]}
      />,
    );

    // Use exact match to target the per-chapter "Firm up" (not "Firm up all stops")
    await user.click(desktop().getByRole("button", { name: /^firm up$/i }));

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
    const stop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null, chapterId: "ch-1" });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[stop]}
        chapters={[ROUGH_CHAPTER]}
        forkId={FORK_ID}
      />,
    );

    await user.click(desktop().getByRole("button", { name: /^firm up$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^firm up$/i }));

    await waitFor(() => {
      expect(firmUpSegment).toHaveBeenCalledWith({
        tripId: TRIP_ID,
        chapterId: "ch-1",
        forkId: FORK_ID,
      });
    });
  });
});

describe("fork-aware firmUpTrip", () => {
  it("calls firmUpTrip with forkId as the third arg when ItineraryManager has forkId prop", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[stop]}
        forkId={FORK_ID}
        tripStartDate="2026-08-01"
      />,
    );

    await user.click(desktop().getByRole("button", { name: "Firm up all stops" }));
    // Confirm the dialog — scope to it since its confirm button shares the
    // "Firm up" wording with the triggers still on the page
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^firm up$/i }));

    await waitFor(() => {
      expect(firmUpTrip).toHaveBeenCalledWith(TRIP_ID, undefined, FORK_ID);
    });
  });
});

describe("fork-aware createStop", () => {
  it("calls createStop with forkId (and after the last stop) when the Add a stop sheet is submitted with a forkId prop", async () => {
    const user = userEvent.setup();

    renderPlan(
      <>
        <HeaderAddStop />
        <ItineraryManager
          {...baseProps}
          initialStops={[makeStop()]}
          forkId={FORK_ID}
        />
      </>,
    );

    // Open the Add stop dialog the way the Plan header does, through PlanBody's actions.
    await user.click(screen.getByRole("button", { name: "header add" }));

    // The stop is rough (no trip start, nothing dated), so it opens on Roughly.
    await user.click(await screen.findByRole("button", { name: "pick Berlin" }));
    await user.click(screen.getByRole("button", { name: "Add Berlin" }));

    await waitFor(() => {
      expect(createStop).toHaveBeenCalledWith(
        TRIP_ID,
        { mode: "rough", name: "Berlin", country: "Germany", nights: 3, lat: 52.52, lng: 13.4, countryCode: "de", chapterId: null },
        FORK_ID,
        "stop-1",
      );
    });
  });
});

describe("Suggest from countries in-flight guard", () => {
  it("a second Suggest while the first is still pending does not call the action again", async () => {
    const user = userEvent.setup();
    let resolve!: (r: { success: true; created: number }) => void;
    vi.mocked(suggestChaptersFromCountries).mockImplementationOnce(
      () => new Promise((r) => { resolve = r; }) as ReturnType<typeof suggestChaptersFromCountries>,
    );
    function Trigger() {
      const { actions } = usePlanBody();
      return <button onClick={actions.suggestChapters}>header suggest</button>;
    }
    render(
      <PlanBody initialOpen={[]} today="2030-01-01">
        <Trigger />
        <ItineraryManager {...baseProps} initialStops={[makeStop()]} />
      </PlanBody>,
    );
    await user.click(screen.getByRole("button", { name: "header suggest" }));
    await user.click(screen.getByRole("button", { name: "header suggest" }));
    expect(suggestChaptersFromCountries).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ success: true, created: 0 }));
    await user.click(screen.getByRole("button", { name: "header suggest" }));
    await waitFor(() => expect(suggestChaptersFromCountries).toHaveBeenCalledTimes(2));
  });
});

describe("fork-aware createChapter", () => {
  it("calls createChapter with forkId when the New chapter dialog is submitted with a forkId prop", async () => {
    const user = userEvent.setup();

    function Trigger() {
      const { actions } = usePlanBody();
      return <button onClick={actions.newChapter}>header new chapter</button>;
    }
    render(
      <PlanBody initialOpen={[]} today="2030-01-01">
        <Trigger />
        <ItineraryManager {...baseProps} initialStops={[]} forkId={FORK_ID} />
      </PlanBody>,
    );

    // New chapter is registered with PlanBody (the Plan header's Chapters pill).
    await user.click(screen.getByRole("button", { name: "header new chapter" }));

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

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[
          makeStop({ id: "s-1", name: "Paris", arriveDate: "2026-08-01", departDate: "2026-08-04", sortOrder: 0 }),
          makeStop({ id: "s-2", name: "Berlin", arriveDate: "2026-08-04", departDate: "2026-08-07", sortOrder: 1 }),
        ]}
        forkId={FORK_ID}
      />,
    );

    await user.click(desktop().getByRole("button", { name: "Add transport from Paris to Berlin" }));
    const submitBtn = await screen.findByRole("button", { name: /^add flight$/i });
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

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[datedStop]}
        forkId={FORK_ID}
      />,
      ["s-dated"],
    );

    // The open body's stay chip: "No bed yet · + Add a stay"
    await user.click(desktop().getByRole("button", { name: /add a stay/i }));

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
// Add a stay from the open body (PLAN.md §4.1). A rough stop's stay chip is
// inert ("Needs dates first") — the body offers "Give it dates" instead.
// ---------------------------------------------------------------------------

describe("Add a stay from the open body", () => {
  it("a rough stop's stay chip is inert and the body offers 'Give it dates'", () => {
    const stop = makeStop({ id: "s1", name: "Rome", arriveDate: null, departDate: null });
    renderPlan(<ItineraryManager {...baseProps} initialStops={[stop]} />, ["s1"]);
    expect(desktop().getByText("Needs dates first")).toBeInTheDocument();
    expect(desktop().queryByRole("button", { name: /add a stay/i })).toBeNull();
    expect(desktop().getByRole("button", { name: "Give it dates" })).toBeInTheDocument();
  });

  it("opens the accommodation form directly on a dated stop", async () => {
    const user = userEvent.setup();
    const stop = makeStop({
      id: "s2",
      name: "Paris",
      arriveDate: "2026-06-04",
      departDate: "2026-06-07",
    });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[stop]} />, ["s2"]);

    await user.click(desktop().getByRole("button", { name: /add a stay/i }));

    expect(await screen.findByLabelText(/accommodation name/i)).toBeInTheDocument();
    expect(screen.queryByText(/has no dates yet/i)).not.toBeInTheDocument();
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
    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[emptyChapter]}
      />,
    );

    expect(
      desktop().getByRole("button", { name: "Remove Asia chapter" }),
    ).toBeInTheDocument();
  });

  it("does NOT call deleteChapter when the confirm dialog is cancelled", async () => {
    const user = userEvent.setup();

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[emptyChapter]}
      />,
    );

    await user.click(desktop().getByRole("button", { name: "Remove Asia chapter" }));

    const cancelBtn = await screen.findByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    expect(deleteChapter).not.toHaveBeenCalled();
  });

  it("calls deleteChapter with the chapter id when confirmed", async () => {
    const user = userEvent.setup();

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[emptyChapter]}
      />,
    );

    await user.click(desktop().getByRole("button", { name: "Remove Asia chapter" }));

    const removeBtn = await screen.findByRole("button", { name: "Remove" });
    await user.click(removeBtn);

    await waitFor(() => {
      expect(deleteChapter).toHaveBeenCalledWith("ch-empty");
    });
  });

  it("shows an error toast instead of crashing when deleteChapter rejects (P2-1 regression)", async () => {
    vi.mocked(deleteChapter).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[]}
        chapters={[emptyChapter]}
      />,
    );

    await user.click(desktop().getByRole("button", { name: "Remove Asia chapter" }));

    const removeBtn = await screen.findByRole("button", { name: "Remove" });
    await user.click(removeBtn);

    await waitFor(() => {
      expect(deleteChapter).toHaveBeenCalledWith("ch-empty");
    });
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: expect.stringMatching(/nothing was changed/i),
      }),
    );
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

    renderPlan(<ItineraryManager {...baseProps} initialStops={[dated]} />);

    // SortableStop provides an aria-label="Reorder {name}" grip button.
    // Previously only rough stops got this; ADR 0021 gives it to dated stops too.
    expect(
      desktop().getByRole("button", { name: "Reorder Venice" }),
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

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[dated]}
        chapters={[datedChapter]}
      />,
    );

    // A populated dated chapter now gets a "Reorder chapter" handle in its header.
    expect(
      desktop().getByRole("button", { name: "Reorder chapter" }),
    ).toBeInTheDocument();
  });

  it("still renders a reorder drag handle on a ROUGH stop (unchanged)", () => {
    const rough = makeStop({ id: "r-1", name: "Paris", arriveDate: null, departDate: null });
    renderPlan(<ItineraryManager {...baseProps} initialStops={[rough]} />);
    expect(
      desktop().getByRole("button", { name: "Reorder Paris" }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 10: dates-rule rendering (ADR 0038) — a scheduled stop's position IS
// its dates, so the editor must render scheduled stops in date order even
// when the caller (a test fixture, or — before this task — the page loader)
// hands them over sorted some other way.
// ---------------------------------------------------------------------------

describe("Task 10: dates-rule rendering order (ADR 0038)", () => {
  it("renders scheduled stops in date order even when the fixture lists them out of order", () => {
    const later = makeStop({
      id: "s-later",
      name: "Florence",
      arriveDate: "2026-08-10",
      departDate: "2026-08-13",
      sortOrder: 0,
    });
    const earlier = makeStop({
      id: "s-earlier",
      name: "Venice",
      arriveDate: "2026-08-01",
      departDate: "2026-08-05",
      sortOrder: 1,
    });

    // Fixture order is deliberately reversed (later date first, lower sortOrder)
    // to prove rendering follows dates, not array/sortOrder position.
    renderPlan(<ItineraryManager {...baseProps} initialStops={[later, earlier]} />);

    const names = desktop()
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(names).toEqual(["Venice", "Florence"]);
  });
});

// ---------------------------------------------------------------------------
// Task 10: pinned scheduled stop blocks the drag (ADR 0038)
//
// jsdom has no layout engine, so a real dnd-kit pointer gesture can't be
// simulated with real coordinates (see the note above the dnd-kit mock near
// the top of this file, and the "Task 10: scheduled entities are draggable"
// block above). Instead of asserting the guard exists via a source-text
// match, the DndContext mock above captures the real onDragEnd callback the
// component wires up, so this test invokes the ACTUAL production
// handleDragEnd with a synthetic DragEndEvent shape — real guard logic, no
// pointer/coordinate simulation required.
// ---------------------------------------------------------------------------

describe("Task 10: pinned scheduled stop blocks the drag (ADR 0038)", () => {
  it("shows the pinned-stop toast and calls no reorder action when a pinned scheduled stop is dropped", async () => {
    const pinned = makeStop({
      id: "s-pinned",
      name: "Rome",
      arriveDate: "2026-08-01",
      departDate: "2026-08-05",
      pinned: true,
      sortOrder: 0,
    });
    const other = makeStop({
      id: "s-other",
      name: "Naples",
      arriveDate: "2026-08-05",
      departDate: "2026-08-08",
      sortOrder: 1,
    });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[pinned, other]} />);

    expect(dndCapture.onDragEnd).toBeDefined();

    await act(async () => {
      await dndCapture.onDragEnd!({
        active: { id: "s-pinned", data: { current: { type: "stop" } } },
        over: { id: "s-other", data: { current: {} } },
      });
    });

    expect(toast).toHaveBeenCalledWith({
      title: "This stop is pinned — unpin it to move it.",
    });
    expect(reorderStops).not.toHaveBeenCalled();
  });

  it("does NOT block dragging a scheduled stop that is not pinned (regression guard)", async () => {
    const unpinned = makeStop({
      id: "s-unpinned",
      name: "Rome",
      arriveDate: "2026-08-01",
      departDate: "2026-08-05",
      pinned: false,
      sortOrder: 0,
    });
    const other = makeStop({
      id: "s-other",
      name: "Naples",
      arriveDate: "2026-08-05",
      departDate: "2026-08-08",
      sortOrder: 1,
    });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[unpinned, other]} />);

    expect(dndCapture.onDragEnd).toBeDefined();

    await act(async () => {
      await dndCapture.onDragEnd!({
        active: { id: "s-unpinned", data: { current: { type: "stop" } } },
        over: { id: "s-other", data: { current: {} } },
      });
    });

    expect(reorderStops).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Task 10: a blocked pinned-stop drag must not corrupt local state (ADR 0038)
//
// handleDragOver optimistically previews a cross-container move by stamping
// chapterId onto the dragged stop WHILE the gesture is in progress (dnd-kit
// fires onDragOver repeatedly as the pointer crosses containers, before
// onDragEnd on drop). handleDragEnd's pinned guard stops the drop from being
// applied/persisted, but if handleDragOver had already re-stamped the pinned
// stop's chapterId during the hover, that stale value would sit unnoticed in
// localStops and ship to the server on some LATER, unrelated drag (whichever
// reorder happens to run next sends the full stop list, chapterId included).
// handleDragOver needs the identical pinned guard so the preview mutation
// never happens in the first place.
// ---------------------------------------------------------------------------

describe("Task 10: blocked pinned-stop drag doesn't corrupt chapterId (regression, ADR 0038)", () => {
  it("does not leave a pinned scheduled stop's chapterId mutated by a hover, even after the drop is blocked", async () => {
    const pinned = makeStop({
      id: "s-pinned",
      name: "Rome",
      arriveDate: "2026-08-01",
      departDate: "2026-08-05",
      pinned: true,
      chapterId: null,
      sortOrder: 0,
    });
    const other = makeStop({
      id: "s-other",
      name: "Naples",
      arriveDate: "2026-08-05",
      departDate: "2026-08-08",
      pinned: false,
      chapterId: "chB",
      sortOrder: 1,
    });
    const chapterB = {
      id: "chB",
      name: "Coastal leg",
      colour: "rose" as const,
      startDate: "2026-08-05",
      endDate: "2026-08-08",
      sortOrder: 0,
    };

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[pinned, other]} chapters={[chapterB]} />,
    );

    expect(dndCapture.onDragOver).toBeDefined();
    expect(dndCapture.onDragEnd).toBeDefined();

    // Hover the pinned stop over chapter B's container mid-drag — without the
    // handleDragOver guard this optimistically stamps chapterId "chB" onto it.
    act(() => {
      dndCapture.onDragOver!({
        active: { id: "s-pinned", data: { current: { type: "stop" } } },
        over: { id: "chB", data: { current: {} } },
      });
    });

    // Drop — blocked by the handleDragEnd pinned guard (asserted separately above).
    await act(async () => {
      await dndCapture.onDragEnd!({
        active: { id: "s-pinned", data: { current: { type: "stop" } } },
        over: { id: "chB", data: { current: {} } },
      });
    });

    // A later, unrelated legitimate drag (moving "other") persists the whole
    // stop list, chapterId included — this is where a corrupted pinned-stop
    // chapterId from the earlier hover would leak to the server.
    await act(async () => {
      await dndCapture.onDragEnd!({
        active: { id: "s-other", data: { current: { type: "stop" } } },
        over: { id: "s-pinned", data: { current: { type: "stop" } } },
      });
    });

    expect(reorderStops).toHaveBeenCalledTimes(1);
    const items = vi.mocked(reorderStops).mock.calls[0][1] as { id: string; chapterId: string | null }[];
    const pinnedItem = items.find((i) => i.id === "s-pinned");
    expect(pinnedItem?.chapterId).toBeNull();
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

describe("undoPayloadFor (the Undo of a payload shift)", () => {
  it("inverts a plain date shift, writing no stopId", () => {
    expect(
      undoPayloadFor({
        items: [{ id: "louvre", date: "2026-06-16", prevDate: "2026-06-14" }],
        accommodations: [
          { id: "hotel", checkIn: "2026-06-14", checkOut: "2026-06-17", prevCheckIn: "2026-06-12", prevCheckOut: "2026-06-15" },
        ],
      }),
    ).toEqual({
      items: [{ id: "louvre", date: "2026-06-14" }],
      accommodations: [{ id: "hotel", checkIn: "2026-06-12", checkOut: "2026-06-15" }],
    });
  });

  it("inverts an un-slot back to its date", () => {
    expect(
      undoPayloadFor({ items: [{ id: "x", date: null, prevDate: "2026-06-15" }], accommodations: [] }).items,
    ).toEqual([{ id: "x", date: "2026-06-15" }]);
  });

  // ADR 0055: shortening a stop can hand an item to the stop that still covers
  // its day. The date is identical either side of that re-file, so the owning
  // stop is the only thing Undo has to go on — drop it and the item's Cost
  // stays on the new stop's Budget line after an Undo that claimed to revert.
  it("restores the previous owning stop when the item was re-filed", () => {
    expect(
      undoPayloadFor({
        items: [
          { id: "dinner", date: "2026-05-10", prevDate: "2026-05-10", prevStopId: "munich" },
        ],
        accommodations: [],
      }).items,
    ).toEqual([{ id: "dinner", date: "2026-05-10", stopId: "munich" }]);
  });
});

// ---------------------------------------------------------------------------
// Task 12: Prominent whole-trip firm-up control at the top of the plan editor
// ---------------------------------------------------------------------------

describe("Task 12: prominent firm-up control at top of plan editor", () => {
  it("renders 'Firm up all stops' in the dashed row at the top when rough stops exist", () => {
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[roughStop]} />,
    );

    const btn = desktop().getByRole("button", { name: /firm up all stops/i });
    expect(btn.className).toContain("tap-target");
    // First thing in the list, above every stop.
    const first = desktop().getByRole("heading", { name: "Paris" });
    expect(btn.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does NOT render the prominent 'Firm up all stops' button when all stops are dated", () => {
    const datedStop = makeStop({
      id: "s-1",
      name: "Paris",
      arriveDate: "2026-08-01",
      departDate: "2026-08-05",
    });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[datedStop]} />,
    );

    expect(
      desktop().queryByRole("button", { name: /firm up all stops/i }),
    ).not.toBeInTheDocument();
  });

  it("fires firmUpTrip after the confirm dialog is accepted via the prominent button", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop]}
        tripStartDate="2026-08-01"
      />,
    );

    await user.click(desktop().getByRole("button", { name: /firm up all stops/i }));

    // Not called yet — confirm dialog gates the action
    expect(firmUpTrip).not.toHaveBeenCalled();

    // Confirm the dialog — scope to it since its confirm button shares the
    // "Firm up" wording with the triggers still on the page
    const dialog = await screen.findByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /^firm up$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(firmUpTrip).toHaveBeenCalledWith(TRIP_ID, undefined, undefined);
    });
  });

  it("does NOT fire firmUpTrip when the prominent button confirm dialog is cancelled", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({ id: "s-1", name: "Paris", arriveDate: null, departDate: null });

    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[roughStop]} />,
    );

    await user.click(desktop().getByRole("button", { name: /firm up all stops/i }));

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
  const PARIS = () => makeStop({ id: "s1", name: "Paris", arriveDate: "2026-12-10", departDate: "2026-12-15" });

  it("renders the origin bookend at the top, linking to trip settings", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS()]} homeBaseName="Sydney" roundTrip={false} />);
    const top = document.getElementById("home-base-top")!;
    expect(top).toHaveAttribute("href", "/trips/trip-1/settings");
    expect(top).toHaveTextContent("Sydney");
    expect(top).toHaveTextContent("Home base · leave Thu 10 Dec");
    expect(top.compareDocumentPosition(desktop().getByRole("heading", { name: "Paris" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("with no Home base there are no bookends", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS()]} roundTrip />);
    expect(document.getElementById("home-base-top")).toBeNull();
    expect(document.getElementById("home-base-bottom")).toBeNull();
  });

  it("prompts for the outbound leg as a dashed pill when the first stop is dated", async () => {
    const user = userEvent.setup();
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS()]} homeBaseName="Sydney" roundTrip={false} />);
    await user.click(desktop().getByRole("button", { name: "Add transport from Sydney to Paris" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("no outbound pill into a rough first stop — a bare line", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[makeStop({ id: "s1", name: "Paris" })]} homeBaseName="Sydney" roundTrip={false} />);
    expect(desktop().queryByRole("button", { name: /Add transport from Sydney/ })).toBeNull();
    expect(screen.getByTestId("plan-desktop-list").querySelectorAll("[data-leg-kind='line']")).toHaveLength(1);
  });

  it("renders the outbound leg as a pill named by its mode", () => {
    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[PARIS()]}
        initialTransports={[makeTransport({ id: "out", depIsHome: true, toStopId: "s1" })]}
        homeBaseName="Sydney"
        roundTrip={false}
      />,
    );
    expect(desktop().getByRole("button", { name: /^Flight from Sydney to Paris/ })).toBeInTheDocument();
    expect(desktop().queryByRole("button", { name: /^Add transport/ })).toBeNull();
  });

  it("renders the return leg as a pill above the return bookend", () => {
    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[PARIS()]}
        initialTransports={[makeTransport({ id: "ret", arrIsHome: true, fromStopId: "s1" })]}
        homeBaseName="Sydney"
        roundTrip={true}
      />,
    );
    const pill = desktop().getByRole("button", { name: /^Flight from Paris to Sydney/ });
    expect(pill.compareDocumentPosition(document.getElementById("home-base-bottom")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(desktop().queryByRole("button", { name: "Add transport from Paris to Sydney" })).toBeNull();
  });

  it("a round trip ends with the return bookend and a dashed return prompt", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS()]} homeBaseName="Sydney" roundTrip={true} />);
    const bottom = document.getElementById("home-base-bottom")!;
    expect(bottom).toHaveTextContent("Home base · back Tue 15 Dec");
    expect(desktop().getByRole("button", { name: "Add transport from Paris to Sydney" })).toBeInTheDocument();
  });

  it("omits the return bookend on a one-way trip", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS()]} homeBaseName="Sydney" roundTrip={false} />);
    expect(document.getElementById("home-base-bottom")).toBeNull();
  });

  it("a free-text outbound flight ('Brisbane') is the outbound bookend leg: its real endpoint shows, no outbound prompt", () => {
    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Denpasar", arriveDate: "2026-12-10", departDate: "2026-12-15" })]}
        initialTransports={[makeTransport({ id: "out", depPlace: "Brisbane", toStopId: "s1" })]}
        homeBaseName="Gold Coast"
        roundTrip={false}
      />,
    );
    expect(desktop().getByRole("button", { name: /^Flight from Brisbane to Denpasar/ })).toBeInTheDocument();
    expect(desktop().queryByRole("button", { name: /^Add transport/ })).toBeNull();
  });

  it("a free-text return flight is the return bookend leg: no return prompt", () => {
    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Rome", arriveDate: "2026-12-10", departDate: "2026-12-15" })]}
        initialTransports={[makeTransport({ id: "ret", fromStopId: "s1", arrPlace: "Brisbane" })]}
        homeBaseName="Gold Coast"
        roundTrip={true}
      />,
    );
    expect(desktop().getByRole("button", { name: /^Flight from Rome to Brisbane/ })).toBeInTheDocument();
    expect(desktop().queryByRole("button", { name: "Add transport from Rome to Gold Coast" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 5: Optimistic transport delete
// ---------------------------------------------------------------------------

describe("optimistic transport delete", () => {
  function makeTransportBetweenStops(
    fromStopId: string,
    toStopId: string,
    overrides: Partial<ItineraryTransport> = {},
  ): ItineraryTransport {
    return {
      id: "tr-opt-1",
      mode: "FLIGHT",
      fromStopId,
      toStopId,
      depIsHome: false,
      arrIsHome: false,
      depPlace: "Sydney",
      arrPlace: "Paris",
      depAt: null,
      arrAt: null,
      reference: null,
      notes: null,
      sortOrder: 0,
      costs: [],
      ...overrides,
    };
  }

  async function deleteViaSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(desktop().getByRole("button", { name: /^Flight from Sydney to Paris/ }));
    await user.click(await screen.findByRole("button", { name: "Delete leg" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
  }

  it("optimistically removes a transport on delete (no prop change needed)", async () => {
    const user = userEvent.setup();
    const stopA = makeStop({ id: "s-a", name: "Sydney", sortOrder: 0 });
    const stopB = makeStop({ id: "s-b", name: "Paris", sortOrder: 1 });
    vi.mocked(deleteTransport).mockResolvedValueOnce({ success: true });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[stopA, stopB]} initialTransports={[makeTransportBetweenStops("s-a", "s-b")]} />);

    await deleteViaSheet(user);

    await waitFor(() => {
      expect(desktop().queryByRole("button", { name: /^Flight/ })).not.toBeInTheDocument();
    });
    expect(deleteTransport).toHaveBeenCalledWith("tr-opt-1");
  });

  it("rolls back the optimistic removal and shows a destructive toast on server failure", async () => {
    const user = userEvent.setup();
    const stopA = makeStop({ id: "s-a", name: "Sydney", sortOrder: 0 });
    const stopB = makeStop({ id: "s-b", name: "Paris", sortOrder: 1 });
    vi.mocked(deleteTransport).mockResolvedValueOnce({ success: false, errors: {} });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[stopA, stopB]} initialTransports={[makeTransportBetweenStops("s-a", "s-b")]} />);

    await deleteViaSheet(user);

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    });
    expect(desktop().getByRole("button", { name: /^Flight from Sydney to Paris/ })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 12 / Task 9: Single context-aware "Add transport" button per Stop slot
// (Two separate buttons — "Add transport here" and "Add Transport to {next}" —
// were merged into one in Task 9. Tests updated accordingly.)
// ---------------------------------------------------------------------------

describe("Task 12 / Task 9: context-aware Add transport pill", () => {
  const TOKYO = () => makeStop({ id: "s-a", name: "Tokyo", arriveDate: "2026-04-01", departDate: "2026-04-04", sortOrder: 0 });
  const OSAKA = () => makeStop({ id: "s-b", name: "Osaka", arriveDate: "2026-04-04", departDate: "2026-04-07", sortOrder: 1 });

  it("the dashed pill between two dated stops creates with fromStopId + toStopId + anchorStopId", async () => {
    const user = userEvent.setup();
    renderPlan(<ItineraryManager {...baseProps} initialStops={[TOKYO(), OSAKA()]} />);

    await user.click(desktop().getByRole("button", { name: "Add transport from Tokyo to Osaka" }));
    const submitBtn = await screen.findByRole("button", { name: /^add flight$/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createTransport).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ fromStopId: "s-a", toStopId: "s-b", anchorStopId: "s-a" }),
        undefined,
      );
    });
  });

  it("the last stop has no add pill after it", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[TOKYO(), OSAKA()]} />);
    expect(desktop().getAllByRole("button", { name: /^Add transport/ })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Task 8: Anchor-slot rendering — free-place leg renders under its anchor stop
// ---------------------------------------------------------------------------

describe("Task 8: anchor-slot transport rendering", () => {
  it("renders a free-place leg anchored under its stop, with no Other-transport box", async () => {
    const stopA = makeStop({ id: "s-a", name: "Tokyo", sortOrder: 0 });
    const stopB = makeStop({ id: "s-b", name: "Osaka", sortOrder: 1 });
    // Leg: departs from A, arrives at free place "Hakone", anchorStopId = A
    const freeLeg: ItineraryTransport = {
      id: "tr-free",
      mode: "TRAIN",
      fromStopId: "s-a",
      toStopId: null,
      anchorStopId: "s-a",
      depIsHome: false,
      arrIsHome: false,
      depPlace: null,
      arrPlace: "Hakone",
      depAt: null,
      arrAt: null,
      reference: null,
      notes: null,
      sortOrder: 0,
      costs: [],
    };

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[stopA, stopB]}
        initialTransports={[freeLeg]}
      />,
    );

    // The leg renders as a pill between its anchor stop and the next.
    const pill = desktop().getByRole("button", { name: /^Train from Tokyo to Hakone/ });
    expect(desktop().getByRole("heading", { name: "Tokyo" }).compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pill.compareDocumentPosition(desktop().getByRole("heading", { name: "Osaka" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Task 14: HEAD_SLOT legs visible when chapters exist (regression guard)
// ---------------------------------------------------------------------------

describe("Task 14: HEAD_SLOT legs are visible in both no-chapters and chapters paths", () => {
  it("renders a HEAD_SLOT leg when chapters are present (chapters path)", async () => {
    // A transport that resolves to HEAD_SLOT:
    //   - no anchorStopId, fromStopId, or toStopId → resolveTransportSlot falls through to HEAD_SLOT
    //   - arrPlace is used as the displayed destination label (no stop name to override it)
    const firstStop = makeStop({ id: "s-first", name: "London", sortOrder: 0, chapterId: "ch-1" });
    const headLeg: ItineraryTransport = {
      id: "tr-head",
      mode: "FLIGHT",
      fromStopId: null,
      toStopId: null,
      anchorStopId: null,
      depIsHome: false,
      arrIsHome: false,
      depPlace: null,
      arrPlace: "Layover City",
      depAt: null,
      arrAt: null,
      reference: null,
      notes: null,
      sortOrder: 0,
      costs: [],
    };
    const chapter = {
      id: "ch-1",
      name: "UK",
      colour: "rose" as const,
      startDate: null,
      endDate: null,
      sortOrder: 0,
    };

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[firstStop]}
        initialTransports={[headLeg]}
        chapters={[chapter]}
      />,
    );

    // The HEAD_SLOT leg renders as a pill above the first stop even when chapters exist.
    const pill = desktop().getByRole("button", { name: /^Flight/ });
    expect(pill.compareDocumentPosition(desktop().getByRole("heading", { name: "London" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("still renders a HEAD_SLOT leg in the no-chapters path (existing behaviour)", async () => {
    const firstStop = makeStop({ id: "s-first", name: "Berlin", sortOrder: 0 });
    const headLeg: ItineraryTransport = {
      id: "tr-head-nc",
      mode: "TRAIN",
      fromStopId: null,
      toStopId: null,
      anchorStopId: null,
      depIsHome: false,
      arrIsHome: false,
      depPlace: null,
      arrPlace: "Transit Hub",
      depAt: null,
      arrAt: null,
      reference: null,
      notes: null,
      sortOrder: 0,
      costs: [],
    };

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[firstStop]}
        initialTransports={[headLeg]}
        chapters={[]}
      />,
    );

    const pill = desktop().getByRole("button", { name: /^Train/ });
    expect(pill.compareDocumentPosition(desktop().getByRole("heading", { name: "Berlin" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Chapters menu — opt-in affordance gating (chaptersEnabled)
// ---------------------------------------------------------------------------

describe("Chapters opt-in gating", () => {
  it("renders flat with no chapter controls when chaptersEnabled is false", () => {
    const stop = makeStop({ id: "s-1", name: "Lisbon" });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[stop]}
        chapters={[]}
        chaptersEnabled={false}
      />,
    );

    // No chapter controls anywhere in the list (the header's Chapters menu is PlanHeaderActions').
    expect(screen.queryByText("New Chapter")).toBeNull();
    expect(screen.queryByText("Suggest from countries")).toBeNull();
    expect(screen.queryByRole("button", { name: /chapters/i })).toBeNull();
  });

  it("keeps rendering flat even if a stale chapters prop is passed while disabled (safety net)", () => {
    const stop = makeStop({ id: "s-1", name: "Porto", chapterId: "ch-1" });
    const chapter = {
      id: "ch-1",
      name: "Iberia",
      colour: "rose" as const,
      startDate: null,
      endDate: null,
      sortOrder: 0,
    };

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[stop]}
        chapters={[chapter]}
        chaptersEnabled={false}
      />,
    );

    // chaptersEnabled=false must win over a non-empty chapters prop: no chapter
    // chip/header/band renders anywhere.
    expect(screen.queryByText("Iberia")).toBeNull();
  });

  it("hides per-stop 'Start a chapter here' and 'Assign to chapter' on every stop when chaptersEnabled is false", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({ id: "s-rough", name: "Athens", arriveDate: null, departDate: null, sortOrder: 0 });
    const scheduledStop = makeStop({
      id: "s-dated",
      name: "Sparta",
      arriveDate: "2026-07-01",
      departDate: "2026-07-03",
      sortOrder: 1,
    });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[roughStop, scheduledStop]}
        chapters={[]}
        chaptersEnabled={false}
      />,
    );

    // No "Start a chapter here" control renders anywhere outside the menus.
    expect(screen.queryByRole("button", { name: "Start a chapter here" })).toBeNull();
    expect(screen.queryByText("Start a chapter here")).toBeNull();
    expect(screen.queryByText("Assign to chapter")).toBeNull();

    // Open every stop's overflow menu. Radix marks the rest of the page aria-hidden while a menu is open, so
    // close each one (Escape) before opening the next.
    for (const name of ["Athens", "Sparta"]) {
      await user.click(desktop().getByRole("button", { name: `More actions for ${name}` }));
      expect(await screen.findByRole("menu")).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /Start a chapter here/ })).toBeNull();
      expect(screen.queryByRole("menuitem", { name: /Assign to chapter/ })).toBeNull();
      await user.keyboard("{Escape}");
    }
  });

  it("still shows 'Start a chapter here' and 'Assign to chapter' on a rough stop when chaptersEnabled is true (default)", async () => {
    const user = userEvent.setup();
    const roughStop = makeStop({ id: "s-rough", name: "Athens", arriveDate: null, departDate: null });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[roughStop]} chapters={[]} />);

    await user.click(desktop().getByRole("button", { name: "More actions for Athens" }));
    expect(screen.getByRole("menuitem", { name: /Start a chapter here/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Assign to chapter/ })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 7: day-aware plan editor wiring — dayItemsByStopId threading + the
// collapsed AccommodationRow swap-in.
// ---------------------------------------------------------------------------

describe("day-aware plan editor wiring", () => {
  it("an open stop's tabpanel shows its day items", () => {
    const scheduledStop = makeStop({
      id: "s1",
      name: "Rome",
      arriveDate: "2026-07-10",
      departDate: "2026-07-13",
    });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[scheduledStop]}
        dayItemsByStopId={
          new Map([
            [
              "s1",
              [
                {
                  id: "d1",
                  title: "Colosseum",
                  category: "SIGHTSEEING",
                  date: "2026-07-11",
                  startTime: "10:00",
                  stopId: "s1",
                },
              ],
            ],
          ])
        }
      />,
      ["s1"],
    );

    expect(desktop().getByRole("tabpanel")).toHaveTextContent("Colosseum");
  });

  it("the stay chip opens the stay dialog with the accommodation row", async () => {
    const user = userEvent.setup();
    const scheduledStop = makeStop({
      id: "s1",
      name: "Rome",
      arriveDate: "2026-07-10",
      departDate: "2026-07-13",
      accommodations: [
        {
          id: "acc-1",
          stopId: "s1",
          name: "Hotel Roma",
          checkIn: "2026-07-10",
          checkOut: "2026-07-13",
          costs: [],
        },
      ],
    });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[scheduledStop]} />, ["s1"]);

    await user.click(desktop().getByRole("button", { name: /Hotel Roma/ }));
    const dialog = await screen.findByRole("dialog", { name: "Staying in Rome" });
    const row = within(dialog).getByRole("button", { name: /Hotel Roma/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    await user.click(row);
    expect(within(dialog).getByTestId("accommodation-card")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 7: a Reminder about a Stop
// ---------------------------------------------------------------------------

describe("Add a reminder from a Stop's overflow menu (Task 7)", () => {
  it("opens AddReminderDialog with the stop preset, and submits it with that stopId", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s1", name: "Denpasar" });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    await user.click(desktop().getByRole("button", { name: "More actions for Denpasar" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add a reminder" }));

    expect(
      await screen.findByRole("heading", { name: /add a reminder/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/reminder title/i), "Reconfirm the tour");
    await user.type(screen.getByLabelText(/^date/i), "2026-08-01");
    await user.click(screen.getByRole("button", { name: /^add reminder$/i }));

    await waitFor(() => {
      expect(addReminder).toHaveBeenCalledWith(TRIP_ID, {
        title: "Reconfirm the tour",
        date: "2026-08-01",
        stopId: "s1",
      });
    });
  });

  it("offers no 'Add a reminder' on a Fork's Stop — it is not in the real plan", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s1", name: "Denpasar" });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[stop]} forkId={FORK_ID} />);

    expect(screen.queryByRole("button", { name: "Add a reminder" })).not.toBeInTheDocument();
    await user.click(desktop().getByRole("button", { name: "More actions for Denpasar" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: "Add a reminder" })).not.toBeInTheDocument();
  });

  it("the open body's '1 reminder' link opens a dialog listing it", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s1", name: "Denpasar" });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[stop]}
        remindersByStopId={
          new Map([
            ["s1", [{ id: "rem-1", title: "Reconfirm the tour", date: "2026-08-01", stopId: "s1", stopName: "Denpasar" }]],
          ])
        }
      />,
      ["s1"],
    );

    await user.click(desktop().getByRole("button", { name: "1 reminder" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Reconfirm the tour")).toBeInTheDocument();
  });
});

// Task 15: /plan?add=stop (the desktop Home's "+ Add a stop") opens the
// add-Stop dialog on arrival.
describe("?add=stop (final review #3)", () => {
  afterEach(() => {
    navState.search = "";
    routerReplaceMock.mockClear();
  });

  it("opens the add-Stop dialog when the URL carries add=stop, then strips add (keeping other params) without scrolling", async () => {
    navState.search = "plan=fork-1&add=stop";
    renderPlan(<ItineraryManager {...baseProps} initialStops={[makeStop()]} />);
    expect(await screen.findByRole("dialog", { name: "Add a stop" })).toBeInTheDocument();
    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/trips/trip-1/plan?plan=fork-1", { scroll: false }),
    );
  });

  it("strips to the bare path when add was the only param", async () => {
    navState.search = "add=stop";
    renderPlan(<ItineraryManager {...baseProps} initialStops={[makeStop()]} />);
    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/trips/trip-1/plan", { scroll: false }),
    );
  });

  it("opens when add=stop arrives on a later client navigation while mounted", async () => {
    const { rerender } = render(<ItineraryManager {...baseProps} initialStops={[makeStop()]} />);
    expect(screen.queryByRole("dialog", { name: "Add a stop" })).toBeNull();
    navState.search = "add=stop";
    rerender(<ItineraryManager {...baseProps} initialStops={[makeStop()]} />);
    expect(await screen.findByRole("dialog", { name: "Add a stop" })).toBeInTheDocument();
  });

  it("keeps it closed, and leaves the URL alone, without add=stop", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[makeStop()]} />);
    expect(screen.queryByRole("dialog", { name: "Add a stop" })).toBeNull();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });
});

describe("desktop list (PLAN.md §1.3–§4)", () => {
  const MUNICH = makeStop({ id: "mun", name: "Munich", sortOrder: 2 });
  const ITEM = { id: "it1", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00", endTime: null, stopId: "par" };

  it("numbers the stops in plan order", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME, MUNICH]} />);
    expect(desktop().getByRole("heading", { name: "Rome" }).closest("article")).toHaveTextContent("2");
  });

  it("a dashed add pill between dated stops; a bare line into a rough stop", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME, MUNICH]} />);
    expect(desktop().getByRole("button", { name: "Add transport from Paris to Rome" })).toBeInTheDocument();
    expect(desktop().queryByRole("button", { name: /Add transport from Rome to Munich/ })).toBeNull();
    expect(screen.getByTestId("plan-desktop-list").querySelectorAll("[data-leg-kind='line']")).toHaveLength(1);
  });

  it("the fold toggle opens the body with the day strip", async () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} dayItemsByStopId={new Map([["par", [ITEM]]])} />);
    await userEvent.click(desktop().getByRole("button", { name: "Open Paris" }));
    expect(desktop().getByRole("tab", { name: /FRI 11/ })).toHaveAttribute("aria-selected", "true");
    expect(desktop().getByRole("tabpanel")).toHaveTextContent("Louvre");
  });

  it("dropping a plan on another day of the same strip moves it, keeping its times, with Undo", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    const { toastWithUndo } = await import("@/components/ui/undo-toast");
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} dayItemsByStopId={new Map([["par", [ITEM]]])} />, ["par"]);
    await act(async () => {
      await dndCapture.onDragEnd!({
        active: { id: "item:it1", data: { current: { type: "item", stopId: "par", date: "2026-12-11", itemId: "it1", title: "Louvre", startTime: "10:00", endTime: null } } },
        over: { id: "slot:par:2026-12-13", data: { current: { type: "slot", stopId: "par", date: "2026-12-13" } } },
      });
    });
    expect(scheduleItem).toHaveBeenCalledWith("it1", { date: "2026-12-13", startTime: "10:00" });
    const call = vi.mocked(toastWithUndo).mock.calls.at(-1)![0];
    expect(call.title).toBe("Moved to Sun 13");
    call.onUndo();
    expect(scheduleItem).toHaveBeenLastCalledWith("it1", { date: "2026-12-11", startTime: "10:00" });
  });

  it("a drop on another stop's slot does nothing", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    await act(async () => {
      await dndCapture.onDragEnd!({
        active: { id: "item:it1", data: { current: { type: "item", stopId: "par", date: "2026-12-15", itemId: "it1", title: "Louvre", startTime: null, endTime: null } } },
        over: { id: "slot:rom:2026-12-15", data: { current: { type: "slot", stopId: "rom", date: "2026-12-15" } } },
      });
    });
    expect(scheduleItem).not.toHaveBeenCalled();
  });

  it("a failed move shows a destructive toast and offers no Undo", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    const { toastWithUndo } = await import("@/components/ui/undo-toast");
    vi.mocked(scheduleItem).mockResolvedValueOnce({ success: false, errors: {} } as never);
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />, ["par"]);
    await act(async () => {
      await dndCapture.onDragEnd!({
        active: { id: "item:it1", data: { current: { type: "item", stopId: "par", date: "2026-12-11", itemId: "it1", title: "Louvre", startTime: null, endTime: null } } },
        over: { id: "slot:par:2026-12-13", data: { current: { type: "slot", stopId: "par", date: "2026-12-13" } } },
      });
    });
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't move it" });
    expect(toastWithUndo).not.toHaveBeenCalled();
  });

  const MOVE = {
    active: { id: "item:it1", data: { current: { type: "item", stopId: "par", date: "2026-12-11", itemId: "it1", title: "Louvre", startTime: null, endTime: null } } },
    over: { id: "slot:par:2026-12-13", data: { current: { type: "slot", stopId: "par", date: "2026-12-13" } } },
  };

  it("a rejected move (network/thrown) shows the standard destructive toast, no Undo and no flash", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    const { toastWithUndo } = await import("@/components/ui/undo-toast");
    vi.mocked(scheduleItem).mockRejectedValueOnce(new Error("network"));
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />, ["par"]);
    await act(async () => {
      await dndCapture.onDragEnd!(MOVE);
    });
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Something went wrong — nothing was changed. Try again." });
    expect(toastWithUndo).not.toHaveBeenCalled();
    expect(screen.getByTestId("plan-desktop-list").querySelector("[data-flash]")).toBeNull();
  });

  it("a failed Undo (success:false or rejected) shows a destructive toast", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    const { toastWithUndo } = await import("@/components/ui/undo-toast");
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />, ["par"]);
    await act(async () => {
      await dndCapture.onDragEnd!(MOVE);
    });
    // A successful move pulses the target slot (the rejected-move test asserts its absence).
    expect(screen.getByTestId("plan-desktop-list").querySelector("[data-flash]")).not.toBeNull();
    const { onUndo } = vi.mocked(toastWithUndo).mock.calls.at(-1)![0];

    vi.mocked(scheduleItem).mockResolvedValueOnce({ success: false, errors: {} } as never);
    await act(async () => {
      onUndo();
    });
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't undo the move." }));

    vi.mocked(toast).mockClear();
    vi.mocked(scheduleItem).mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      onUndo();
    });
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't undo the move." }));
  });

  it("a rejected firm-up from a rough chapter's Firm up pill toasts and re-enables the pill (P2-1)", async () => {
    vi.mocked(firmUpSegment).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s-1", name: "Lyon", chapterId: "ch-1" })]}
        chapters={[ROUGH_CHAPTER]}
      />,
    );
    await user.click(desktop().getByRole("button", { name: /^firm up$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^firm up$/i }));
    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", title: expect.stringMatching(/nothing was changed/i) }),
      );
    });
    await waitFor(() => expect(desktop().getByRole("button", { name: /^firm up$/i })).not.toBeDisabled());
  });

  it("picking a day for an idea schedules it through scheduleItem, keeping its times", async () => {
    const user = userEvent.setup();
    const { scheduleItem } = await import("@/server/actions/items");
    const idea = { id: "idea-1", title: "Opera", category: "SIGHTSEEING", date: null, startTime: "19:00", endTime: "22:00", stopId: "par" };
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} thingsToDoByStopId={new Map([["par", [idea]]])} />, ["par"]);
    await user.click(desktop().getByRole("button", { name: "Open Opera" }));
    await user.click(await screen.findByRole("button", { name: "Pick a day for Opera" }));
    await user.click(await screen.findByRole("menuitem", { name: /Sat 12/ }));
    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith("idea-1", { date: "2026-12-12", startTime: "19:00", endTime: "22:00" });
    });
  });

  it("registers Add a stop with PlanBody", async () => {
    function Trigger() { const { actions } = usePlanBody(); return <button onClick={actions.addStop}>header add</button>; }
    render(<PlanBody initialOpen={[]} today="2030-01-01"><Trigger /><ItineraryManager {...baseProps} initialStops={[PARIS]} /></PlanBody>);
    await userEvent.click(screen.getByRole("button", { name: "header add" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("uses no banned soft classes", () => {
    const { container } = renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME, MUNICH]} />, ["par"]);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});

describe("mobile list (PLAN.md §7.1)", () => {
  it("renders a row per stop, with mobile-only ids, and no duplicate desktop anchors", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    const mobile = within(screen.getByTestId("plan-mobile-list"));
    expect(mobile.getByRole("button", { name: "Open Paris" })).toHaveAttribute("id", "m-stop-par");
    expect(document.querySelectorAll("#stop-par")).toHaveLength(1);
  });

  it("tapping a row pushes ?stop=<id>", async () => {
    const push = vi.spyOn(window.history, "pushState");
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    await userEvent.click(within(screen.getByTestId("plan-mobile-list")).getByRole("button", { name: "Open Paris" }));
    expect(push).toHaveBeenCalledWith(null, "", expect.stringContaining("stop=par"));
  });

  it("compact leg pills: the missing one reads + Add transport", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    expect(within(screen.getByTestId("plan-mobile-list")).getByRole("button", { name: "Add transport from Paris to Rome" })).toHaveTextContent("Add transport");
  });

  it("uses no banned soft classes", () => {
    const { container } = renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});

describe("mobile sheets (PLAN.md §7.2, §7.3, §7.6)", () => {
  const OPERA = { id: "idea-1", title: "Opera", category: "SIGHTSEEING", date: null, startTime: "19:00", endTime: "22:00", stopId: "par" };

  it("?stop=<id> opens the full-screen stop sheet", () => {
    navState.search = "stop=par";
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    expect(screen.getByRole("dialog", { name: "Paris" })).toBeInTheDocument();
  });

  it("no ?stop= renders no stop sheet", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    expect(screen.queryByRole("dialog", { name: "Paris" })).toBeNull();
  });

  it("the sheet's ⋯ opens the stop actions sheet", async () => {
    navState.search = "stop=par";
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Paris" }));
    const actions = await screen.findByRole("group", { name: "Actions 1" });
    expect(within(actions).getByRole("button", { name: /Edit name & place/ })).toBeInTheDocument();
  });

  it("tapping an idea opens it, and Pick a day inside schedules it, keeping its times", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    navState.search = "stop=par";
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} thingsToDoByStopId={new Map([["par", [OPERA]]])} />);
    await userEvent.click(screen.getByRole("radio", { name: "Ideas 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Open Opera" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pick a day for Opera" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Sat 12/ }));
    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith("idea-1", { date: "2026-12-12", startTime: "19:00", endTime: "22:00" });
    });
  });

  it("Back with an arrived-at ?stop= replaces the URL without stop", async () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const back = vi.spyOn(window.history, "back");
    navState.search = "stop=par";
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    await userEvent.click(screen.getByRole("button", { name: "Back to the plan" }));
    expect(back).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(null, "", expect.not.stringContaining("stop="));
    replace.mockRestore();
    back.mockRestore();
  });

  it("Back after opening from the list goes back through history", async () => {
    const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const view = renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    await userEvent.click(within(screen.getByTestId("plan-mobile-list")).getByRole("button", { name: "Open Paris" }));
    navState.search = "stop=par";
    view.rerender(<PlanBody initialOpen={[]} today="2030-01-01"><ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} /></PlanBody>);
    await userEvent.click(screen.getByRole("button", { name: "Back to the plan" }));
    expect(back).toHaveBeenCalled();
    push.mockRestore();
    back.mockRestore();
  });

  it("deleting the sheet's stop pops the ?stop= entry instead of leaving it behind", async () => {
    const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState");
    const plan = (stops: ItineraryStop[]) => <PlanBody initialOpen={[]} today="2030-01-01"><ItineraryManager {...baseProps} initialStops={stops} /></PlanBody>;
    const view = render(plan([PARIS, ROME]));
    await userEvent.click(within(screen.getByTestId("plan-mobile-list")).getByRole("button", { name: "Open Paris" }));
    navState.search = "stop=par";
    view.rerender(plan([PARIS, ROME]));
    expect(screen.getByRole("dialog", { name: "Paris" })).toBeInTheDocument();
    view.rerender(plan([ROME]));
    expect(back).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    push.mockRestore();
    back.mockRestore();
    replace.mockRestore();
  });

  it("a ?stop= for a stop that no longer exists is stripped in place", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    navState.search = "stop=gone";
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    expect(replace).toHaveBeenCalledWith(null, "", expect.not.stringContaining("stop="));
    replace.mockRestore();
  });

  it("uses no banned soft classes", () => {
    navState.search = "stop=par";
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    expect(document.body.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});

// ---------------------------------------------------------------------------
// Plan motion (MOTION.md P1, P7, P11, P12)
// ---------------------------------------------------------------------------

describe("Plan motion", () => {
  const plan = (stops: ItineraryStop[], extra = {}) => (
    <PlanBody initialOpen={["par"]} today="2030-01-01">
      <ItineraryManager {...baseProps} initialStops={stops} {...extra} />
    </PlanBody>
  );

  it("P1: stop rows rise in, 40ms apart", () => {
    render(plan([PARIS, ROME]));
    const rise = (id: string) => document.getElementById(id)!.closest(".tp-rise-in") as HTMLElement;
    expect(rise("stop-par").getAttribute("style")).toContain("--tp-delay: 0ms");
    expect(rise("stop-rom").getAttribute("style")).toContain("--tp-delay: 40ms");
    expect(rise("m-stop-rom").getAttribute("style")).toContain("--tp-delay: 40ms");
  });

  it("P11: a newly created stop rises in and rings once", async () => {
    const view = render(plan([PARIS]));
    const FLORENCE = makeStop({ id: "flo", name: "Florence", arriveDate: "2026-12-15", departDate: "2026-12-18", timezone: "Europe/Rome", sortOrder: 1 });
    view.rerender(plan([PARIS, FLORENCE]));
    expect(document.getElementById("stop-flo")!.closest(".tp-rise-in")).not.toBeNull();
    await waitFor(() => expect(document.getElementById("stop-flo")).toHaveAttribute("data-highlight", "true"));
    expect(document.getElementById("stop-par")).not.toHaveAttribute("data-highlight");
  });

  it("P12: the list behind the open stop sheet scales back", () => {
    navState.search = "stop=par";
    render(plan([PARIS, ROME]));
    const list = screen.getByTestId("plan-mobile-list");
    expect(list).toHaveAttribute("data-sheet-open");
    expect(list.className).toContain("data-[sheet-open]:scale-[0.97]");
  });

  it("P7: scheduling an idea flashes the day it landed on", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    const ideas = new Map([["par", [{ id: "i1", title: "Orsay", category: "SIGHTSEEING", stopId: "par" }]]]);
    render(plan([PARIS, ROME], { thingsToDoByStopId: ideas }));
    await userEvent.click(desktop().getByRole("button", { name: "Open Orsay" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pick a day for Orsay" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sat 12 Dec" }));
    expect(scheduleItem).toHaveBeenCalledWith("i1", { date: "2026-12-12" });
    await waitFor(() => expect(desktop().getByRole("tab", { name: /SAT 12/ })).toHaveAttribute("data-flash"));
  });

  it("P7: a thrown schedule is reported, and nothing flashes", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    vi.mocked(scheduleItem).mockRejectedValueOnce(new Error("offline"));
    const ideas = new Map([["par", [{ id: "i1", title: "Orsay", category: "SIGHTSEEING", stopId: "par" }]]]);
    render(plan([PARIS, ROME], { thingsToDoByStopId: ideas }));
    await userEvent.click(desktop().getByRole("button", { name: "Open Orsay" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pick a day for Orsay" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sat 12 Dec" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Something went wrong — nothing was changed. Try again." })),
    );
    expect(desktop().getByRole("tab", { name: /SAT 12/ })).not.toHaveAttribute("data-flash");
  });
});

// ---------------------------------------------------------------------------
// Spec 2026-10-01 §F1: the two chapter handlers that did not fail like their
// siblings. A rejected action (the connection is gone) must revert anything
// optimistic and toast — never leave a phantom change, never throw into
// plan/error.tsx.
// ---------------------------------------------------------------------------

describe("rejected chapter actions fail like their siblings (spec 2026-10-01 §F1)", () => {
  const roughChapter = {
    id: "ch-asia",
    name: "Asia",
    colour: "rose" as const,
    startDate: null,
    endDate: null,
    sortOrder: 0,
  };

  it("assign to chapter: a rejected action reverts the optimistic move and toasts", async () => {
    const user = userEvent.setup();
    let reject!: (e: Error) => void;
    vi.mocked(assignStopToChapter).mockImplementationOnce(
      () => new Promise((_, r) => { reject = r; }) as ReturnType<typeof assignStopToChapter>,
    );
    const athens = makeStop({ id: "s-athens", name: "Athens", arriveDate: null, departDate: null });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[athens]} chapters={[roughChapter]} />);

    // Asia starts empty; Athens is Ungrouped.
    expect(desktop().getByText("No stops yet")).toBeInTheDocument();

    await user.click(desktop().getByRole("button", { name: "More actions for Athens" }));
    await user.click(await screen.findByRole("menuitem", { name: /Assign to chapter/ }));
    await user.click(await screen.findByRole("button", { name: "Asia" }));

    // Optimistic: Athens sits under Asia before the server answers.
    await waitFor(() => expect(desktop().getByText("1 stop · rough")).toBeInTheDocument());
    expect(assignStopToChapter).toHaveBeenCalledWith("s-athens", "ch-asia");

    await act(async () => reject(new Error("offline")));

    // Reverted: Asia is empty again, and the Traveller was told.
    await waitFor(() => expect(desktop().getByText("No stops yet")).toBeInTheDocument());
    expect(desktop().queryByText("1 stop · rough")).toBeNull();
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: expect.stringMatching(/nothing was changed/i),
      }),
    );
  });

  it("suggest chapters: a rejected action toasts and releases the in-flight guard", async () => {
    const user = userEvent.setup();
    vi.mocked(suggestChaptersFromCountries).mockRejectedValueOnce(new Error("offline"));
    function Trigger() {
      const { actions } = usePlanBody();
      return <button onClick={actions.suggestChapters}>header suggest</button>;
    }
    render(
      <PlanBody initialOpen={[]} today="2030-01-01">
        <Trigger />
        <ItineraryManager {...baseProps} initialStops={[makeStop()]} />
      </PlanBody>,
    );

    await user.click(screen.getByRole("button", { name: "header suggest" }));

    await waitFor(() =>
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: expect.stringMatching(/nothing was changed/i),
        }),
      ),
    );

    // The guard released, so a retry goes through.
    vi.mocked(suggestChaptersFromCountries).mockResolvedValueOnce({ success: true, created: 0 });
    await user.click(screen.getByRole("button", { name: "header suggest" }));
    await waitFor(() => expect(suggestChaptersFromCountries).toHaveBeenCalledTimes(2));
  });

  it("while offline, a rejected action says so instead of the generic wording", async () => {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      const user = userEvent.setup();
      vi.mocked(suggestChaptersFromCountries).mockRejectedValueOnce(new Error("offline"));
      function Trigger() {
        const { actions } = usePlanBody();
        return <button onClick={actions.suggestChapters}>header suggest</button>;
      }
      render(
        <PlanBody initialOpen={[]} today="2030-01-01">
          <Trigger />
          <ItineraryManager {...baseProps} initialStops={[makeStop()]} />
        </PlanBody>,
      );

      await user.click(screen.getByRole("button", { name: "header suggest" }));

      await waitFor(() =>
        expect(vi.mocked(toast)).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            title: "You're offline. Plan changes need a connection.",
          }),
        ),
      );
    } finally {
      if (original) Object.defineProperty(navigator, "onLine", original);
    }
  });
});
