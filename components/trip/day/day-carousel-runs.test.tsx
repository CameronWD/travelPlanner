import type { Route } from "next";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import * as React from "react";
import { NavigationPendingProvider, PENDING_NAVIGATION_TIMEOUT_MS, useNavigationPending } from "@/components/navigation/navigation-pending";
import { setMatchMedia } from "@/test/setup";
import { LG_UP } from "@/components/ui/use-media-query";
import { DayCarousel, DayChromeRegistryContext, useDayCarousel, type DayCarouselApi, type DayPanel } from "@/components/trip/day/day-carousel";
import { DayArrow } from "@/components/trip/day/day-arrow";
import { QUICK_PRESS_MS } from "@/components/trip/day/day-moves";

// A router that behaves like Next's: push and replace return nothing, and the
// navigation stays pending (the caller's transition with it) until the test
// lands it, in one commit with the new page props, or ends it unlanded.
interface Page {
  shownDate: string;
  panels: DayPanel[];
}
type Thenable = Promise<Page> & { status?: string; value?: Page };
const nav = vi.hoisted(() => ({
  page: null as unknown as { shownDate: string; panels: unknown[] },
  set: null as null | ((p: unknown) => void),
  calls: [] as Array<{ method: "push" | "replace"; href: string; end: (next?: unknown) => void }>,
  types: [] as string[],
}));
function navigation(method: "push" | "replace") {
  return (href: string) => {
    let resolve!: (p: Page) => void;
    const promise = new Promise<Page>((r) => (resolve = r));
    nav.set!(promise);
    nav.calls.push({
      method,
      href,
      end: (next?: unknown) => {
        const page = (next ?? nav.page) as Page;
        nav.page = page;
        resolve(page);
      },
    });
  };
}
const push = vi.fn(navigation("push"));
const replace = vi.fn(navigation("replace"));
const router = { push, replace, prefetch: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => `/trips/t1/day/${nav.page.shownDate}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stripped so they never reach the DOM
  default: ({ href, children, onNavigate, transitionTypes: _t, scroll: _s, ...rest }: { href: string; children: React.ReactNode; onNavigate?: (e: { preventDefault(): void }) => void } & Record<string, unknown>) => (
    <a href={href} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a>
  ),
}));
vi.mock("@/lib/usage/client", () => ({ recordUsageSwipe: vi.fn(), recordUsageDayChange: vi.fn() }));
vi.mock("@/components/ui/view-transition", () => ({ ViewTransition: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    addTransitionType: (type: string) => {
      nav.types.push(type);
      (real as unknown as { addTransitionType?: (t: string) => void }).addTransitionType?.(type);
    },
  };
});

const WEEK = ["2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15"];
const href = (iso: string) => `/trips/t1/day/${iso}` as Route;
const desktop = (q: string) => q === LG_UP;

let chromeOf = (iso: string): React.ReactNode => <h1>{`real ${iso}`}</h1>;
function RegisterChrome({ iso }: { iso: string }) {
  const { register } = React.useContext(DayChromeRegistryContext);
  React.useEffect(() => register(iso, chromeOf(iso)), [register, iso]);
  return null;
}

/** The page the server sends for `shown`: days within `reach` filled, the rest skeletons. */
function pageFor(shown: string, reach = 2): Page {
  const at = WEEK.indexOf(shown);
  return {
    shownDate: shown,
    panels: WEEK.map((iso, i) => {
      const filled = Math.abs(i - at) <= reach;
      return {
        iso,
        href: href(iso),
        filled,
        content: filled ? (
          <>
            <RegisterChrome iso={iso} />
            <p>{`day ${iso}`}</p>
          </>
        ) : (
          <div data-day-slot-skeleton>skeleton</div>
        ),
      };
    }),
  };
}

function TestRegistry({ children }: { children: React.ReactNode }) {
  const [chromes, setChromes] = React.useState(() => new Map<string, React.ReactNode>());
  const register = React.useCallback((iso: string, chrome: React.ReactNode) => setChromes((prev) => (prev.has(iso) ? prev : new Map(prev).set(iso, chrome))), []);
  const value = React.useMemo(() => ({ register, chromeFor: (iso: string) => chromes.get(iso) }), [register, chromes]);
  return <DayChromeRegistryContext.Provider value={value}>{children}</DayChromeRegistryContext.Provider>;
}

let api: DayCarouselApi | null = null;
let pendingPath: string | null = null;
function Probe() {
  const a = useDayCarousel();
  const p = useNavigationPending()?.pathname ?? null;
  React.useEffect(() => {
    api = a;
    pendingPath = p;
  });
  return null;
}

function fulfilled(page: Page): Thenable {
  return Object.assign(Promise.resolve(page), { status: "fulfilled", value: page });
}

function Routed({ first, fallback }: { first: Page; fallback: (iso: string) => React.ReactNode }) {
  const [promise, setPromise] = React.useState<Thenable>(() => fulfilled(first));
  React.useEffect(() => {
    nav.set = (p) => setPromise(p as Thenable);
  }, []);
  const page = React.use(promise as Promise<Page>);
  return <DayCarousel panels={page.panels} shownDate={page.shownDate} chrome={<Probe />} chromeFallback={fallback} />;
}

const plainFallback = (iso: string) => <h1>{`fallback ${iso}`}</h1>;

function mount(first: Page, fallback = plainFallback) {
  nav.page = first;
  const r = render(
    <NavigationPendingProvider>
      <TestRegistry>
        <React.Suspense fallback={null}>
          <Routed first={first} fallback={fallback} />
        </React.Suspense>
      </TestRegistry>
    </NavigationPendingProvider>,
  );
  const body = () => r.container.querySelector("[data-day-carousel]") as HTMLElement;
  return { ...r, body, shown: () => body().dataset.shownDay, heading: () => r.container.querySelector("h1")?.textContent };
}

const calls = () => nav.calls.map((c) => [c.method, c.href.split("/").at(-1)]);
async function settleNavigation(end: () => void) {
  await act(async () => end());
  for (let i = 0; i < 5; i++) await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve(); });
}
async function land(iso: string, reach = 2) {
  await settleNavigation(() => nav.calls.at(-1)!.end(pageFor(iso, reach)));
}
async function endUnlanded() {
  await settleNavigation(() => nav.calls.at(-1)!.end());
}
/** Presses a quick run apart, on the fake clock. */
async function quick(fn: () => void) {
  act(() => { vi.advanceTimersByTime(QUICK_PRESS_MS / 2); });
  await press(fn);
}
/** Under an awaited act: a press can start a navigation, and React only retries a suspension it was awaited for. */
async function press(fn: () => void) {
  await act(async () => fn());
}
const FAKE: Parameters<typeof vi.useFakeTimers>[0] = { toFake: ["setTimeout", "clearTimeout", "Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"] };

beforeEach(() => {
  chromeOf = (iso) => <h1>{`real ${iso}`}</h1>;
  vi.useFakeTimers(FAKE);
  nav.calls = [];
  nav.types = [];
  push.mockClear();
  replace.mockClear();
  api = null;
  pendingPath = null;
  setMatchMedia(desktop);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 0, left: 0, right: 390, width: 390, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect);
});
afterEach(async () => {
  await act(async () => {
    for (const c of nav.calls) c.end();
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a quick run through days on a wide screen", () => {
  it("pushes once, then replaces: the run leaves one new history entry, and ends where it stopped", async () => {
    const { shown, heading } = mount(pageFor("2026-12-12"));
    await press(() => { api!.step(1); });
    await quick(() => { api!.step(1); });
    await quick(() => { api!.step(1); });
    expect(calls()).toEqual([["push", "2026-12-13"]]);
    await land("2026-12-13");
    expect(calls()).toEqual([["push", "2026-12-13"], ["replace", "2026-12-15"]]);
    await land("2026-12-15");
    expect(api!.current()).toBe("2026-12-15");
    expect(shown()).toBe("2026-12-15");
    expect(heading()).toBe("real 2026-12-15");
    expect(calls()).toHaveLength(2);
  });

  it("a push that ends without landing after the view moved on: the next is a push, so the day it left stays in history", async () => {
    mount(pageFor("2026-12-12"));
    await press(() => { api!.step(1); });
    await quick(() => { api!.step(1); });
    await endUnlanded();
    expect(calls()).toEqual([["push", "2026-12-13"], ["push", "2026-12-14"]]);
    await land("2026-12-14");
    expect(api!.current()).toBe("2026-12-14");
  });

  it("turning back mid-flight: the landing of the day left behind does not take the content from the day in view", async () => {
    const { container, shown } = mount(pageFor("2026-12-12"));
    await press(() => { api!.goTo(href("2026-12-14")); });
    await quick(() => { api!.goTo(href("2026-12-10")); });
    expect(container.textContent).toContain("day 2026-12-10");
    await land("2026-12-14");
    expect(api!.current()).toBe("2026-12-10");
    expect(container.textContent).toContain("day 2026-12-10");
    expect(container.querySelector("[data-day-slot-skeleton]")).toBeNull();
    expect(calls()).toEqual([["push", "2026-12-14"], ["replace", "2026-12-10"]]);
    await land("2026-12-10");
    expect(shown()).toBe("2026-12-10");
    expect(api!.current()).toBe("2026-12-10");
  });

  it("a chip during an arrow run is the day the run ends on", async () => {
    const { shown } = mount(pageFor("2026-12-12"));
    await press(() => { api!.step(1); });
    await quick(() => { api!.step(1); });
    await quick(() => { api!.goTo(href("2026-12-11")); });
    await land("2026-12-13");
    expect(calls()).toEqual([["push", "2026-12-13"], ["replace", "2026-12-11"]]);
    await land("2026-12-11");
    expect(shown()).toBe("2026-12-11");
    expect(api!.current()).toBe("2026-12-11");
  });

  it("a held far day, then an arrow: the arrow's day keeps its content when the held day lands, and is where it ends", async () => {
    const { container, shown } = mount(pageFor("2026-12-12", 1));
    await press(() => { api!.goTo(href("2026-12-15")); });
    expect(api!.current()).toBe("2026-12-12");
    expect(pendingPath).toBe("/trips/t1/day/2026-12-15");
    act(() => { vi.advanceTimersByTime(QUICK_PRESS_MS * 2); });
    await press(() => { api!.step(-1); });
    expect(api!.current()).toBe("2026-12-11");
    expect(pendingPath).toBeNull();
    await land("2026-12-15", 1);
    expect(container.textContent).toContain("day 2026-12-11");
    expect(container.querySelector("[data-day-slot-skeleton]")).toBeNull();
    expect(calls()).toEqual([["push", "2026-12-15"], ["replace", "2026-12-11"]]);
    await land("2026-12-11", 1);
    expect(shown()).toBe("2026-12-11");
  });

  it("a hold the pending timeout gave up on lets go: the same chip holds and pushes again", async () => {
    mount(pageFor("2026-12-12", 1));
    await press(() => { api!.goTo(href("2026-12-15")); });
    act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_TIMEOUT_MS + 10); });
    expect(pendingPath).toBeNull();
    await press(() => { api!.goTo(href("2026-12-15")); });
    expect(api!.current()).toBe("2026-12-12");
    expect(pendingPath).toBe("/trips/t1/day/2026-12-15");
    expect(calls()).toEqual([["push", "2026-12-15"], ["push", "2026-12-15"]]);
  });

  it("a press and its reverse that commit together leave nothing pending: an unlanded push then parks back, and a far tap still holds", async () => {
    const { heading } = mount(pageFor("2026-12-12", 1));
    await press(() => { api!.step(1); });
    await act(async () => {
      vi.advanceTimersByTime(QUICK_PRESS_MS / 2);
      api!.step(1);
      vi.advanceTimersByTime(QUICK_PRESS_MS / 2);
      api!.step(-1);
    });
    expect(api!.current()).toBe("2026-12-13");
    await endUnlanded();
    expect(api!.current()).toBe("2026-12-12");
    expect(heading()).toBe("real 2026-12-12");
    act(() => { vi.advanceTimersByTime(QUICK_PRESS_MS * 2); });
    await press(() => { api!.goTo(href("2026-12-15")); });
    expect(api!.current()).toBe("2026-12-12");
    expect(pendingPath).toBe("/trips/t1/day/2026-12-15");
  });

  it("only the first press of a run crossfades; under reduced motion none does", async () => {
    mount(pageFor("2026-12-12"));
    await press(() => { api!.step(1); });
    await quick(() => { api!.step(1); });
    expect(nav.types).toEqual(["day-forward"]);
    act(() => { vi.advanceTimersByTime(QUICK_PRESS_MS * 2); });
    setMatchMedia((q) => q === LG_UP || q === "(prefers-reduced-motion: reduce)");
    await press(() => { api!.step(-1); });
    expect(nav.types).toEqual(["day-forward"]);
    expect(api!.current()).toBe("2026-12-13");
  });
});

describe("a click React did not handle (the outgoing header during a view transition)", () => {
  it("from lg, a day link's click is done by the carousel, never followed as a page load", async () => {
    chromeOf = (iso) => {
      const next = WEEK[WEEK.indexOf(iso) + 1];
      return next ? <a href={href(next)} data-day-step="1">{`raw next from ${iso}`}</a> : null;
    };
    mount(pageFor("2026-12-12"));
    const link = screen.getByText("raw next from 2026-12-12");
    let event!: MouseEvent;
    await press(() => {
      event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(api!.current()).toBe("2026-12-13");
    expect(calls()).toEqual([["push", "2026-12-13"]]);
  });
  it("below lg it is left alone", async () => {
    setMatchMedia(false);
    chromeOf = (iso) => <a href={href(iso)} data-day-step="1">{`raw ${iso}`}</a>;
    mount(pageFor("2026-12-12"));
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    // jsdom does not navigate, so the default action is harmless here.
    await press(() => { screen.getAllByText("raw 2026-12-12")[0].dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(calls()).toEqual([]);
  });
});

describe("the arrow below lg", () => {
  it("goes to the day its header's href names, through the carousel's step", async () => {
    setMatchMedia(false);
    const withArrow = (iso: string) => {
      const next = WEEK[WEEK.indexOf(iso) + 1];
      return <DayArrow href={next ? href(next) : null} label={next ? `Next day: ${next}` : null} dir="next" />;
    };
    chromeOf = withArrow;
    mount(pageFor("2026-12-12"), withArrow);
    const link = screen.getAllByRole("link", { name: "Next day: 2026-12-13" })[0];
    expect(link).toHaveAttribute("href", href("2026-12-13"));
    await press(() => fireEvent.click(link));
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(calls()).toEqual([["push", "2026-12-13"]]);
    expect(api!.current()).toBe("2026-12-13");
  });
});
