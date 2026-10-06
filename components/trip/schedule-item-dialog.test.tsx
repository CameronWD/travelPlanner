/**
 * Tests for ScheduleItemDialog — focused on forkId threading.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock server actions ────────────────────────────────────────────────────────
vi.mock("@/server/actions/items", () => ({
  scheduleItem: vi.fn().mockResolvedValue({ success: true }),
}));

import { scheduleItem } from "@/server/actions/items";
import { ScheduleItemDialog } from "./schedule-item-dialog";
import type { ScheduleDayOptions } from "@/lib/schedule-day-options";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(props: Partial<React.ComponentProps<typeof ScheduleItemDialog>> = {}) {
  return render(
    <ScheduleItemDialog
      itemId="item-1"
      itemTitle="Eiffel Tower"
      defaultDate="2026-07-10"
      open={true}
      onOpenChange={vi.fn()}
      onSaved={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScheduleItemDialog — forkId threading", () => {
  it("calls scheduleItem without forkId when forkId is not provided", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Date is pre-filled via defaultDate
    const scheduleBtn = screen.getByRole("button", { name: /schedule/i });
    await user.click(scheduleBtn);

    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({ date: "2026-07-10" }),
        undefined,
      );
    });
  });

  it("calls scheduleItem with undefined forkId when forkId is null", async () => {
    const user = userEvent.setup();
    renderDialog({ forkId: null });

    const scheduleBtn = screen.getByRole("button", { name: /schedule/i });
    await user.click(scheduleBtn);

    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({ date: "2026-07-10" }),
        undefined,
      );
    });
  });

  it("calls scheduleItem with the forkId as 3rd arg when forkId is set", async () => {
    const user = userEvent.setup();
    renderDialog({ forkId: "fork-99" });

    const scheduleBtn = screen.getByRole("button", { name: /schedule/i });
    await user.click(scheduleBtn);

    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith(
        "item-1",
        expect.objectContaining({ date: "2026-07-10" }),
        "fork-99",
      );
    });
  });

  it("does not submit when date is missing and shows error", async () => {
    const user = userEvent.setup();
    renderDialog({ defaultDate: undefined });

    const scheduleBtn = screen.getByRole("button", { name: /schedule/i });
    await user.click(scheduleBtn);

    // scheduleItem should NOT have been called
    expect(scheduleItem).not.toHaveBeenCalled();
    expect(screen.getByText("Please pick a date")).toBeInTheDocument();
  });
});

const ROME_STAY = { stopId: "rome", stopName: "Rome", days: ["2026-09-19", "2026-09-20", "2026-09-21"] };
const NEAR: ScheduleDayOptions = { near: true, roughStop: null, stays: [ROME_STAY] };

describe("ScheduleItemDialog — Wishlist day chips (spec 2026-10-05 §E)", () => {
  it("shows the near Stop's days as chips instead of the date field", () => {
    renderDialog({ dayOptions: NEAR });
    const group = screen.getByRole("group", { name: "Rome, Sat 19 Sep – Mon 21 Sep" });
    expect(group).toHaveTextContent("Rome");
    expect(screen.getByRole("button", { name: "Sat 19 Sep" })).toHaveTextContent("Sat 19");
    expect(screen.getByRole("button", { name: "Sun 20 Sep" })).toHaveTextContent("Sun 20");
    expect(screen.getByRole("button", { name: "Mon 21 Sep" })).toHaveTextContent("Mon 21");
    expect(screen.queryByLabelText(/^date/i)).toBeNull();
    expect(screen.queryByText("Not near any Stop — pick any day")).toBeNull();
  });

  it("picking a chip sets the date; times then work as now", async () => {
    const user = userEvent.setup();
    renderDialog({ dayOptions: NEAR });
    expect(screen.getByLabelText(/start time/i)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Sun 20 Sep" }));
    expect(screen.getByRole("button", { name: "Sun 20 Sep" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/start time/i)).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^schedule$/i }));
    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith("item-1", expect.objectContaining({ date: "2026-09-20" }), undefined);
    });
  });

  it("starts with no chip picked, and refuses to send without one", async () => {
    const user = userEvent.setup();
    renderDialog({ dayOptions: NEAR }); // defaultDate 2026-07-10 is not one of the chips
    await user.click(screen.getByRole("button", { name: /^schedule$/i }));
    expect(scheduleItem).not.toHaveBeenCalled();
    expect(screen.getByText("Please pick a date")).toBeInTheDocument();
  });

  it("two stays in the same city are labelled separately", () => {
    renderDialog({
      dayOptions: {
        near: true,
        roughStop: null,
        stays: [ROME_STAY, { stopId: "rome-2", stopName: "Rome", days: ["2026-10-01", "2026-10-02"] }],
      },
    });
    expect(screen.getByRole("group", { name: "Rome, Sat 19 Sep – Mon 21 Sep" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Rome, Thu 1 Oct – Fri 2 Oct" })).toBeInTheDocument();
  });

  it("not near any Stop: every Trip day, with the line", () => {
    renderDialog({ dayOptions: { ...NEAR, near: false } });
    expect(screen.getByText("Not near any Stop — pick any day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sat 19 Sep" })).toBeInTheDocument();
  });

  it("nearest Stop rough: Add to its things to do, then close", async () => {
    const user = userEvent.setup();
    const onAddToThingsToDo = vi.fn().mockResolvedValue({ success: true });
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({
      dayOptions: { near: true, roughStop: { id: "flo", name: "Florence" }, stays: [] },
      onAddToThingsToDo,
      onSaved,
      onOpenChange,
    });
    await user.click(screen.getByRole("button", { name: "Add to Florence's things to do" }));
    await waitFor(() => expect(onAddToThingsToDo).toHaveBeenCalledWith("flo"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(scheduleItem).not.toHaveBeenCalled();
  });

  it("a failed Add to things to do shows why and stays open", async () => {
    const user = userEvent.setup();
    const onAddToThingsToDo = vi
      .fn()
      .mockResolvedValue({ success: false, errors: { stopId: ["Stop does not belong to this trip"] } });
    const onSaved = vi.fn();
    renderDialog({
      dayOptions: { near: true, roughStop: { id: "flo", name: "Florence" }, stays: [] },
      onAddToThingsToDo,
      onSaved,
    });
    await user.click(screen.getByRole("button", { name: "Add to Florence's things to do" }));
    expect(await screen.findByText("Stop does not belong to this trip")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("Pick another date → the date field (keeping the chip's day) → back to the chips → a typed date sends", async () => {
    const user = userEvent.setup();
    renderDialog({ dayOptions: NEAR });
    await user.click(screen.getByRole("button", { name: "Sun 20 Sep" }));
    await user.click(screen.getByRole("button", { name: "Pick another date" }));
    expect(screen.getByLabelText(/^date/i)).toHaveValue("2026-09-20");
    expect(screen.queryByRole("button", { name: "Sun 20 Sep" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back to the nearby days" }));
    expect(screen.getByRole("button", { name: "Sun 20 Sep" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Pick another date" }));
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-09-25" } });
    await user.click(screen.getByRole("button", { name: /^schedule$/i }));
    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith("item-1", expect.objectContaining({ date: "2026-09-25" }), undefined);
    });
  });

  it("a Trip with no dated Stops (no stays, no rough offer) keeps the plain date field", () => {
    renderDialog({ dayOptions: { near: false, roughStop: null, stays: [] } });
    expect(screen.getByLabelText(/^date/i)).toHaveValue("2026-07-10");
    expect(screen.queryByRole("button", { name: "Pick another date" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Back to the/ })).toBeNull();
  });
});
