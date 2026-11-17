import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CopyConfirmationButton } from "@/components/trip/home/copy-confirmation-button";

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, writable: true, configurable: true });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CopyConfirmationButton", () => {
  it("a rejected clipboard write is swallowed and never shows Copied", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    render(<CopyConfirmationButton confirmation="ABC" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByRole("button", { name: "Copy confirmation number" })).toBeInTheDocument();
  });

  it("shows Copied, then returns after 2 s; a second click restarts the timer", async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    render(<CopyConfirmationButton confirmation="ABC" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1500);
      fireEvent.click(screen.getByRole("button"));
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole("button", { name: "Copy confirmation number" })).toBeInTheDocument();
  });

  it("clears its timer on unmount", async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    const { unmount } = render(<CopyConfirmationButton confirmation="ABC" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
