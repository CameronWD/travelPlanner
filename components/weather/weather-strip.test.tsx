import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { WeatherStrip } from "./weather-strip";

const usage = vi.hoisted(() => ({ recordUsageAction: vi.fn() }));
vi.mock("@/lib/usage/client", () => usage);

describe("WeatherStrip", () => {
  it("records the weather detail opening, and not its closing", async () => {
    usage.recordUsageAction.mockClear();
    render(<WeatherStrip summary="Sunny, 24 degrees"><p>Hourly</p></WeatherStrip>);
    const strip = screen.getByRole("button", { name: /Sunny/ });
    await userEvent.click(strip);
    expect(screen.getByText("Hourly")).toBeInTheDocument();
    expect(usage.recordUsageAction.mock.calls).toEqual([["weather-detail-opened"]]);
    await userEvent.click(strip);
    expect(screen.queryByText("Hourly")).toBeNull();
    expect(usage.recordUsageAction).toHaveBeenCalledTimes(1);
  });
});
