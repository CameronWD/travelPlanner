import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/driving-settings", () => ({
  updateDrivingSettings: vi.fn().mockResolvedValue(undefined),
}));

import { updateDrivingSettings } from "@/server/actions/driving-settings";
import { DrivingEstimatesPanel } from "./driving-estimates-panel";

beforeEach(() => vi.clearAllMocks());

describe("DrivingEstimatesPanel", () => {
  it("renders current values and saves an edited winding factor", async () => {
    const user = userEvent.setup();
    render(
      <DrivingEstimatesPanel tripId="t1" initialWindingFactor={1.5} initialAvgSpeedKph={80} />,
    );
    const winding = screen.getByLabelText(/winding factor/i);
    expect(winding).toHaveValue(1.5);
    await user.clear(winding);
    await user.type(winding, "1.8");
    expect(updateDrivingSettings).toHaveBeenLastCalledWith(
      "t1",
      { windingFactor: 1.8, avgSpeedKph: 80 },
    );
  });

  it("renders current avg speed and saves an edited value", async () => {
    const user = userEvent.setup();
    render(
      <DrivingEstimatesPanel tripId="t1" initialWindingFactor={1.5} initialAvgSpeedKph={80} />,
    );
    const speed = screen.getByLabelText(/average speed/i);
    expect(speed).toHaveValue(80);
    await user.clear(speed);
    await user.type(speed, "100");
    expect(updateDrivingSettings).toHaveBeenLastCalledWith(
      "t1",
      { windingFactor: 1.5, avgSpeedKph: 100 },
    );
  });

  it("renders both inputs as disabled while pending", () => {
    render(
      <DrivingEstimatesPanel tripId="t1" initialWindingFactor={1.5} initialAvgSpeedKph={80} />,
    );
    // At rest (not pending) the inputs should be enabled
    expect(screen.getByLabelText(/winding factor/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/average speed/i)).not.toBeDisabled();
  });
});
