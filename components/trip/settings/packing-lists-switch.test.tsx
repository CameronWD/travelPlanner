import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionResult } from "@/lib/action-result";

const setPackingListsOpenMock = vi.hoisted(() =>
  vi.fn<(tripId: string, open: boolean) => Promise<ActionResult>>(async () => ({
    success: true,
  })),
);
vi.mock("@/server/actions/trips", () => ({
  setPackingListsOpen: (tripId: string, open: boolean) => setPackingListsOpenMock(tripId, open),
}));

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/ui/use-toast")>();
  return { ...mod, toast: toastMock };
});

import { PackingListsSwitch } from "./packing-lists-switch";

const NAME = "Open packing lists";

beforeEach(() => {
  vi.clearAllMocks();
  setPackingListsOpenMock.mockImplementation(async () => ({ success: true }));
});

describe("PackingListsSwitch", () => {
  it("reflects `open`", () => {
    const { unmount } = render(<PackingListsSwitch tripId="trip-1" open={false} />);
    expect(screen.getByRole("switch", { name: NAME }).getAttribute("aria-checked")).toBe("false");
    unmount();
    render(<PackingListsSwitch tripId="trip-1" open={true} />);
    expect(screen.getByRole("switch", { name: NAME }).getAttribute("aria-checked")).toBe("true");
  });

  it("toggles optimistically and calls the action", async () => {
    const user = userEvent.setup();
    render(<PackingListsSwitch tripId="trip-1" open={false} />);
    const toggle = screen.getByRole("switch", { name: NAME });

    await user.click(toggle);

    expect(setPackingListsOpenMock).toHaveBeenCalledWith("trip-1", true);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("turns off from on", async () => {
    const user = userEvent.setup();
    render(<PackingListsSwitch tripId="trip-1" open={true} />);

    await user.click(screen.getByRole("switch", { name: NAME }));

    expect(setPackingListsOpenMock).toHaveBeenCalledWith("trip-1", false);
  });

  it("rolls back and toasts when the action reports failure", async () => {
    setPackingListsOpenMock.mockResolvedValueOnce({ success: false, errors: { _: ["nope"] } });
    const user = userEvent.setup();
    render(<PackingListsSwitch tripId="trip-1" open={false} />);
    const toggle = screen.getByRole("switch", { name: NAME });

    await user.click(toggle);

    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't update packing lists. Try again." });
  });

  it("rolls back and toasts when the action throws", async () => {
    setPackingListsOpenMock.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<PackingListsSwitch tripId="trip-1" open={false} />);
    const toggle = screen.getByRole("switch", { name: NAME });

    await user.click(toggle);

    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't update packing lists. Try again." });
  });
});
