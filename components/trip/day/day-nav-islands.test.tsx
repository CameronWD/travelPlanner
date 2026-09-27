import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";
import { DaySwipe } from "@/components/trip/day/day-swipe";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("DayKeyboardNav", () => {
  beforeEach(() => push.mockClear());
  it("← and → navigate", () => {
    render(<DayKeyboardNav prevHref="/p" nextHref="/n" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push.mock.calls.map((c) => c[0])).toEqual(["/n", "/p"]);
  });
  it("does nothing while typing or at the boundary", () => {
    render(<><DayKeyboardNav prevHref={null} nextHref="/n" /><textarea aria-label="j" /></>);
    fireEvent.keyDown(screen.getByLabelText("j"), { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
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
    expect(push).toHaveBeenCalledWith("/n");
    swipe(screen.getByText("body"), 200, 180);
    expect(push).toHaveBeenCalledTimes(1);
  });
  it("ignores gestures that start in the strip or the journal", () => {
    render(<DaySwipe prevHref="/p" nextHref="/n"><div data-day-strip><span>strip</span></div><div data-journal><span>journal</span></div></DaySwipe>);
    swipe(screen.getByText("strip"), 200, 100);
    swipe(screen.getByText("journal"), 100, 200);
    expect(push).not.toHaveBeenCalled();
  });
});
