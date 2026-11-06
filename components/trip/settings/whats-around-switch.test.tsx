import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SetWhatsAroundEnabledResult } from "@/server/actions/trips";

const setWhatsAroundEnabledMock = vi.hoisted(() =>
  vi.fn<(tripId: string, enabled: boolean) => Promise<SetWhatsAroundEnabledResult>>(async () => ({
    success: true,
  })),
);
vi.mock("@/server/actions/trips", () => ({
  setWhatsAroundEnabled: (tripId: string, enabled: boolean) => setWhatsAroundEnabledMock(tripId, enabled),
}));

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/ui/use-toast")>();
  return { ...mod, toast: toastMock };
});

import { WhatsAroundSwitch } from "./whats-around-switch";

const NAME = "Show What's around";

beforeEach(() => {
  vi.clearAllMocks();
  setWhatsAroundEnabledMock.mockImplementation(async () => ({ success: true }));
});

describe("WhatsAroundSwitch", () => {
  it("reflects `enabled`", () => {
    const { unmount } = render(<WhatsAroundSwitch tripId="trip-1" enabled={false} />);
    expect(screen.getByRole("switch", { name: NAME }).getAttribute("aria-checked")).toBe("false");
    unmount();
    render(<WhatsAroundSwitch tripId="trip-1" enabled={true} />);
    expect(screen.getByRole("switch", { name: NAME }).getAttribute("aria-checked")).toBe("true");
  });

  it("toggles optimistically and calls the action", async () => {
    const user = userEvent.setup();
    render(<WhatsAroundSwitch tripId="trip-1" enabled={false} />);
    const toggle = screen.getByRole("switch", { name: NAME });

    await user.click(toggle);

    expect(setWhatsAroundEnabledMock).toHaveBeenCalledWith("trip-1", true);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("turns off from on", async () => {
    const user = userEvent.setup();
    render(<WhatsAroundSwitch tripId="trip-1" enabled={true} />);

    await user.click(screen.getByRole("switch", { name: NAME }));

    expect(setWhatsAroundEnabledMock).toHaveBeenCalledWith("trip-1", false);
  });

  it("rolls back and toasts when the action reports failure", async () => {
    setWhatsAroundEnabledMock.mockResolvedValueOnce({ success: false, errors: { _: ["nope"] } });
    const user = userEvent.setup();
    render(<WhatsAroundSwitch tripId="trip-1" enabled={false} />);
    const toggle = screen.getByRole("switch", { name: NAME });

    await user.click(toggle);

    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't update What's around. Try again." });
  });

  it("rolls back and toasts when the action throws", async () => {
    setWhatsAroundEnabledMock.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<WhatsAroundSwitch tripId="trip-1" enabled={false} />);
    const toggle = screen.getByRole("switch", { name: NAME });

    await user.click(toggle);

    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't update What's around. Try again." });
  });
});
