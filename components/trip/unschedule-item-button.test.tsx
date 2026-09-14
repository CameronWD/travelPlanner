/**
 * Tests for UnscheduleItemButton — the client island that renders the real
 * Unschedule control on scheduled (day-view) item rows, with the honest,
 * mode-aware undo toast (P1-5 UI half).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const unscheduleItemMock = vi.fn();
const scheduleItemMock = vi.fn();
const rescheduleItemMock = vi.fn();

vi.mock("@/server/actions/items", () => ({
  unscheduleItem: (...args: unknown[]) => unscheduleItemMock(...args),
  scheduleItem: (...args: unknown[]) => scheduleItemMock(...args),
  rescheduleItem: (...args: unknown[]) => rescheduleItemMock(...args),
}));

// Capture the onUndo callback passed to toastWithUndo so tests can fire it
// directly, the same way wishlist-board.test.tsx exercises undo via the
// rendered "Undo" button — here we go straight to the source since this
// component doesn't render the Toaster itself.
let capturedOnUndo: (() => void | Promise<void>) | null = null;
const toastWithUndoMock = vi.fn((opts: { onUndo: () => void | Promise<void> }) => {
  capturedOnUndo = opts.onUndo;
  return "toast-1";
});
vi.mock("@/components/ui/undo-toast", () => ({
  toastWithUndo: (opts: { onUndo: () => void | Promise<void> }) => toastWithUndoMock(opts),
}));

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

import { UnscheduleItemButton } from "./unschedule-item-button";

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnUndo = null;
});

afterEach(() => {
  cleanup();
});

async function fireOnUndo() {
  if (!capturedOnUndo) throw new Error("onUndo was not captured — toastWithUndo was never called");
  await capturedOnUndo();
}

describe("UnscheduleItemButton", () => {
  it("hides the visible label below sm (mobile overflow fix) but keeps the accessible name via title", () => {
    render(
      <UnscheduleItemButton
        itemId="placed-1"
        itemTitle="Colosseum"
        date="2026-07-02"
        startTime="10:00"
        endTime={null}
        hadStop
      />,
    );
    const button = screen.getByRole("button", { name: /unschedule/i });
    expect(button).toHaveAttribute("title", "Unschedule");
    const label = screen.getByText("Unschedule");
    expect(label.tagName).toBe("SPAN");
    expect(label.className).toContain("hidden");
    expect(label.className).toContain("sm:inline");
  });

  it("placement-removed: undo re-schedules the SOURCE idea", async () => {
    unscheduleItemMock.mockResolvedValue({ success: true, mode: "placement-removed", sourceItemId: "idea-1" });
    render(
      <UnscheduleItemButton
        itemId="placed-1"
        itemTitle="Colosseum"
        date="2026-07-02"
        startTime="10:00"
        endTime={null}
        hadStop
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));

    await waitFor(() => {
      expect(unscheduleItemMock).toHaveBeenCalledWith("placed-1");
    });

    await fireOnUndo();

    expect(scheduleItemMock).toHaveBeenCalledWith("idea-1", { date: "2026-07-02", startTime: "10:00" });
  });

  it("unslotted: undo restores the date in place via rescheduleItem", async () => {
    unscheduleItemMock.mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null });
    render(
      <UnscheduleItemButton
        itemId="direct-1"
        itemTitle="Dinner"
        date="2026-07-03"
        startTime={null}
        endTime={null}
        hadStop
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));

    await waitFor(() => {
      expect(unscheduleItemMock).toHaveBeenCalledWith("direct-1");
    });

    await fireOnUndo();

    expect(rescheduleItemMock).toHaveBeenCalledWith("direct-1", "2026-07-03");
    expect(scheduleItemMock).not.toHaveBeenCalled();
  });

  it("shows 'Removed from this plan' toast (with Wishlist description) on placement-removed", async () => {
    unscheduleItemMock.mockResolvedValue({ success: true, mode: "placement-removed", sourceItemId: "idea-2" });
    render(
      <UnscheduleItemButton
        itemId="placed-2"
        itemTitle="Colosseum"
        date="2026-07-02"
        startTime={null}
        endTime={null}
        hadStop={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));

    await waitFor(() => {
      expect(toastWithUndoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Removed from this plan",
          description: "Colosseum is still on the Wishlist",
        }),
      );
    });
  });

  it("shows 'Moved to things to do' toast on unslotted with a stop", async () => {
    unscheduleItemMock.mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null });
    render(
      <UnscheduleItemButton
        itemId="direct-2"
        itemTitle="Dinner"
        date="2026-07-03"
        startTime={null}
        endTime={null}
        hadStop
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));

    await waitFor(() => {
      expect(toastWithUndoMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Moved to things to do" }),
      );
    });
  });

  it("shows 'Moved to Wishlist' toast on unslotted without a stop", async () => {
    unscheduleItemMock.mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null });
    render(
      <UnscheduleItemButton
        itemId="direct-3"
        itemTitle="Free Walk"
        date="2026-07-04"
        startTime={null}
        endTime={null}
        hadStop={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));

    await waitFor(() => {
      expect(toastWithUndoMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Moved to Wishlist" }),
      );
    });
  });

  it("calls router.refresh() after a successful unschedule", async () => {
    unscheduleItemMock.mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null });
    render(
      <UnscheduleItemButton
        itemId="direct-4"
        itemTitle="Dinner"
        date="2026-07-05"
        startTime={null}
        endTime={null}
        hadStop={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("calls router.refresh() after a successful undo", async () => {
    unscheduleItemMock.mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null });
    rescheduleItemMock.mockResolvedValue({ success: true });
    render(
      <UnscheduleItemButton
        itemId="direct-5"
        itemTitle="Dinner"
        date="2026-07-06"
        startTime={null}
        endTime={null}
        hadStop={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));
    await waitFor(() => expect(unscheduleItemMock).toHaveBeenCalled());
    refreshMock.mockClear();

    await fireOnUndo();

    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows a destructive toast and does not show the undo toast when unscheduleItem fails", async () => {
    unscheduleItemMock.mockResolvedValue({ success: false, errors: { _: ["Server error"] } });
    render(
      <UnscheduleItemButton
        itemId="direct-6"
        itemTitle="Dinner"
        date="2026-07-07"
        startTime={null}
        endTime={null}
        hadStop={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    });
    expect(toastWithUndoMock).not.toHaveBeenCalled();
  });

  it("shows a destructive 'Couldn't undo' toast when the undo mutation throws", async () => {
    unscheduleItemMock.mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null });
    rescheduleItemMock.mockRejectedValue(new Error("boom"));
    render(
      <UnscheduleItemButton
        itemId="direct-7"
        itemTitle="Dinner"
        date="2026-07-08"
        startTime={null}
        endTime={null}
        hadStop={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));
    await waitFor(() => expect(unscheduleItemMock).toHaveBeenCalled());

    await fireOnUndo();

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't undo", variant: "destructive" }),
      );
    });
  });

  // Final-review Finding 4: rescheduleItem/scheduleItem fail by RETURNING
  // {success:false}, not throwing — the try/catch alone never catches that,
  // so a failed undo used to silently no-op instead of telling the user.
  it("shows a destructive 'Couldn't undo' toast when rescheduleItem's undo RESOLVES with success:false", async () => {
    unscheduleItemMock.mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null });
    rescheduleItemMock.mockResolvedValue({ success: false, errors: { _: ["Server error"] } });
    render(
      <UnscheduleItemButton
        itemId="direct-8"
        itemTitle="Dinner"
        date="2026-07-09"
        startTime={null}
        endTime={null}
        hadStop={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));
    await waitFor(() => expect(unscheduleItemMock).toHaveBeenCalled());
    refreshMock.mockClear();

    await fireOnUndo();

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't undo", variant: "destructive" }),
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows a destructive 'Couldn't undo' toast when scheduleItem's undo RESOLVES with success:false", async () => {
    unscheduleItemMock.mockResolvedValue({ success: true, mode: "placement-removed", sourceItemId: "idea-3" });
    scheduleItemMock.mockResolvedValue({ success: false, errors: { _: ["Server error"] } });
    render(
      <UnscheduleItemButton
        itemId="placed-3"
        itemTitle="Colosseum"
        date="2026-07-10"
        startTime={null}
        endTime={null}
        hadStop={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));
    await waitFor(() => expect(unscheduleItemMock).toHaveBeenCalled());
    refreshMock.mockClear();

    await fireOnUndo();

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't undo", variant: "destructive" }),
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
