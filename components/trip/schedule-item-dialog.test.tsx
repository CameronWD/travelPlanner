/**
 * Tests for ScheduleItemDialog — focused on forkId threading.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock server actions ────────────────────────────────────────────────────────
vi.mock("@/server/actions/items", () => ({
  scheduleItem: vi.fn().mockResolvedValue({ success: true }),
}));

import { scheduleItem } from "@/server/actions/items";
import { ScheduleItemDialog } from "./schedule-item-dialog";

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
