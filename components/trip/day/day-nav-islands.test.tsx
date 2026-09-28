import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";
import { DaySwipe } from "@/components/trip/day/day-swipe";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/trips/t1/day/2026-12-04", useSearchParams: () => new URLSearchParams() }));

describe("DayKeyboardNav", () => {
  beforeEach(() => push.mockClear());
  it("← and → navigate", () => {
    render(<DayKeyboardNav prevHref="/p" nextHref="/n" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push.mock.calls).toEqual([["/n", { transitionTypes: ["day-forward"] }], ["/p", { transitionTypes: ["day-back"] }]]);
  });
  it("does nothing while typing or at the boundary", () => {
    render(<><DayKeyboardNav prevHref={null} nextHref="/n" /><textarea aria-label="j" /></>);
    fireEvent.keyDown(screen.getByLabelText("j"), { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push).not.toHaveBeenCalled();
  });
  it("leaves arrow keys on the Day map to Leaflet", () => {
    render(<><DayKeyboardNav prevHref="/p" nextHref="/n" /><div className="leaflet-container"><button>map</button></div></>);
    fireEvent.keyDown(screen.getByText("map"), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByText("map"), { key: "ArrowLeft" });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("DaySwipe", () => {
  beforeEach(() => push.mockClear());
  const swipe = (el: Element, from: number, to: number) => {
    fireEvent.touchStart(el, { touches: [{ clientX: from, clientY: 100 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: to, clientY: 100 }] });
  };
  it("a left swipe over 40px goes to the next day; a short one does nothing", () => {
    render(<DaySwipe prevHref="/p" nextHref="/n"><p>body</p></DaySwipe>);
    swipe(screen.getByText("body"), 200, 100);
    expect(push).toHaveBeenCalledWith("/n", { transitionTypes: ["day-forward"] });
    swipe(screen.getByText("body"), 200, 180);
    expect(push).toHaveBeenCalledTimes(1);
  });
  it("ignores gestures that start in the strip or the journal", () => {
    render(<DaySwipe prevHref="/p" nextHref="/n"><div data-day-strip><span>strip</span></div><div data-journal><span>journal</span></div></DaySwipe>);
    swipe(screen.getByText("strip"), 200, 100);
    swipe(screen.getByText("journal"), 100, 200);
    expect(push).not.toHaveBeenCalled();
  });
  it("ignores gestures inside a portal (e.g. a dialog) rendered from within the body", () => {
    render(<DaySwipe prevHref="/p" nextHref="/n"><p>body</p>{createPortal(<p>in dialog</p>, document.body)}</DaySwipe>);
    swipe(screen.getByText("in dialog"), 200, 100);
    swipe(screen.getByText("in dialog"), 100, 200);
    expect(push).not.toHaveBeenCalled();
  });
  it("ignores gestures that start on the Day map", () => {
    render(<DaySwipe prevHref="/p" nextHref="/n"><div className="leaflet-container"><span>map</span></div><div data-day-map><span>map2</span></div></DaySwipe>);
    swipe(screen.getByText("map"), 200, 100);
    swipe(screen.getByText("map2"), 100, 200);
    expect(push).not.toHaveBeenCalled();
  });
});
