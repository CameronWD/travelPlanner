import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshRates = vi.fn();
vi.mock("@/server/actions/rates", () => ({ refreshRates: (...a: unknown[]) => refreshRates(...a) }));
const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...a: unknown[]) => toastMock(...a) }));

import { RatesRefreshButton } from "./rates-refresh-button";

const props = { tripId: "t1", homeCurrency: "AUD", currencies: ["EUR", "GBP"] };

beforeEach(() => {
  refreshRates.mockReset();
  toastMock.mockReset();
});

describe("RatesRefreshButton", () => {
  it("is an icon-only 44px button named Refresh all rates", () => {
    render(<RatesRefreshButton {...props} onRefreshed={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Refresh all rates" });
    expect(button.textContent).toBe("");
    expect(button.className).toContain("size-11");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("refreshes every currency, spinning and disabled while pending, then reports success", async () => {
    let resolve!: (v: unknown) => void;
    refreshRates.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const onRefreshed = vi.fn();
    const user = userEvent.setup();
    render(<RatesRefreshButton {...props} onRefreshed={onRefreshed} />);
    const button = screen.getByRole("button", { name: "Refresh all rates" });
    await user.click(button);

    expect(refreshRates).toHaveBeenCalledTimes(1);
    expect(refreshRates).toHaveBeenCalledWith("t1", ["EUR", "GBP"], "AUD");
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")!.getAttribute("class")).toContain("animate-spin motion-reduce:animate-none");

    resolve({ results: [{ base: "EUR", rate: 1.6 }] });
    await waitFor(() => expect(onRefreshed).toHaveBeenCalledTimes(1));
    expect(button).not.toBeDisabled();
    expect(button.querySelector("svg")!.getAttribute("class")).not.toContain("animate-spin");
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("toasts and does not report success when the action throws", async () => {
    refreshRates.mockRejectedValueOnce(new Error("down"));
    const onRefreshed = vi.fn();
    render(<RatesRefreshButton {...props} onRefreshed={onRefreshed} />);
    await userEvent.click(screen.getByRole("button", { name: "Refresh all rates" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn’t refresh rates. Try again." }));
    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it("treats a result where no rate came back as a failure", async () => {
    refreshRates.mockResolvedValueOnce({ results: [{ base: "EUR", rate: null }, { base: "GBP", rate: null }] });
    const onRefreshed = vi.fn();
    render(<RatesRefreshButton {...props} onRefreshed={onRefreshed} />);
    await userEvent.click(screen.getByRole("button", { name: "Refresh all rates" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(onRefreshed).not.toHaveBeenCalled();
  });
});
