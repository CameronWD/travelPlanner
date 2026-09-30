import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SetChaptersEnabledResult } from "@/server/actions/trips";

// Task 21a: the chapters on/off switch now lives in Settings (Cam's decision,
// 2026-09-30) — the Plan page no longer turns chapters on or off. This is the
// only place that calls setChaptersEnabled from the UI.

const setChaptersEnabledMock = vi.hoisted(() =>
  vi.fn<(tripId: string, enabled: boolean) => Promise<SetChaptersEnabledResult>>(async () => ({
    success: true,
  })),
);
vi.mock("@/server/actions/trips", () => ({
  setChaptersEnabled: (tripId: string, enabled: boolean) => setChaptersEnabledMock(tripId, enabled),
}));

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/ui/use-toast")>();
  return { ...mod, toast: toastMock };
});

import { ChaptersSwitch } from "./chapters-switch";

beforeEach(() => {
  vi.clearAllMocks();
  setChaptersEnabledMock.mockImplementation(async () => ({ success: true }));
});

describe("ChaptersSwitch", () => {
  it("renders a named switch reflecting `enabled`", () => {
    render(<ChaptersSwitch tripId="trip-1" enabled={false} />);
    const off = screen.getByRole("switch", { name: "Group this trip into chapters" });
    expect(off.getAttribute("aria-checked")).toBe("false");
  });

  it("shows aria-checked=true when enabled", () => {
    render(<ChaptersSwitch tripId="trip-1" enabled={true} />);
    const on = screen.getByRole("switch", { name: "Group this trip into chapters" });
    expect(on.getAttribute("aria-checked")).toBe("true");
  });

  it("calls setChaptersEnabled(tripId, true) when turning on from off", async () => {
    const user = userEvent.setup();
    render(<ChaptersSwitch tripId="trip-1" enabled={false} />);

    await user.click(screen.getByRole("switch", { name: "Group this trip into chapters" }));

    expect(setChaptersEnabledMock).toHaveBeenCalledWith("trip-1", true);
  });

  it("calls setChaptersEnabled(tripId, false) when turning off from on", async () => {
    const user = userEvent.setup();
    render(<ChaptersSwitch tripId="trip-1" enabled={true} />);

    await user.click(screen.getByRole("switch", { name: "Group this trip into chapters" }));

    expect(setChaptersEnabledMock).toHaveBeenCalledWith("trip-1", false);
  });

  it("disables the switch while the action is in flight", async () => {
    let resolveAction!: (v: { success: true }) => void;
    setChaptersEnabledMock.mockReturnValueOnce(
      new Promise((res) => {
        resolveAction = res;
      }),
    );
    const user = userEvent.setup();
    render(<ChaptersSwitch tripId="trip-1" enabled={false} />);

    const toggle = screen.getByRole("switch", { name: "Group this trip into chapters" });
    await user.click(toggle);

    await waitFor(() => expect(toggle).toBeDisabled());

    resolveAction({ success: true });
    await waitFor(() => expect(toggle).not.toBeDisabled());
  });

  it("rolls back and toasts on failure", async () => {
    setChaptersEnabledMock.mockResolvedValueOnce({ success: false, errors: { _: ["nope"] } });
    const user = userEvent.setup();
    render(<ChaptersSwitch tripId="trip-1" enabled={false} />);

    const toggle = screen.getByRole("switch", { name: "Group this trip into chapters" });
    await user.click(toggle);

    await waitFor(() => {
      expect(toggle.getAttribute("aria-checked")).toBe("false");
    });
    expect(toastMock).toHaveBeenCalledWith({
      variant: "destructive",
      title: "Couldn't update chapters. Try again.",
    });
  });

  it("shows the helper copy explaining what chapters are", () => {
    render(<ChaptersSwitch tripId="trip-1" enabled={false} />);
    expect(
      screen.getByText(
        "Name stretches of the trip, like “the Italy chapter”. Turning this off hides them; nothing is deleted.",
      ),
    ).toBeInTheDocument();
  });
});
