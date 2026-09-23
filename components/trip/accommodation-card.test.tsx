import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

describe("AccommodationCard leaf-hue styling (D3)", () => {
  it("applies a leaf-hue wash class on the root element", () => {
    const { container } = render(
      <AccommodationCard accommodation={baseAcc} stop={baseStop} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/bg-hue-leaf/);
  });

  it("renders a Home or BedDouble icon with a leaf-hue colour class", () => {
    const { container } = render(
      <AccommodationCard accommodation={baseAcc} stop={baseStop} />,
    );
    // The leading icon is an aria-hidden SVG; its className is an SVGAnimatedString
    const svgs = container.querySelectorAll("svg[aria-hidden='true']");
    expect(svgs.length).toBeGreaterThan(0);
    // At least one of the aria-hidden SVGs carries a leaf-hue colour class
    const leafSvg = Array.from(svgs).find((svg) =>
      (svg.getAttribute("class") ?? "").includes("hue-leaf"),
    );
    expect(leafSvg).toBeDefined();
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

describe("AccommodationCard mobile overflow", () => {
  it("folds Delete into the overflow menu", async () => {
    const user = userEvent.setup();
    render(
      <AccommodationCard
        accommodation={baseAcc}
        stop={baseStop}
        tripId="t1"
        currentUserId="u1"
        notes={[]}
        attachments={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: `More actions for ${baseAcc.name}`,
    });
    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 19 (HG-02/HG-10): the map pin means one thing — has a location
// ---------------------------------------------------------------------------

describe("AccommodationCard — map pin is not decorative", () => {
  it("shows exactly one map pin for an accommodation with an address — the map link's", () => {
    const { container } = render(
      <AccommodationCard
        accommodation={{ ...baseAcc, address: "Via Roma 1", lat: 41.9, lng: 12.5 }}
        stop={baseStop}
      />,
    );
    expect(container.querySelectorAll("svg.lucide-map-pin")).toHaveLength(1);
  });

  it("shows no map pin at all when there is no address", () => {
    const { container } = render(
      <AccommodationCard
        accommodation={{ ...baseAcc, address: null, lat: null, lng: null }}
        stop={baseStop}
      />,
    );
    expect(container.querySelectorAll("svg.lucide-map-pin")).toHaveLength(0);
  });
});
