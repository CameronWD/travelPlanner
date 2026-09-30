import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import * as React from "react";
import { NavigationPendingProvider, useNavigationPending } from "@/components/navigation/navigation-pending";
import { setMatchMedia } from "@/test/setup";
import { DayCarousel, SETTLE_QUIET_MS, useDayCarousel, type DayCarouselApi } from "@/components/trip/day/day-carousel";

const push = vi.fn();
const prefetch = vi.fn();
// One router object, as Next's useRouter() returns across renders (use-app-router.test.tsx).
const router = { push, prefetch, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/trips/t1/day/2026-12-12",
  useSearchParams: () => new URLSearchParams(),
}));

const WIDTH = 390;
const hrefs = ["2026-12-11", "2026-12-12", "2026-12-13"].map((iso) => `/trips/t1/day/${iso}`);
const panels = ["2026-12-11", "2026-12-12", "2026-12-13"].map((iso, i) => ({ iso, href: hrefs[i], content: <p>{`day ${iso}`}</p> }));
const FAKE_TIMERS: Parameters<typeof vi.useFakeTimers>[0] = { toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"] };

let api: DayCarouselApi | null = null;
let pendingPath: string | null = null;
function Probe() {
  const a = useDayCarousel();
  const p = useNavigationPending()?.pathname ?? null;
  // Captured for assertions, not for rendering: react-hooks/globals forbids
  // writing an outer variable during render, so do it in an effect instead.
  React.useEffect(() => {
    api = a;
    pendingPath = p;
  });
  return null;
}

function mount(over: Partial<React.ComponentProps<typeof DayCarousel>> = {}) {
  const r = render(
    <NavigationPendingProvider>
      <DayCarousel panels={panels} shownIndex={1} chrome={<Probe />} {...over} />
    </NavigationPendingProvider>,
  );
  return { ...r, scroller: r.container.querySelector("[data-day-carousel]") as HTMLElement };
}

// React 19 entangles every startTransition backed by a thenable into one
// global "async actions" lane: a push held in flight in one test, still
// unresolved, blocks isPending from ever clearing in a later one. Route
// every "hold this push in flight" mock through here so afterEach can
// release them all before the next test starts.
const releases: Array<() => void> = [];
function held(): Promise<void> {
  return new Promise((r) => releases.push(r));
}

beforeEach(() => {
  push.mockClear();
  prefetch.mockClear();
  api = null;
  // jsdom has no layout: give every element the phone's width so panel maths works.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => WIDTH });
});
afterEach(async () => {
  await act(async () => {
    for (const release of releases.splice(0)) release();
  });
  delete (HTMLElement.prototype as unknown as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as unknown as { onscrollend?: null }).onscrollend;
  vi.useRealTimers();
});

describe("DayCarousel", () => {
  it("renders the days in order, the neighbours inert and hidden, and rests on the day shown", () => {
    const { container, scroller } = mount();
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]"));
    expect(items.map((p) => p.dataset.dayPanel)).toEqual(["2026-12-11", "2026-12-12", "2026-12-13"]);
    expect(items[1]).toHaveAttribute("data-shown", "true");
    expect(items[1]).not.toHaveAttribute("inert");
    for (const n of [items[0], items[2]]) {
      expect(n).toHaveAttribute("inert");
      expect(n).toHaveAttribute("aria-hidden", "true");
      expect(n.className).toContain("h-0");
    }
    expect(scroller).toHaveAttribute("data-shown", "2026-12-12");
    expect(scroller.scrollLeft).toBe(WIDTH);
    expect(scroller.className).toContain("snap-mandatory");
    expect(scroller.className).toContain("overscroll-x-contain");
  });

  it("prefetches both neighbours' routes", () => {
    mount();
    expect(prefetch.mock.calls.map((c) => c[0]).sort()).toEqual([hrefs[0], hrefs[2]]);
  });

  it("a drag that settles on the next day navigates typed day-settle with the vertical position kept", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const heard = vi.fn();
    const { scroller } = mount();
    api!.subscribe(heard);
    scroller.scrollLeft = 2 * WIDTH;
    fireEvent.scroll(scroller);
    expect(push).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(SETTLE_QUIET_MS + 10); });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(hrefs[2], { scroll: false, transitionTypes: ["day-settle"] });
    expect(heard).toHaveBeenLastCalledWith(1, true);
  });

  it("a scroll that rests on the day shown — the mount's own positioning — does nothing (review focus 5)", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const heard = vi.fn();
    const { scroller } = mount();
    api!.subscribe(heard);
    scroller.scrollLeft = WIDTH;
    fireEvent.scroll(scroller);
    act(() => { vi.advanceTimersByTime(SETTLE_QUIET_MS + 10); });
    expect(push).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
  });

  it("subscribers hear the body's progress in panels", () => {
    const heard = vi.fn();
    const { scroller } = mount();
    const off = api!.subscribe(heard);
    scroller.scrollLeft = 1.5 * WIDTH;
    fireEvent.scroll(scroller);
    expect(heard).toHaveBeenLastCalledWith(0.5, false);
    expect(api!.isMoving()).toBe(true);
    off();
    scroller.scrollLeft = WIDTH;
    fireEvent.scroll(scroller);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("goTo a neighbour lights the target at once, glides the body, then navigates once", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller } = mount();
    let handled = false;
    // Held in flight, as the real router's transition is while the server
    // responds — a push that lands unmounts this page (its own re-arm
    // effect, tested separately, only fires for one that doesn't).
    push.mockImplementationOnce(held);
    act(() => { handled = api!.goTo(hrefs[2]); });
    expect(handled).toBe(true);
    expect(pendingPath).toBe(hrefs[2]);
    expect(push).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(120); });
    expect(scroller.scrollLeft).toBeGreaterThan(WIDTH);
    expect(scroller.scrollLeft).toBeLessThan(2 * WIDTH);
    act(() => { vi.advanceTimersByTime(400); });
    expect(scroller.scrollLeft).toBe(2 * WIDTH);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(hrefs[2], { scroll: false, transitionTypes: ["day-settle"] });
  });

  it("goTo turns scroll-snap off for the glide and restores it on arrival", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller } = mount();
    act(() => { api!.goTo(hrefs[2]); });
    expect(scroller.style.scrollSnapType).toBe("none");
    act(() => { vi.advanceTimersByTime(500); });
    expect(scroller.style.scrollSnapType).toBe("");
  });

  it("a glide survives a re-render that changes panels' identity mid-glide", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, rerender } = mount();
    push.mockImplementationOnce(held);
    act(() => { api!.goTo(hrefs[2]); });
    act(() => { vi.advanceTimersByTime(100); });
    const freshPanels = panels.map((p) => ({ ...p }));
    rerender(
      <NavigationPendingProvider>
        <DayCarousel panels={freshPanels} shownIndex={1} chrome={<Probe />} />
      </NavigationPendingProvider>,
    );
    act(() => { vi.advanceTimersByTime(400); });
    expect(scroller.scrollLeft).toBe(2 * WIDTH);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(hrefs[2], { scroll: false, transitionTypes: ["day-settle"] });
  });

  it("goTo a day that is not a panel is false; scrollend and the quiet timer together fire one push", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    Object.defineProperty(HTMLElement.prototype, "onscrollend", { configurable: true, value: null });
    const { scroller } = mount();
    expect(api!.goTo("/trips/t1/day/2026-12-20")).toBe(false);
    scroller.scrollLeft = 2 * WIDTH;
    fireEvent.scroll(scroller);
    fireEvent(scroller, new Event("scrollend"));
    act(() => { vi.advanceTimersByTime(SETTLE_QUIET_MS + 10); });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("a navigation that ends without landing re-arms the carousel", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller } = mount();
    // Left to settle normally: the mocked push never unmounts the page, so
    // this one lands the same way a redirect back to the page shown would —
    // which is exactly the case this test is for.
    act(() => { api!.goTo(hrefs[2]); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(push).toHaveBeenCalledTimes(1);
    expect(scroller.scrollLeft).toBe(WIDTH);
    let again = false;
    // This second one we leave in flight, purely to read where it lands —
    // the re-arm above it is already the point of this test.
    push.mockImplementationOnce(held);
    act(() => { again = api!.goTo(hrefs[0]); });
    expect(again).toBe(true);
    act(() => { vi.advanceTimersByTime(500); });
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenLastCalledWith(hrefs[0], { scroll: false, transitionTypes: ["day-settle"] });
    expect(scroller.scrollLeft).toBe(0);
  });

  it("under reduced motion goTo navigates without a glide (review focus 3)", () => {
    setMatchMedia((q) => q.includes("prefers-reduced-motion"));
    const { scroller } = mount();
    push.mockImplementationOnce(held);
    act(() => { api!.goTo(hrefs[0]); });
    expect(scroller.scrollLeft).toBe(0);
    expect(push).toHaveBeenCalledWith(hrefs[0], { scroll: false, transitionTypes: ["day-settle"] });
  });

  it("first day: only two panels, shown at index 0, no prefetch of a missing neighbour", () => {
    const { container, scroller } = mount({ panels: panels.slice(1), shownIndex: 0 });
    expect(container.querySelectorAll("[data-day-panel]")).toHaveLength(2);
    expect(scroller.scrollLeft).toBe(0);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith(hrefs[2]);
  });
});
