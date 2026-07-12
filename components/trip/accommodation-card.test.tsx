import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub out server-action imports that pull in next-auth (not needed for UI tests)
vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn(),
  updateCost: vi.fn(),
  deleteCost: vi.fn(),
}));
vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
}));

import { AccommodationCard } from "./accommodation-card";

const baseAcc = {
  id: "a1",
  stopId: "s1",
  name: "The Grand Hotel",
  checkIn: "2026-07-10",
  checkOut: "2026-07-13",
};

const baseStop = {
  arriveDate: "2026-07-10",
  departDate: "2026-07-13",
};

describe("AccommodationCard rendering", () => {
  it("renders the accommodation name", () => {
    render(
      <AccommodationCard
        accommodation={baseAcc}
        stop={baseStop}
      />,
    );
    expect(screen.getByText("The Grand Hotel")).toBeInTheDocument();
  });

  it("shows nights count", () => {
    render(
      <AccommodationCard
        accommodation={baseAcc}
        stop={baseStop}
      />,
    );
    expect(screen.getByText(/3 nights/i)).toBeInTheDocument();
  });
});

describe("AccommodationCard NoteThread", () => {
  it("renders a note thread trigger for an accommodation", () => {
    render(
      <AccommodationCard
        accommodation={baseAcc}
        stop={baseStop}
        tripId="t1"
        currentUserId="u1"
        notes={[]}
      />,
    );
    expect(screen.getByRole("button", { name: /note/i })).toBeInTheDocument();
  });

  it("does not render note thread trigger when notes prop is absent", () => {
    render(
      <AccommodationCard
        accommodation={baseAcc}
        stop={baseStop}
        tripId="t1"
        currentUserId="u1"
      />,
    );
    expect(screen.queryByRole("button", { name: /note/i })).not.toBeInTheDocument();
  });
});
