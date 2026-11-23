import type { Route } from "next";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { NavigationPendingProvider, PENDING_NAVIGATION_TIMEOUT_MS, useNavigationPending } from "@/components/navigation/navigation-pending";
import { setMatchMedia } from "@/test/setup";
import { LG_UP } from "@/components/ui/use-media-query";
import { DayCarousel, DayChromeRegistryContext, SETTLE_QUIET_MS, useDayCarousel, useIsDayInView, type DayCarouselApi, type DayPanel } from "@/components/trip/day/day-carousel";
import { DAY_BODY_TRANSITION_WIDE } from "@/components/trip/day/day-transition";

const usage = vi.hoisted(() => ({ recordUsageSwipe: vi.fn() }));
vi.mock("@/lib/usage/client", () => usage);
const push = vi.fn();
const prefetch = vi.fn();
// One router object, as Next's useRouter() returns across renders (use-app-router.test.tsx).
const router = { push, prefetch, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/trips/t1/day/2026-12-12",
  useSearchParams: () => new URLSearchParams(),
}));

// The stable React vitest runs has no native <ViewTransition>, so the wrapper is a
// passthrough anyway; this one also records the class map the body asked for.
const viewTransition = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("@/components/ui/view-transition", () => ({
  ViewTransition: ({ children, ...props }: { children?: React.ReactNode }) => {
    viewTransition.props.push(props);
    return <>{children}</>;
  },
}));

const WIDTH = 390;
const WEEK = ["2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15"];
const SHOWN = 3;
const href = (iso: string) => `/trips/t1/day/${iso}` as Route;

function RegisterChrome({ iso }: { iso: string }) {
  const { register } = React.useContext(DayChromeRegistryContext);
  React.useEffect(() => register(iso, <h1>{`real ${iso}`}</h1>), [register, iso]);
  return null;
}

/** Days in `filled` register their own header, as a filled slot does. */
function week(filled: string[] = ["2026-12-11", "2026-12-12", "2026-12-13"]): DayPanel[] {
  return WEEK.map((iso) => ({
    iso,
    href: href(iso),
    content: (
      <>
        {filled.includes(iso) ? <RegisterChrome iso={iso} /> : null}
        <p>{`day ${iso}`}</p>
      </>
    ),
  }));
}

function TestRegistry({ children }: { children: React.ReactNode }) {
  const [chromes, setChromes] = React.useState(() => new Map<string, React.ReactNode>());
  const register = React.useCallback((iso: string, chrome: React.ReactNode) => setChromes((prev) => (prev.has(iso) ? prev : new Map(prev).set(iso, chrome))), []);
  const value = React.useMemo(() => ({ register, chromeFor: (iso: string) => chromes.get(iso) }), [register, chromes]);
  return <DayChromeRegistryContext.Provider value={value}>{children}</DayChromeRegistryContext.Provider>;
}

const fallback = (iso: string) => <h1>{`fallback ${iso}`}</h1>;
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

type Props = Partial<React.ComponentProps<typeof DayCarousel>>;
function tree(over: Props = {}) {
  return (
    <NavigationPendingProvider>
      <TestRegistry>
        <DayCarousel panels={week()} shownDate={WEEK[SHOWN]} chrome={<Probe />} chromeFallback={fallback} {...over} />
      </TestRegistry>
    </NavigationPendingProvider>
  );
}

function mount(over: Props = {}) {
  const r = render(tree(over));
  const scroller = r.container.querySelector("[data-day-carousel]") as HTMLElement;
  const heading = () => r.container.querySelector("h1")?.textContent;
  const panel = (iso: string) => r.container.querySelector(`[data-day-panel="${iso}"]`) as HTMLElement;
  return { ...r, scroller, heading, panel, rerenderWith: (next: Props) => r.rerender(tree(next)) };
}

