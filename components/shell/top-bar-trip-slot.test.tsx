import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

let pathname = "/trips";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { TopBarTripSlot } from "@/components/shell/top-bar-trip-slot";

afterEach(cleanup);

const slot = (container: HTMLElement) => container.querySelector("#top-bar-trip-slot") as HTMLElement;
const hiddenWhenEmpty = (el: HTMLElement) => el.className.split(/\s+/).includes("empty:hidden");

describe("TopBarTripSlot", () => {
  it.each(["/trips/t1/day", "/trips/t1/day/", "/trips/my-trip/day"])("reserves the bell's 44px on %s", (p) => {
    pathname = p;
    const el = slot(render(<TopBarTripSlot />).container);
    expect(el.className).toContain("min-w-11");
    expect(hiddenWhenEmpty(el)).toBe(false);
  });
  it.each(["/trips/t1/plan", "/trips/t1", "/trips/t1/today", "/trips", "/globe"])("takes no space when empty on %s", (p) => {
    pathname = p;
    const el = slot(render(<TopBarTripSlot />).container);
    expect(el.className).not.toContain("min-w-");
    expect(hiddenWhenEmpty(el)).toBe(true);
  });
  it("still shows a child on a non-Day path", () => {
    pathname = "/trips/t1/plan";
    const el = slot(render(<TopBarTripSlot />).container);
    el.appendChild(document.createElement("button"));
    expect(el.children).toHaveLength(1);
    expect(hiddenWhenEmpty(el)).toBe(true);
  });
});
