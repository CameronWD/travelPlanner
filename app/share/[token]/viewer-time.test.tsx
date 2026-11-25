import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";

const { deviceTimeZone } = vi.hoisted(() => ({ deviceTimeZone: vi.fn<() => string | null>() }));
vi.mock("@/lib/tz", async (orig) => ({ ...(await orig<typeof import("@/lib/tz")>()), deviceTimeZone }));

import { ViewerArrival, ViewerNow } from "./viewer-time";

const ARRIVES = "2026-12-06T05:45:00Z";

describe("ViewerArrival", () => {
  it("adds the arrival in the viewer's zone after mount", () => {
    deviceTimeZone.mockReturnValue("Australia/Brisbane");
    render(<ViewerArrival arrivesAt={ARRIVES} arrZone="Europe/Berlin" />);
    expect(screen.getByText("arrives Sun 15:45 your time")).toBeInTheDocument();
  });

  it("shows nothing when the viewer's wall time equals the place's, whatever the zone names", () => {
    deviceTimeZone.mockReturnValue("Europe/Paris");
    const { container } = render(<ViewerArrival arrivesAt={ARRIVES} arrZone="Europe/Berlin" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the device zone cannot be read", () => {
    deviceTimeZone.mockReturnValue(null);
    const { container } = render(<ViewerArrival arrivesAt={ARRIVES} arrZone="Europe/Berlin" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on the server", () => {
    deviceTimeZone.mockReturnValue("Australia/Brisbane");
    expect(renderToString(<ViewerArrival arrivesAt={ARRIVES} arrZone="Europe/Berlin" />)).toBe("");
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