/** A drag that comes to rest on panel `idx`, where the browser has no scrollend. */
function dragTo(scroller: HTMLElement, idx: number) {
  scroller.scrollLeft = idx * WIDTH;
  fireEvent.scroll(scroller);
  act(() => { vi.advanceTimersByTime(SETTLE_QUIET_MS + 10); });
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

const defaultMatchMedia = window.matchMedia;

beforeEach(() => {
  push.mockReset();
  push.mockImplementation(held);
  prefetch.mockClear();
  api = null;
  pendingPath = null;
  // A phone unless a test says otherwise: happy-dom's own matchMedia answers for a 1024px window.
  setMatchMedia(false);
  // jsdom has no layout: give every element the phone's width so panel maths works.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 0, left: 0, right: WIDTH, width: WIDTH, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect);
});
afterEach(async () => {
  await act(async () => {
    for (const release of releases.splice(0)) release();
  });
  delete (HTMLElement.prototype as unknown as { onscrollend?: null }).onscrollend;
  window.matchMedia = defaultMatchMedia;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DayCarousel", () => {
  it("positions each panel so absolutely placed hidden inputs stay clipped inside it", () => {
    const withInput = week().map((p) => ({ ...p, content: <input type="file" className="sr-only" aria-label={`photo ${p.iso}`} /> }));
    const { container } = mount({ panels: withInput });
    for (const input of container.querySelectorAll("input.sr-only")) {
      const panel = input.closest("[data-day-panel]") as HTMLElement;
      let positioned = false;
      for (let el: HTMLElement | null = input.parentElement; el; el = el.parentElement) {
        if (el.classList.contains("relative")) positioned = true;
        if (el === panel) break;
      }
      expect(positioned).toBe(true);
    }
  });

  it("renders every day in order and rests on the day shown; neighbours are inert, and days further than one slot away are far too", () => {
    const { container, scroller } = mount();
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]"));
    expect(items.map((p) => p.dataset.dayPanel)).toEqual(WEEK);
    expect(items[SHOWN]).toHaveAttribute("data-shown", "true");
    expect(items[SHOWN]).not.toHaveAttribute("inert");
    expect(items[SHOWN]).not.toHaveAttribute("data-far");
    for (const n of [items[2], items[4]]) {
      expect(n).toHaveAttribute("inert");
      expect(n).toHaveAttribute("aria-hidden", "true");
      expect(n).not.toHaveAttribute("data-far");
      expect(n.className).toContain("h-0");
    }
    for (const f of [items[0], items[1], items[5], items[6]]) {
      expect(f).toHaveAttribute("data-far");
      expect(f).toHaveAttribute("inert");
    }
    expect(scroller).toHaveAttribute("data-shown-day", WEEK[SHOWN]);
    expect(scroller.scrollLeft).toBe(SHOWN * WIDTH);
    expect(scroller.className).toContain("snap-mandatory");
    expect(scroller.className).toContain("overscroll-x-contain");
    // Not stretched to the neighbours' clipped heights, or a short day could never shrink back.
    expect(scroller.className).toContain("items-start");
  });

  it("each panel knows whether it is the day in view, from the moment a settle changes it", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    function InView() {
      return <i data-in-view={String(useIsDayInView())} />;
    }
    const { scroller, panel } = mount({ panels: week().map((p) => ({ ...p, content: <InView /> })) });
    const flag = (iso: string) => panel(iso).querySelector("i")?.dataset.inView;
    expect([flag(WEEK[SHOWN]), flag("2026-12-13")]).toEqual(["true", "false"]);
    dragTo(scroller, 4);
    expect([flag(WEEK[SHOWN]), flag("2026-12-13")]).toEqual(["false", "true"]);
  });

  it("never prefetches: every day is already on the page", () => {
    mount();
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("settling on another day shows its header at once and pushes it once, keeping the vertical position, without pushState", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const pushState = vi.spyOn(window.history, "pushState");
    const days: string[] = [];
    const heard = vi.fn();
    const { scroller, heading, container } = mount();
    expect(heading()).toBe(`real ${WEEK[SHOWN]}`);
    api!.subscribeDay((iso) => days.push(iso));
    api!.subscribe(heard);
    dragTo(scroller, 4);
    expect(heading()).toBe("real 2026-12-13");
    expect(api!.current()).toBe("2026-12-13");
    expect(days).toEqual(["2026-12-13"]);
    expect(heard).toHaveBeenLastCalledWith(1, true);
    expect(push.mock.calls).toEqual([[href("2026-12-13"), { scroll: false }]]);
    expect(container.querySelector('[data-day-panel][data-shown="true"]')).toHaveAttribute("data-day-panel", "2026-12-13");
    expect(pushState).not.toHaveBeenCalled();
  });

  it("a day whose slot has not filled shows the fallback header, then its own once it registers", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, heading, rerenderWith } = mount();
    dragTo(scroller, 4);
    dragTo(scroller, 5);
    expect(heading()).toBe("fallback 2026-12-14");
    rerenderWith({ panels: week(["2026-12-13", "2026-12-14"]) });
    expect(heading()).toBe("real 2026-12-14");
  });

  it("a second settle before the first navigation lands pushes the newer day; the older one is superseded, never queued", async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller } = mount();
    dragTo(scroller, 4);
    dragTo(scroller, 5);
    expect(push.mock.calls.map((c) => c[0])).toEqual([href("2026-12-13"), href("2026-12-14")]);
    await act(async () => { for (const release of releases.splice(0)) release(); });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("swiping back to the day shown before the push lands pushes the day shown again", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller } = mount();
    dragTo(scroller, 4);
    dragTo(scroller, SHOWN);
    expect(push.mock.calls.map((c) => c[0])).toEqual([href("2026-12-13"), href(WEEK[SHOWN])]);
    expect(api!.current()).toBe(WEEK[SHOWN]);
  });

  it("a scroll that rests on the day in view — the mount's own positioning — does nothing (review focus 5)", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const heard = vi.fn();
    const { scroller } = mount();
    api!.subscribe(heard);
    dragTo(scroller, SHOWN);
    expect(push).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
  });

  it("a scrollend at rest — the mount's own positioning, where the browser has scrollend — does nothing", () => {
    Object.defineProperty(HTMLElement.prototype, "onscrollend", { configurable: true, value: null });
    const heard = vi.fn();
    const { scroller } = mount();
    api!.subscribe(heard);
    fireEvent(scroller, new Event("scrollend"));
    expect(push).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
  });

  it("subscribers hear the body's progress in panels from the day in view", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const heard = vi.fn();
    const { scroller } = mount();
    dragTo(scroller, 4);
    const off = api!.subscribe(heard);
    scroller.scrollLeft = 4.5 * WIDTH;
    fireEvent.scroll(scroller);
    expect(heard).toHaveBeenLastCalledWith(0.5, false);
    expect(api!.isMoving()).toBe(true);
    off();
    scroller.scrollLeft = 4 * WIDTH;
    fireEvent.scroll(scroller);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("the settle of a drag survives the navigation landing under it", async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, rerenderWith } = mount();
    dragTo(scroller, 4);
    scroller.scrollLeft = 4.6 * WIDTH;
    fireEvent.scroll(scroller);
    await act(async () => {
      rerenderWith({ panels: week(["2026-12-12", "2026-12-13", "2026-12-14"]), shownDate: "2026-12-13" });
      for (const release of releases.splice(0)) release();
    });
    expect(scroller.scrollLeft).toBe(4.6 * WIDTH);
    dragTo(scroller, 5);
    expect(push.mock.calls.map((c) => c[0])).toEqual([href("2026-12-13"), href("2026-12-14")]);
  });

  it("the day shown arriving from the server for the day in view moves nothing", async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, heading, rerenderWith } = mount();
    dragTo(scroller, 4);
    await act(async () => {
      rerenderWith({ shownDate: "2026-12-13" });
      for (const release of releases.splice(0)) release();
    });
    expect(scroller.scrollLeft).toBe(4 * WIDTH);
    expect(heading()).toBe("real 2026-12-13");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("a day shown that differs from the day in view (Back) moves the scroller there and shows its header", () => {
    const days: string[] = [];
    const { scroller, heading, rerenderWith } = mount();
    api!.subscribeDay((iso) => days.push(iso));
    rerenderWith({ shownDate: "2026-12-10" });
    expect(scroller.scrollLeft).toBe(1 * WIDTH);
    expect(heading()).toBe("fallback 2026-12-10");
    expect(api!.current()).toBe("2026-12-10");
    expect(days).toEqual(["2026-12-10"]);
    expect(push).not.toHaveBeenCalled();
  });

  it("a day shown that arrives mid-drag waits for the drag to settle, and is applied if it settled where it began", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, heading, rerenderWith } = mount();
    scroller.scrollLeft = 3.4 * WIDTH;
    fireEvent.scroll(scroller);
    rerenderWith({ shownDate: "2026-12-10" });
    expect(scroller.scrollLeft).toBe(3.4 * WIDTH);
    expect(heading()).toBe(`real ${WEEK[SHOWN]}`);
    dragTo(scroller, SHOWN);
    expect(scroller.scrollLeft).toBe(1 * WIDTH);
    expect(heading()).toBe("fallback 2026-12-10");
    expect(push).not.toHaveBeenCalled();
  });

  it("a day shown that arrives mid-drag is dropped when the drag settles on another day", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, heading, rerenderWith } = mount();
    scroller.scrollLeft = 3.6 * WIDTH;
    fireEvent.scroll(scroller);
    rerenderWith({ shownDate: "2026-12-10" });
    dragTo(scroller, 4);
    expect(scroller.scrollLeft).toBe(4 * WIDTH);
    expect(heading()).toBe("real 2026-12-13");
    expect(push.mock.calls).toEqual([[href("2026-12-13"), { scroll: false }]]);
  });

  it("settling past the first or last slot goes nowhere", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller } = mount({ shownDate: WEEK[6] });
    expect(scroller.scrollLeft).toBe(6 * WIDTH);
    dragTo(scroller, 7);
    dragTo(scroller, -1);
    expect(push).not.toHaveBeenCalled();
    expect(api!.current()).toBe(WEEK[6]);
  });

  it("goTo the next day, filled or not, lights it at once, glides there and pushes it once on arrival without the progress bar's pending state", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, heading } = mount({ shownDate: WEEK[5] });
    let handled = false;
    act(() => { handled = api!.goTo(href(WEEK[6])); });
    expect(handled).toBe(true);
    expect(pendingPath).toBe(href(WEEK[6]));
    expect(push).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(120); });
    expect(scroller.scrollLeft).toBeGreaterThan(5 * WIDTH);
    expect(scroller.scrollLeft).toBeLessThan(6 * WIDTH);
    act(() => { vi.advanceTimersByTime(400); });
    expect(scroller.scrollLeft).toBe(6 * WIDTH);
    expect(heading()).toBe(`fallback ${WEEK[6]}`);
    expect(push.mock.calls).toEqual([[href(WEEK[6]), { scroll: false }]]);
    expect(pendingPath).toBeNull();
  });

  describe("a day further than one away is a cut (ADR 0065, amended 2026-11-22)", () => {
    function countWrites(el: HTMLElement) {
      const own = Object.getOwnPropertyDescriptor(Element.prototype, "scrollLeft")!;
      const writes: number[] = [];
      Object.defineProperty(el, "scrollLeft", {
        configurable: true,
        get() { return own.get!.call(this); },
        set(v: number) { writes.push(v); own.set!.call(this, v); },
      });
      return writes;
    }

    it("goTo sets the scroller once to that day's panel with no glide, shows the day and its header in the same commit, and pushes it once", () => {
      vi.useFakeTimers(FAKE_TIMERS);
      const commits: Array<[string | undefined, string | null | undefined]> = [];
      let read = () => {};
      const r = render(
        <React.Profiler id="carousel" onRender={() => read()}>
          {tree()}
        </React.Profiler>,
      );
      const scroller = r.container.querySelector("[data-day-carousel]") as HTMLElement;
      read = () => commits.push([r.container.querySelector("h1")?.textContent ?? undefined, r.container.querySelector('[data-day-panel][data-shown="true"]')?.getAttribute("data-day-panel")]);
      const writes = countWrites(scroller);
      act(() => { expect(api!.goTo(href(WEEK[0]))).toBe(true); });
      act(() => { vi.advanceTimersByTime(500); });
      expect(writes).toEqual([0]);
      expect(api!.current()).toBe(WEEK[0]);
      expect(r.container.querySelector("h1")?.textContent).toBe(`fallback ${WEEK[0]}`);
      for (const [h, shown] of commits) expect(h === `fallback ${WEEK[0]}`).toBe(shown === WEEK[0]);
      expect(push.mock.calls).toEqual([[href(WEEK[0]), { scroll: false }]]);
      expect(pendingPath).toBeNull();
    });

    it("an adjacent goTo still glides", () => {
      vi.useFakeTimers(FAKE_TIMERS);
      const { scroller } = mount();
      const writes = countWrites(scroller);
      act(() => { api!.goTo(href("2026-12-11")); });
      act(() => { vi.advanceTimersByTime(500); });
      expect(writes.length).toBeGreaterThan(2);
      expect(writes.at(-1)).toBe(2 * WIDTH);
    });

    it("a far tap during a glide cuts, settling the glide's tap so only the far day is lit and pushed", () => {
      vi.useFakeTimers(FAKE_TIMERS);
      const { scroller } = mount();
      act(() => { api!.goTo(href("2026-12-13")); });
      act(() => { vi.advanceTimersByTime(60); });
      act(() => { api!.goTo(href(WEEK[0])); });
      act(() => { vi.advanceTimersByTime(500); });
      expect(scroller.scrollLeft).toBe(0);
      expect(api!.current()).toBe(WEEK[0]);
      expect(api!.isMoving()).toBe(false);
      expect(pendingPath).toBeNull();
      expect(push.mock.calls).toEqual([[href(WEEK[0]), { scroll: false }]]);
    });

    it("subscribers hear the cut as a settle where the day in view now is", () => {
      vi.useFakeTimers(FAKE_TIMERS);
      const heard = vi.fn();
      mount();
      api!.subscribe(heard);
      act(() => { api!.goTo(href(WEEK[6])); });
      expect(heard.mock.calls).toEqual([[0, true]]);
    });
  });

  it("subscribeNearest hears the day the body mostly shows as a drag crosses halfway either way, and once more on settle", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const near: string[] = [];
    const { scroller } = mount();
    api!.subscribeNearest!((iso) => near.push(iso));
    for (const at of [3.2, 3.49, 3.51, 3.8, 3.4, 3.6, 4]) {
      scroller.scrollLeft = at * WIDTH;
      fireEvent.scroll(scroller);
    }
    expect(near).toEqual(["2026-12-13", WEEK[SHOWN], "2026-12-13"]);
    act(() => { vi.advanceTimersByTime(SETTLE_QUIET_MS + 10); });
    expect(near).toEqual(["2026-12-13", WEEK[SHOWN], "2026-12-13", "2026-12-13"]);
    expect(api!.current()).toBe("2026-12-13");
  });

  it("subscribeNearest follows a day in view that changes without a gesture (Back)", () => {
    const near: string[] = [];
    const { rerenderWith } = mount();
    api!.subscribeNearest!((iso) => near.push(iso));
    rerenderWith({ shownDate: "2026-12-10" });
    expect(near).toEqual(["2026-12-10"]);
  });

  it("a settled drag onto another day records one swipe with the day it settled on and the day it left", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    usage.recordUsageSwipe.mockClear();
    const { scroller } = mount();
    dragTo(scroller, 4);
    expect(usage.recordUsageSwipe.mock.calls).toEqual([["2026-12-13", WEEK[SHOWN]]]);
  });

  it("a glide settling under goTo hands the recorder no day, so nothing is recorded as a swipe", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    Object.defineProperty(HTMLElement.prototype, "onscrollend", { configurable: true, value: null });
    usage.recordUsageSwipe.mockClear();
    const { scroller } = mount();
    act(() => { api!.goTo(href("2026-12-13")); });
    act(() => { vi.advanceTimersByTime(200); });
    scroller.scrollLeft = 4 * WIDTH;
    act(() => { fireEvent(scroller, new Event("scrollend")); });
    expect(usage.recordUsageSwipe).toHaveBeenCalled();
    expect(usage.recordUsageSwipe.mock.calls.every(([settled]) => settled === null)).toBe(true);
  });

  it("a drag that settles back on the day in view is handed to the recorder as no change", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    usage.recordUsageSwipe.mockClear();
    const { scroller } = mount();
    scroller.scrollLeft = SHOWN * WIDTH + WIDTH * 0.4;
    fireEvent.scroll(scroller);
    dragTo(scroller, SHOWN);
    expect(usage.recordUsageSwipe.mock.calls).toEqual([[WEEK[SHOWN], WEEK[SHOWN]]]);
  });

  it("goTo a day that is not a Trip day is false", () => {
    mount();
    expect(api!.goTo("/trips/t1/day/2026-12-20" as Route)).toBe(false);
    expect(api!.goTo(href(WEEK[SHOWN]))).toBe(true);
  });

  it("step goes to the day either side of the day in view, and is false past the Trip's ends", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller } = mount({ shownDate: WEEK[5] });
    act(() => { expect(api!.step(1)).toBe(true); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(scroller.scrollLeft).toBe(6 * WIDTH);
    expect(api!.step(1)).toBe(false);
    act(() => { expect(api!.step(-1)).toBe(true); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(push.mock.calls.map((c) => c[0])).toEqual([href(WEEK[6]), href(WEEK[5])]);
  });

  it("a glide whose scrollend arrives before the tween's last frame pushes once", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    // Chrome fires scrollend on the glide's second-to-last frame, so the
    // scroll-settle path lands before the tween's onDone runs.
    Object.defineProperty(HTMLElement.prototype, "onscrollend", { configurable: true, value: null });
    const { scroller } = mount();
    act(() => { api!.goTo(href("2026-12-13")); });
    act(() => { vi.advanceTimersByTime(200); });
    scroller.scrollLeft = 4 * WIDTH;
    act(() => { fireEvent(scroller, new Event("scrollend")); });
    expect(push).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(300); });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("a scrollend on the day a glide is leaving does not land there", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    Object.defineProperty(HTMLElement.prototype, "onscrollend", { configurable: true, value: null });
    const { scroller } = mount();
    act(() => { api!.goTo(href("2026-12-13")); });
    act(() => { vi.advanceTimersByTime(16); });
    scroller.scrollLeft = SHOWN * WIDTH;
    act(() => { fireEvent(scroller, new Event("scrollend")); });
    expect(push).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(500); });
    expect(push.mock.calls).toEqual([[href("2026-12-13"), { scroll: false }]]);
  });

  it("goTo turns scroll-snap off for the glide and restores it on arrival", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller } = mount();
    act(() => { api!.goTo(href("2026-12-13")); });
    expect(scroller.style.scrollSnapType).toBe("none");
    act(() => { vi.advanceTimersByTime(500); });
    expect(scroller.style.scrollSnapType).toBe("");
  });

  it("a glide survives a re-render that changes panels' identity mid-glide", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, rerenderWith } = mount();
    act(() => { api!.goTo(href("2026-12-13")); });
    act(() => { vi.advanceTimersByTime(100); });
    rerenderWith({ panels: week() });
    act(() => { vi.advanceTimersByTime(400); });
    expect(scroller.scrollLeft).toBe(4 * WIDTH);
    expect(push.mock.calls).toEqual([[href("2026-12-13"), { scroll: false }]]);
  });

  it("scrollend and the quiet timer together fire one push", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    Object.defineProperty(HTMLElement.prototype, "onscrollend", { configurable: true, value: null });
    const { scroller } = mount();
    scroller.scrollLeft = 4 * WIDTH;
    fireEvent.scroll(scroller);
    fireEvent(scroller, new Event("scrollend"));
    act(() => { vi.advanceTimersByTime(SETTLE_QUIET_MS + 10); });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("a navigation that ends with the day unchanged parks the scroller back on the day shown", async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, heading } = mount();
    dragTo(scroller, 4);
    expect(scroller.scrollLeft).toBe(4 * WIDTH);
    await act(async () => { for (const release of releases.splice(0)) release(); });
    expect(scroller.scrollLeft).toBe(SHOWN * WIDTH);
    expect(heading()).toBe(`real ${WEEK[SHOWN]}`);
    expect(api!.current()).toBe(WEEK[SHOWN]);
    dragTo(scroller, 2);
    expect(push).toHaveBeenLastCalledWith(href("2026-12-11"), { scroll: false });
  });

  it("the pending timeout runs from the latest push: settles 10 s apart onto a day that never fills park 15 s after the second, not the first", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const unfilled = week().map((p) => (p.iso === WEEK[5] ? { ...p, content: <div data-day-slot-skeleton /> } : p));
    const { scroller } = mount({ panels: unfilled });
    dragTo(scroller, 4);
    act(() => { vi.advanceTimersByTime(10_000); });
    dragTo(scroller, 5);
    act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_TIMEOUT_MS - 10_000 + 1); });
    expect(scroller.scrollLeft).toBe(5 * WIDTH);
    expect(api!.current()).toBe(WEEK[5]);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(scroller.scrollLeft).toBe(SHOWN * WIDTH);
    expect(api!.current()).toBe(WEEK[SHOWN]);
  });

  it("a push the pending timeout gave up on that later lands on its day moves nothing", async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, heading, rerenderWith } = mount();
    dragTo(scroller, 4);
    act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_TIMEOUT_MS + 1); });
    await act(async () => {
      rerenderWith({ shownDate: "2026-12-13" });
      for (const release of releases.splice(0)) release();
    });
    expect(scroller.scrollLeft).toBe(4 * WIDTH);
    expect(heading()).toBe("real 2026-12-13");
    expect(api!.current()).toBe("2026-12-13");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("a push the pending timeout gave up on that later ends with the day unchanged parks the scroller back on the day shown", async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, heading } = mount();
    dragTo(scroller, 4);
    act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_TIMEOUT_MS + 1); });
    expect(scroller.scrollLeft).toBe(4 * WIDTH);
    await act(async () => { for (const release of releases.splice(0)) release(); });
    expect(scroller.scrollLeft).toBe(SHOWN * WIDTH);
    expect(heading()).toBe(`real ${WEEK[SHOWN]}`);
    expect(api!.current()).toBe(WEEK[SHOWN]);
  });

  it("a push the pending timeout gave up on, which parked back off a day that never filled, then lands on that day: the carousel moves to it and everything agrees", async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const unfilled = week().map((p) => (p.iso === WEEK[5] ? { ...p, content: <div data-day-slot-skeleton /> } : p));
    const { scroller, heading, panel, rerenderWith } = mount({ panels: unfilled });
    dragTo(scroller, 5);
    act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_TIMEOUT_MS + 1); });
    expect(scroller.scrollLeft).toBe(SHOWN * WIDTH);
    expect(api!.current()).toBe(WEEK[SHOWN]);
    await act(async () => {
      rerenderWith({ shownDate: WEEK[5], panels: week([...WEEK]) });
      for (const release of releases.splice(0)) release();
    });
    expect(scroller.scrollLeft).toBe(5 * WIDTH);
    expect(scroller.dataset.shownDay).toBe(WEEK[5]);
    expect(api!.current()).toBe(WEEK[5]);
    expect(panel(WEEK[5]).dataset.shown).toBe("true");
    expect(heading()).toBe(`real ${WEEK[5]}`);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("a push that never ends gives up after the pending timeout and leaves a filled day in view where it is; the next settle pushes again", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, heading } = mount();
    dragTo(scroller, 4);
    act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_TIMEOUT_MS + 1); });
    expect(scroller.scrollLeft).toBe(4 * WIDTH);
    expect(heading()).toBe("real 2026-12-13");
    dragTo(scroller, 3);
    dragTo(scroller, 4);
    expect(push.mock.calls.map((c) => c[0])).toEqual([href("2026-12-13"), href(WEEK[SHOWN]), href("2026-12-13")]);
  });

  it("a push that never ends parks the scroller back after the pending timeout when the day in view never filled", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const unfilled = week().map((p) => (p.iso === WEEK[6] ? { ...p, content: <div data-day-slot-skeleton /> } : p));
    const { scroller } = mount({ panels: unfilled });
    dragTo(scroller, 6);
    act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_TIMEOUT_MS + 1); });
    expect(scroller.scrollLeft).toBe(SHOWN * WIDTH);
    expect(api!.current()).toBe(WEEK[SHOWN]);
  });

  it("Back while a push is in flight: the day shown that arrives is followed at once, not held for the push", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller, heading, rerenderWith } = mount();
    dragTo(scroller, 4);
    rerenderWith({ shownDate: "2026-12-10" });
    expect(scroller.scrollLeft).toBe(1 * WIDTH);
    expect(heading()).toBe("fallback 2026-12-10");
    expect(api!.current()).toBe("2026-12-10");
    dragTo(scroller, 2);
    expect(push).toHaveBeenLastCalledWith(href("2026-12-11"), { scroll: false });
  });

  it("under reduced motion goTo navigates without a glide (review focus 3)", () => {
    setMatchMedia((q) => q.includes("prefers-reduced-motion"));
    const { scroller } = mount();
    act(() => { api!.goTo(href(WEEK[0])); });
    expect(scroller.scrollLeft).toBe(0);
    expect(push).toHaveBeenCalledWith(href(WEEK[0]), { scroll: false });
  });

  it("the day coming into view drops the height it was clipped to as a neighbour, and the others clip to it", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.dayPanel === "2026-12-13" ? 300 : 500;
    });
    const { scroller, panel } = mount();
    expect(panel("2026-12-13").style.height).toBe("500px");
    dragTo(scroller, 4);
    expect(panel("2026-12-13").style.height).toBe("");
    expect(panel(WEEK[SHOWN]).style.height).toBe("300px");
    expect(panel(WEEK[0]).style.height).toBe("300px");
  });

  it("a day that has not filled holds the height of the day it replaced until it fills", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(500);
    const skeleton = <div data-day-slot-skeleton />;
    const unfilled = week().map((p) => (p.iso === WEEK[6] ? { ...p, content: skeleton } : p));
    const { scroller, panel, rerenderWith } = mount({ panels: unfilled });
    dragTo(scroller, 6);
    expect(panel(WEEK[6]).style.minHeight).toBe("500px");
    rerenderWith({ panels: week() });
    expect(panel(WEEK[6]).style.minHeight).toBe("");
    dragTo(scroller, 5);
    expect(panel(WEEK[6]).style.minHeight).toBe("");
  });

  it("scrolled into the header, a header that changes height with the day moves the scroll by the difference, so the body stays still", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.textContent?.endsWith("2026-12-12") ? 194 : this.textContent === "fallback 2026-12-14" ? 150 : 170;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: -120, bottom: 74, left: 0, right: WIDTH, width: WIDTH, height: 194, x: 0, y: -120, toJSON() {} } as DOMRect);
    const { scroller } = mount();
    expect(scrollBy).not.toHaveBeenCalled();
    dragTo(scroller, 5);
    expect(scrollBy).toHaveBeenCalledWith(0, -44);
  });

  it("a header that rewraps on its own (rotation, resize) is the new baseline: a later commit does not scroll for it, and a swap corrects from it", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const observers: Array<() => void> = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(cb: () => void) { observers.push(cb); }
      observe() {}
      disconnect() {}
    });
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    let rewrapped = 194;
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.textContent?.endsWith("2026-12-12") ? rewrapped : this.textContent === "fallback 2026-12-14" ? 150 : 170;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: -120, bottom: 74, left: 0, right: WIDTH, width: WIDTH, height: 194, x: 0, y: -120, toJSON() {} } as DOMRect);
    const { scroller, rerenderWith } = mount();
    rewrapped = 230;
    act(() => { for (const cb of observers) cb(); });
    rerenderWith({ panels: week() });
    expect(scrollBy).not.toHaveBeenCalled();
    dragTo(scroller, 5);
    expect(scrollBy.mock.calls).toEqual([[0, -80]]);
  });

  it("the cold-load positioning script is in the server's markup and never rendered by the client", () => {
    const html = renderToString(tree());
    expect(html).toContain("<script>");
    const error = vi.spyOn(console, "error");
    const { container } = mount();
    expect(container.querySelector("script")).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("DayCarousel on a wide screen (spec 2026-11-18 D1)", () => {
  const desktop = (q: string) => q === LG_UP;

  it("renders only the day in view, in a plain block with no horizontal scroller", () => {
    setMatchMedia(desktop);
    const { container, scroller } = mount();
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]"));
    expect(items.map((p) => p.dataset.dayPanel)).toEqual([WEEK[SHOWN]]);
    expect(items[0]).not.toHaveAttribute("inert");
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
    expect(scroller.className).not.toMatch(/snap/);
  });

  it("a horizontal wheel or trackpad swipe does not change day", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    Object.defineProperty(HTMLElement.prototype, "onscrollend", { configurable: true, value: null });
    setMatchMedia(desktop);
    const { scroller } = mount();
    scroller.scrollLeft = 4 * WIDTH;
    fireEvent.wheel(scroller, { deltaX: 400 });
    fireEvent.scroll(scroller);
    fireEvent(scroller, new Event("scrollend"));
    act(() => { vi.advanceTimersByTime(SETTLE_QUIET_MS + 10); });
    expect(push).not.toHaveBeenCalled();
  });

  it("goTo shows the new day and its header at once, then pushes it", () => {
    setMatchMedia(desktop);
    const days: string[] = [];
    const { container, heading } = mount();
    api!.subscribeDay((iso) => days.push(iso));
    let handled = false;
    act(() => { handled = api!.goTo(href("2026-12-13")); });
    expect(handled).toBe(true);
    expect(Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]")).map((p) => p.dataset.dayPanel)).toEqual(["2026-12-13"]);
    expect(heading()).toBe("real 2026-12-13");
    expect(days).toEqual(["2026-12-13"]);
    expect(push.mock.calls).toEqual([[href("2026-12-13"), { scroll: false }]]);
  });

  it("presses while a push is in flight change the day at once but push nothing; when it lands, the day in view is pushed once", async () => {
    setMatchMedia(desktop);
    const { heading, rerenderWith } = mount();
    act(() => { api!.step(1); });
    act(() => { api!.step(1); });
    act(() => { api!.step(1); });
    // The heading's commit waits here only because this push mock is an async action, which React entangles with later transitions; Next's push is not.
    expect(api!.current()).toBe("2026-12-15");
    expect(push.mock.calls).toEqual([[href("2026-12-13"), { scroll: false }]]);
    rerenderWith({ shownDate: "2026-12-13" });
    await act(async () => { for (const release of releases.splice(0)) release(); });
    expect(api!.current()).toBe("2026-12-15");
    expect(heading()).toBe("fallback 2026-12-15");
    expect(push.mock.calls).toEqual([[href("2026-12-13"), { scroll: false }], [href("2026-12-15"), { scroll: false }]]);
  });

  it("a push that ends without landing on its day, with the view still there, parks back on the day shown", async () => {
    setMatchMedia(desktop);
    const { heading } = mount();
    act(() => { api!.goTo(href("2026-12-13")); });
    await act(async () => { for (const release of releases.splice(0)) release(); });
    expect(api!.current()).toBe(WEEK[SHOWN]);
    expect(heading()).toBe(`real ${WEEK[SHOWN]}`);
  });

  it("a day not in hand holds the day in view, lights its chip and pushes it; when it lands it shows at once", async () => {
    setMatchMedia(desktop);
    const panels = week().map((p) => (p.iso === "2026-12-15" ? { ...p, filled: false } : p));
    const { heading, container, rerenderWith } = mount({ panels });
    act(() => { api!.goTo(href("2026-12-15")); });
    expect(api!.current()).toBe(WEEK[SHOWN]);
    expect(heading()).toBe(`real ${WEEK[SHOWN]}`);
    expect(pendingPath).toBe("/trips/t1/day/2026-12-15");
    expect(push.mock.calls).toEqual([[href("2026-12-15"), { scroll: false }]]);
    rerenderWith({ panels: week(["2026-12-14", "2026-12-15"]), shownDate: "2026-12-15" });
    expect(api!.current()).toBe("2026-12-15");
    expect(Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]")).map((p) => p.dataset.dayPanel)).toEqual(["2026-12-15"]);
    expect(pendingPath).toBeNull();
    await act(async () => { for (const release of releases.splice(0)) release(); });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("under reduced motion a day not in hand is held too", () => {
    setMatchMedia((q) => q === LG_UP || q === "(prefers-reduced-motion: reduce)");
    const panels = week().map((p) => (p.iso === "2026-12-15" ? { ...p, filled: false } : p));
    mount({ panels });
    act(() => { api!.goTo(href("2026-12-15")); });
    expect(api!.current()).toBe(WEEK[SHOWN]);
    expect(pendingPath).toBe("/trips/t1/day/2026-12-15");
  });

  it("a second tap on the held day keeps holding it", () => {
    setMatchMedia(desktop);
    const panels = week().map((p) => (p.iso === "2026-12-15" ? { ...p, filled: false } : p));
    mount({ panels });
    act(() => { api!.goTo(href("2026-12-15")); });
    act(() => { api!.goTo(href("2026-12-15")); });
    expect(api!.current()).toBe(WEEK[SHOWN]);
    expect(pendingPath).toBe("/trips/t1/day/2026-12-15");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("a press during that hold drops it and moves on from the day in view", () => {
    setMatchMedia(desktop);
    const panels = week().map((p) => (p.iso === "2026-12-15" ? { ...p, filled: false } : p));
    mount({ panels });
    act(() => { api!.goTo(href("2026-12-15")); });
    act(() => { api!.step(-1); });
    expect(api!.current()).toBe("2026-12-11");
    expect(pendingPath).toBeNull();
  });

  it("the server's markup already shows one day at lg, before any script runs", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToString(tree());
    const scroller = host.querySelector("[data-day-carousel]") as HTMLElement;
    expect(scroller.className).toContain("lg:block");
    expect(scroller.className).toContain("lg:overflow-visible");
    const items = Array.from(host.querySelectorAll<HTMLElement>("[data-day-panel]"));
    expect(items).toHaveLength(WEEK.length);
    expect(items[SHOWN].className).not.toContain("lg:hidden");
    for (const n of items.filter((_, i) => i !== SHOWN)) expect(n.className).toContain("lg:hidden");
  });

  it("every day change crossfades the body; below lg it does not (spec 2026-11-18 D2)", () => {
    setMatchMedia(desktop);
    viewTransition.props.length = 0;
    const { unmount } = mount();
    expect(viewTransition.props.at(-1)).toEqual(DAY_BODY_TRANSITION_WIDE);
    unmount();
    setMatchMedia(false);
    mount();
    expect(viewTransition.props.at(-1)).toEqual({ default: "none" });
  });

  it("marks the shown day's side column tall when it does not fit the viewport, so it stops sticking", () => {
    setMatchMedia(desktop);
    const withSide = week().map((p) => ({ ...p, content: <div data-day-side /> }));
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(window.innerHeight + 100);
    const { container, unmount } = mount({ panels: withSide });
    expect(container.querySelector("[data-day-side]")).toHaveAttribute("data-tall");
    unmount();
    height.mockReturnValue(window.innerHeight - 200);
    const again = mount({ panels: withSide });
    expect(again.container.querySelector("[data-day-side]")).not.toHaveAttribute("data-tall");
  });
});
