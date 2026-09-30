import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { markArrival } from "@/lib/new-trip/arrival";
import { ArrivalDropIn } from "./arrival-drop-in";

describe("ArrivalDropIn (MOTION N13 step 3)", () => {
  beforeEach(() => sessionStorage.clear());
  it("drops the countdown tile in when arriving from New trip", () => {
    markArrival("t1");
    render(<ArrivalDropIn tripId="t1" className="h-full"><p>tile</p></ArrivalDropIn>);
    expect(screen.getByText("tile").parentElement!.className).toMatch(/\btp-drop-in\b/);
    expect(screen.getByText("tile").parentElement!.className).toMatch(/\bh-full\b/);
  });
  it("does nothing on an ordinary visit", () => {
    render(<ArrivalDropIn tripId="t1"><p>tile</p></ArrivalDropIn>);
    expect(screen.getByText("tile").parentElement!.className).not.toMatch(/tp-drop-in/);
  });
  it("server-renders without the drop-in and leaves the flag for the client", () => {
    markArrival("t1");
    const html = renderToString(<ArrivalDropIn tripId="t1" className="h-full"><p>tile</p></ArrivalDropIn>);
    expect(html).not.toMatch(/tp-drop-in/);
    expect(sessionStorage.getItem("teepee:trip-arrival")).toBe("t1");
  });
});
