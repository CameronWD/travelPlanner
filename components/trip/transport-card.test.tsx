import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub out server-action imports that pull in next-auth (not needed for UI tests)
vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn(),
  updateCost: vi.fn(),
  deleteCost: vi.fn(),
}));

import { TransportCard } from "./transport-card";

const base = { id: "t1", mode: "CAR" as const, sortOrder: 0 };

describe("TransportCard timezone labels + cross-zone marker", () => {
  it("labels dep/arr with their zone and a +1 day marker for overnight cross-zone flights", () => {
    render(
      <TransportCard
        transport={{
          id: "t1", mode: "FLIGHT" as const, sortOrder: 0,
          depAt: new Date("2026-08-05T18:00:00Z"), arrAt: new Date("2026-08-06T07:30:00Z"),
          fromStopTimezone: "Europe/Rome", toStopTimezone: "Asia/Tokyo",
        }}
      />,
    );
    expect(screen.getByText(/20:00/)).toBeInTheDocument();
    expect(screen.getByText(/16:30/)).toBeInTheDocument();
    expect(screen.getByText(/\+1 day/)).toBeInTheDocument();
  });
});

describe("TransportCard drive estimate", () => {
  it("shows the drive estimate when present and there are no real times", () => {
    render(
      <TransportCard
        transport={{ ...base, driveEstimate: { minutes: 75, roadKm: 100 } }}
      />,
    );
    expect(screen.getByText(/≈.*100 km/)).toBeInTheDocument();
  });

  it("hides the estimate when real dep/arr times give a duration", () => {
    render(
      <TransportCard
        transport={{
          ...base,
          depAt: new Date("2026-07-03T09:00:00Z"),
          arrAt: new Date("2026-07-03T10:30:00Z"),
          driveEstimate: { minutes: 75, roadKm: 100 },
        }}
      />,
    );
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });
});
