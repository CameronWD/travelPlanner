import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const isStandaloneMock = vi.hoisted(() => vi.fn(() => false));
const isIosWithoutInstallMock = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/lib/standalone", () => ({ isStandalone: isStandaloneMock }));
vi.mock("@/components/account/device-state", () => ({ isIosWithoutInstall: isIosWithoutInstallMock }));

import { InstallNudge, INSTALL_NUDGE_KEY } from "./install-nudge";
import { captureInstallPrompt, clearInstallPrompt } from "@/lib/install-prompt";

function fakePrompt(outcome: "accepted" | "dismissed") {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome, platform: "web" });
  return e;
}

beforeEach(() => {
  localStorage.clear();
  clearInstallPrompt();
  isStandaloneMock.mockReturnValue(false);
  isIosWithoutInstallMock.mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

describe("InstallNudge", () => {
  it("renders nothing on the server pass and nothing when neither iOS nor a prompt applies (Review Focus 1)", async () => {
    const { container } = render(<InstallNudge />);
    await waitFor(() => expect(container.querySelector("[data-testid='install-nudge']")).toBeNull());
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("iPhone in Safari: the steps and Got it, which hides it now and on the next render", async () => {
    isIosWithoutInstallMock.mockReturnValue(true);
    const { unmount } = render(<InstallNudge />);
    expect(await screen.findByRole("heading", { name: "Put Teepee on your Home Screen" })).toBeInTheDocument();
    expect(screen.getByText('Tap Share, then "Add to Home Screen", then open Teepee from there.')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByTestId("install-nudge")).toBeNull();
    expect(localStorage.getItem(INSTALL_NUDGE_KEY)).toBe("dismissed");
    unmount();
    render(<InstallNudge />);
    await waitFor(() => expect(screen.queryByTestId("install-nudge")).toBeNull());
  });

  it("Android with a captured prompt: Install fires the prompt; accepted removes the card", async () => {
    const e = fakePrompt("accepted");
    act(() => captureInstallPrompt(e));
    render(<InstallNudge />);
    const install = await screen.findByRole("button", { name: "Install" });
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
    await userEvent.click(install);
    expect(e.prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId("install-nudge")).toBeNull());
  });

  it("Android: a dismissed prompt keeps the card; Not now dismisses it", async () => {
    act(() => captureInstallPrompt(fakePrompt("dismissed")));
    render(<InstallNudge />);
    await userEvent.click(await screen.findByRole("button", { name: "Install" }));
    expect(screen.getByTestId("install-nudge")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("install-nudge")).toBeNull();
  });

  it("installed (standalone): nothing, even on iOS", async () => {
    isStandaloneMock.mockReturnValue(true);
    isIosWithoutInstallMock.mockReturnValue(true);
    render(<InstallNudge />);
    await waitFor(() => expect(screen.queryByTestId("install-nudge")).toBeNull());
  });

  it("is phone-only by class and survives a throwing localStorage (Review Focus 2)", async () => {
    isIosWithoutInstallMock.mockReturnValue(true);
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<InstallNudge />);
    const card = await screen.findByTestId("install-nudge");
    expect(card.className.split(/\s+/)).toContain("md:hidden");
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByTestId("install-nudge")).toBeNull();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
