import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => new URLSearchParams(),
}));

import { NavigationProgress } from "./navigation-progress";
import { NavigationPendingProvider, useBeginNavigation } from "./navigation-pending";

function Go() {
  const begin = useBeginNavigation();
  return <button onClick={() => begin("/trips/t1/plan")}>go</button>;
}

afterEach(() => vi.useRealTimers());

describe("NavigationProgress", () => {
  // Each render/rerender below builds its OWN element (rather than reusing one
  // cached `ui` element across both calls): passing the identical element
  // object back into `rerender` is a real React footgun — since its props are
  // then referentially unchanged and nothing else has a state update pending
  // on that fiber, React's bailout optimization skips re-invoking the
  // component tree entirely (verified against node_modules/react-dom's
  // beginWork), so it would never re-read the mocked usePathname()'s new
  // value. A fresh element each render sidesteps that; nothing about what's
  // rendered or asserted changes.
  const renderUi = () => (
    <NavigationPendingProvider>
      <NavigationProgress delayMs={300} />
      <Go />
    </NavigationPendingProvider>
  );

  it("stays hidden until a navigation has been pending for the delay, then shows, then hides when it lands", () => {
    vi.useFakeTimers();
    const { rerender } = render(renderUi());
    const bar = () => document.querySelector("[data-nav-progress]")!;
    expect(bar()).toHaveAttribute("data-nav-progress", "hidden");
    fireEvent.click(screen.getByText("go"));
    act(() => { vi.advanceTimersByTime(200); });
    expect(bar()).toHaveAttribute("data-nav-progress", "hidden");
    act(() => { vi.advanceTimersByTime(150); });
    expect(bar()).toHaveAttribute("data-nav-progress", "visible");
    expect(bar()).not.toHaveAttribute("hidden");
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    rerender(renderUi());
    expect(bar()).toHaveAttribute("data-nav-progress", "hidden");
  });

  it("never shows for a navigation that lands inside the delay", () => {
    vi.useFakeTimers();
    const { rerender } = render(renderUi());
    fireEvent.click(screen.getByText("go"));
    act(() => { vi.advanceTimersByTime(100); });
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    rerender(renderUi());
    act(() => { vi.advanceTimersByTime(500); });
    expect(document.querySelector("[data-nav-progress]")).toHaveAttribute("data-nav-progress", "hidden");
  });
});
