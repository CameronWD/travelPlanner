import type { Route } from "next";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";
import { setMatchMedia } from "@/test/setup";
import { DayChromeRegistryContext, SETTLE_QUIET_MS, type DayPanel } from "@/components/trip/day/day-carousel";
import { DayCarouselFrame, DayChromeRegistry, RegisterDayChrome, type DayChromeFallbackInputs } from "@/components/trip/day/day-chrome-registry";
import { lerpHeight } from "@/components/trip/day/carousel-maths";

// The registry module also holds the carousel frame, whose real header pulls in server actions.
vi.mock("@/components/trip/day/day-header", () => ({
  DayHeader: ({ heading }: { heading: string }) => (
    <>
      <div data-slot="day-arrow" />
      <h1>{heading}</h1>
    </>
  ),
}));
vi.mock("@/lib/usage/client", () => ({ recordUsageSwipe: vi.fn() }));
vi.mock("@/components/ui/view-transition", () => ({ ViewTransition: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
const push = vi.fn();
const router = { push, prefetch: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/trips/t1/day/2026-12-19", useSearchParams: () => new URLSearchParams() }));

function Shown({ iso }: { iso: string }) {
  const { chromeFor } = React.useContext(DayChromeRegistryContext);
  return <>{chromeFor(iso)}</>;
}

describe("DayChromeRegistry", () => {
  it("follows the seed it is given now, over an older registration, so a day change that keeps the carousel mounted shows the new day's header", () => {
    const { rerender } = render(
      <DayChromeRegistry seed={{ "2026-12-12": <h1>Sat 12 Dec</h1> }}>
        <RegisterDayChrome iso="2026-12-12" chrome={<h1>Sat 12 Dec</h1>} />
        <Shown iso="2026-12-12" />
      </DayChromeRegistry>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Sat 12 Dec");
    rerender(
      <DayChromeRegistry seed={{ "2026-12-12": <h1>Sat 12 Dec · edited</h1>, "2026-12-13": <h1>Sun 13 Dec</h1> }}>
        <Shown iso="2026-12-12" />
      </DayChromeRegistry>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Sat 12 Dec · edited");
  });
});

describe("DayCarouselFrame: the heading travels with the body (below lg)", () => {
  const WIDTH = 390;
  const DAYS = ["2026-12-18", "2026-12-19", "2026-12-20", "2026-12-21"];
  const HEIGHTS: Record<string, number> = { "2026-12-18": 110, "2026-12-19": 96, "2026-12-20": 120, "2026-12-21": 96 };
  const href = (iso: string) => `/trips/t1/day/${iso}` as Route;
  const panels: DayPanel[] = DAYS.map((iso) => ({ iso, href: href(iso), content: <p>{`body ${iso}`}</p> }));
  const fallback: DayChromeFallbackInputs = { tripId: "t1", tripSlug: "t1", tripName: "Europe", days: DAYS.map((iso) => ({ iso, heading: iso })), unreadCount: 0, recent: [], members: [], slimOnPhone: false };
  const FAKE: Parameters<typeof vi.useFakeTimers>[0] = { toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"] };
  const releases: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers(FAKE);
    push.mockReset();
    push.mockImplementation(() => new Promise<void>((r) => releases.push(r)));
    setMatchMedia(false);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 0, left: 0, right: WIDTH, width: WIDTH, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect);
    // Each heading panel is as tall as its day's header.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-day-heading-panel") ? HEIGHTS[this.getAttribute("data-day-heading-panel")!] : 0;
    });
  });
  afterEach(async () => {
    await act(async () => {
      for (const release of releases.splice(0)) release();
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mount(shown: string) {
    const r = render(
      <NavigationPendingProvider>
        <DayCarouselFrame panels={panels} shownDate={shown} chrome={null} seed={{}} fallback={fallback} />
      </NavigationPendingProvider>,
    );
    const scroller = r.container.querySelector("[data-day-carousel]") as HTMLElement;
    const area = r.container.querySelector("[data-day-heading-area]") as HTMLElement;
    const track = r.container.querySelector("[data-day-heading-track]") as HTMLElement;
    const headings = () => Array.from(area.querySelectorAll("h1")).map((h) => h.textContent);
    const publish = (progress: number) => {
      scroller.scrollLeft = (DAYS.indexOf(shown) + progress) * WIDTH;
      fireEvent.scroll(scroller);
    };
    const settle = () => act(() => { vi.advanceTimersByTime(SETTLE_QUIET_MS + 10); });
    return { ...r, scroller, area, track, headings, publish, settle };
  }

  it("a drag a quarter of the way to the next day shows both headings, the next one inert, the track a quarter across, and the height a quarter of the way between them", () => {
    const { area, track, headings, publish } = mount("2026-12-19");
    expect(headings()).toEqual(["2026-12-19"]);
    publish(0.25);
    expect(headings()).toEqual(["2026-12-19", "2026-12-20"]);
    const neighbour = area.querySelector('[data-day-heading-panel="2026-12-20"]') as HTMLElement;
    expect(neighbour).toHaveAttribute("inert");
    expect(neighbour).toHaveAttribute("aria-hidden", "true");
    expect(area.querySelector('[data-day-heading-panel="2026-12-19"]')).not.toHaveAttribute("inert");
    expect(track.style.transform).toBe("translate3d(-25%, 0, 0)");
    expect(area.style.height).toBe(`${lerpHeight(96, 120, 0.25)}px`);
  });

  it("settling back where it began removes the neighbour and clears the height and the transform", () => {
    const { area, track, headings, publish, settle } = mount("2026-12-19");
    publish(0.25);
    publish(0);
    settle();
    expect(headings()).toEqual(["2026-12-19"]);
    expect(area.style.height).toBe("");
    expect(track.style.transform).toBe("");
    expect(push).not.toHaveBeenCalled();
  });

  it("settling on the next day makes its heading the one in view, alone, with the height and transform cleared", () => {
    const { area, track, headings, publish, settle } = mount("2026-12-19");
    publish(0.6);
    publish(1);
    settle();
    expect(headings()).toEqual(["2026-12-20"]);
    expect(area.querySelector('[data-day-heading-panel="2026-12-20"]')).not.toHaveAttribute("inert");
    expect(area.style.height).toBe("");
    expect(track.style.transform).toBe("");
  });

  it("a drag back past the first day renders no neighbour and leaves the height the day's own (review focus 5)", () => {
    const { area, headings, publish } = mount("2026-12-18");
    publish(-0.3);
    expect(headings()).toEqual(["2026-12-18"]);
    expect(area.style.height).toBe("");
    expect(area.style.height).not.toContain("NaN");
  });

  it("a drag towards the next day that comes back to rest before settling leaves one heading, the day in view's (review focus 4)", () => {
    const { area, headings, publish } = mount("2026-12-19");
    publish(0.4);
    expect(headings()).toEqual(["2026-12-19", "2026-12-20"]);
    publish(0);
    expect(headings()).toEqual(["2026-12-19"]);
    expect(area.style.height).toBe("");
    expect(push).not.toHaveBeenCalled();
  });

  it("the day in view's arrows stay where they are while the track moves, and the neighbour's are hidden", () => {
    const { area, publish, settle } = mount("2026-12-19");
    const arrow = () => area.querySelector('[data-day-heading-panel="2026-12-19"] [data-slot="day-arrow"]') as HTMLElement;
    publish(0.25);
    expect(arrow().style.transform).toBe(`translate3d(${0.25 * WIDTH}px, 0, 0)`);
    const neighbour = area.querySelector('[data-day-heading-panel="2026-12-20"]') as HTMLElement;
    expect(neighbour.className).toContain("[&_[data-slot=day-arrow]]:invisible");
    publish(0);
    settle();
    expect(arrow().style.transform).toBe("");
  });

  it("the track has no transition of its own: it follows the finger", () => {
    const { track } = mount("2026-12-19");
    expect(track.className).not.toMatch(/transition/);
  });
});
