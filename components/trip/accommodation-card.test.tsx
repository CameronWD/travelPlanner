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
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
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

describe("AccommodationCard emerald Bold-Modular styling (D3)", () => {
  it("applies emerald wash class on the root element", () => {
    const { container } = render(
      <AccommodationCard accommodation={baseAcc} stop={baseStop} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/bg-emerald/);
  });

  it("renders a Home or BedDouble icon with emerald colour class", () => {
    const { container } = render(
      <AccommodationCard accommodation={baseAcc} stop={baseStop} />,
    );
    // The leading icon is an aria-hidden SVG; its className is an SVGAnimatedString
    const svgs = container.querySelectorAll("svg[aria-hidden='true']");
    expect(svgs.length).toBeGreaterThan(0);
    // At least one of the aria-hidden SVGs carries an emerald colour class
    const emeraldSvg = Array.from(svgs).find((svg) =>
      (svg.getAttribute("class") ?? "").includes("emerald"),
    );
    expect(emeraldSvg).toBeDefined();
  });

  it("shows 'Confirmed' affirmative label when confirmation exists", () => {
    const accWithConfirm = { ...baseAcc, confirmation: "BK-12345" };
    render(
      <AccommodationCard accommodation={accWithConfirm} stop={baseStop} />,
    );
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument();
    // Still shows the confirmation code
    expect(screen.getByText(/BK-12345/)).toBeInTheDocument();
  });

  it("does not show 'Confirmed' label when confirmation is absent", () => {
    render(
      <AccommodationCard accommodation={baseAcc} stop={baseStop} />,
    );
    expect(screen.queryByText(/confirmed/i)).not.toBeInTheDocument();
  });
});
