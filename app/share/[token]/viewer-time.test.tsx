import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";

const { deviceTimeZone } = vi.hoisted(() => ({ deviceTimeZone: vi.fn<() => string | null>() }));
vi.mock("@/lib/tz", async (orig) => ({ ...(await orig<typeof import("@/lib/tz")>()), deviceTimeZone }));

import { ViewerArrival, ViewerNow } from "./viewer-time";
import { wallClock } from "./wall-clock";

const ARRIVES = "2026-12-06T05:45:00Z";
const BERLIN_LOCAL = wallClock(new Date(ARRIVES), "Europe/Berlin");
const props = { instant: ARRIVES, placeLocal: BERLIN_LOCAL };

describe("ViewerArrival", () => {
  it("adds the arrival in the viewer's zone after mount", () => {
    deviceTimeZone.mockReturnValue("Australia/Brisbane");
    render(<ViewerArrival {...props} />);
    expect(screen.getByText("arrives Sun 15:45 your time")).toBeInTheDocument();
  });

  it("names the viewer's own weekday when it differs from the place's", () => {
    deviceTimeZone.mockReturnValue("Australia/Brisbane");
    const instant = "2026-12-06T20:30:00Z";
    render(<ViewerArrival instant={instant} placeLocal={wallClock(new Date(instant), "Europe/Berlin")} />);
    expect(screen.getByText("arrives Mon 06:30 your time")).toBeInTheDocument();
  });

  it("shows nothing when the viewer's wall time equals the place's, whatever the zone names", () => {
    deviceTimeZone.mockReturnValue("Europe/Paris");
    const { container } = render(<ViewerArrival {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the device zone cannot be read", () => {
    deviceTimeZone.mockReturnValue(null);
    const { container } = render(<ViewerArrival {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on the server", () => {
    deviceTimeZone.mockReturnValue("Australia/Brisbane");
    expect(renderToString(<ViewerArrival {...props} />)).toBe("");
  });
});

describe("ViewerNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-06T05:45:10Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("adds the viewer's clock after mount and ticks it each minute", () => {
    deviceTimeZone.mockReturnValue("Australia/Brisbane");
    render(<ViewerNow timeZone="Europe/Berlin" />);
    expect(screen.getByText(/15:45 for you/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText(/15:46 for you/)).toBeInTheDocument();
  });

  it("shows nothing when the zones give the same time", () => {
    deviceTimeZone.mockReturnValue("Europe/Paris");
    const { container } = render(<ViewerNow timeZone="Europe/Berlin" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on the server", () => {
    deviceTimeZone.mockReturnValue("Australia/Brisbane");
    expect(renderToString(<ViewerNow timeZone="Europe/Berlin" />)).toBe("");
  });
});
