import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { render } from "@testing-library/react";

vi.mock("@/lib/usage/client", () => ({ sendUsageOnce: vi.fn() }));

describe("UsageShareOpened", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  async function load() {
    const { sendUsageOnce } = await import("@/lib/usage/client");
    vi.mocked(sendUsageOnce).mockClear();
    const { UsageShareOpened } = await import("./usage-share-opened");
    return { sendUsageOnce, UsageShareOpened };
  }

  it("renders nothing on the server", async () => {
    const { UsageShareOpened } = await load();
    expect(renderToString(<UsageShareOpened />)).toBe("");
  });

  it("sends share-link-opened once, after paint, across re-renders", async () => {
    const { sendUsageOnce, UsageShareOpened } = await load();
    const { rerender } = render(<UsageShareOpened />);
    expect(sendUsageOnce).not.toHaveBeenCalled();
    rerender(<UsageShareOpened />);
    await vi.advanceTimersByTimeAsync(100);
    expect(sendUsageOnce).toHaveBeenCalledTimes(1);
    expect(sendUsageOnce).toHaveBeenCalledWith("share-link-opened");
    rerender(<UsageShareOpened />);
    await vi.advanceTimersByTimeAsync(100);
    expect(sendUsageOnce).toHaveBeenCalledTimes(1);
  });
});
