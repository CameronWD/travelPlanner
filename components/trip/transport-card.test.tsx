import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub out server-action imports that pull in next-auth (not needed for UI tests)
vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn(),
  updateCost: vi.fn(),
  deleteCost: vi.fn(),
}));
vi.mock("@/server/actions/transport", () => ({
  deleteTransport: vi.fn(),
  createTransport: vi.fn(),
  updateTransport: vi.fn(),
}));
vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
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

describe("TransportCard home-base labels", () => {
  it("shows the home base name for a home departure and stop name for arrival", () => {
    render(
      <TransportCard
        transport={{
          id: "tr1",
          mode: "FLIGHT" as const,
          depIsHome: true,
          toStopId: "s1",
          toStopName: "Paris",
          sortOrder: 0,
        }}
        homeBaseName="Sydney"
      />,
    );
    expect(screen.getByText(/Sydney/)).toBeInTheDocument();
    expect(screen.getByText(/Paris/)).toBeInTheDocument();
  });
});

describe("TransportCard NoteThread", () => {
  it("renders a note thread trigger for a transport", () => {
    render(
      <TransportCard
        transport={{ id: "tr1", mode: "FLIGHT" as const, sortOrder: 0 }}
        tripId="t1"
        currentUserId="u1"
        notes={[]}
      />,
    );
    expect(screen.getByRole("button", { name: /note/i })).toBeInTheDocument();
  });

  it("does not render note thread trigger when notes prop is absent", () => {
    render(
      <TransportCard
        transport={{ id: "tr1", mode: "FLIGHT" as const, sortOrder: 0 }}
        tripId="t1"
        currentUserId="u1"
      />,
    );
    expect(screen.queryByRole("button", { name: /note/i })).not.toBeInTheDocument();
  });
});

describe("TransportCard Bold-Modular D3 visual spec", () => {
  it("renders the card with a dashed border", () => {
    const { container } = render(<TransportCard transport={base} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/border-dashed/);
    expect(card.className).toMatch(/border-\[1\.5px\]/);
  });

  it("wraps the mode icon in a tinted rounded-square (size-9 rounded-xl bg-primary/10)", () => {
    const { container } = render(<TransportCard transport={base} />);
    const iconWrap = container.querySelector(".size-9.rounded-xl.bg-primary\\/10");
    expect(iconWrap).toBeInTheDocument();
  });

  it("shows From → To as the primary title when both endpoints are present", () => {
    render(
      <TransportCard
        transport={{
          id: "t1",
          mode: "TRAIN" as const,
          sortOrder: 0,
          depPlace: "Kyoto",
          arrPlace: "Osaka",
        }}
      />,
    );
    // The heading "Kyoto → Osaka" must appear as a single element (or adjacent text)
    // at a higher visual weight than the mode label beneath it.
    const heading = screen.getByTestId("transport-heading");
    expect(heading.textContent).toMatch(/Kyoto/);
    expect(heading.textContent).toMatch(/Osaka/);
  });

  it("shows mode label beneath the heading, not above it", () => {
    const { container } = render(
      <TransportCard
        transport={{
          id: "t1",
          mode: "TRAIN" as const,
          sortOrder: 0,
          depPlace: "Kyoto",
          arrPlace: "Osaka",
        }}
      />,
    );
    const heading = container.querySelector("[data-testid='transport-heading']")!;
    const subline = container.querySelector("[data-testid='transport-subline']")!;
    expect(heading).toBeInTheDocument();
    expect(subline).toBeInTheDocument();
    // subline must contain "Train" (the mode label)
    expect(subline.textContent).toMatch(/Train/);
    // heading must come before subline in DOM order
    const allTextNodes = Array.from(container.querySelectorAll("[data-testid]"));
    const headingIdx = allTextNodes.indexOf(heading);
    const sublineIdx = allTextNodes.indexOf(subline);
    expect(headingIdx).toBeLessThan(sublineIdx);
  });
});
