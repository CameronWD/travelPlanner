import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub out server-action imports that pull in Better Auth (not needed for UI tests)
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

const base = { id: "t1", bookingStateSet: false, mode: "CAR" as const, sortOrder: 0 };

describe("TransportCard timezone labels + cross-zone marker", () => {
  it("labels dep/arr with their zone and a +1 day marker for overnight cross-zone flights", () => {
    render(
      <TransportCard
        transport={{
          id: "t1", mode: "FLIGHT" as const, sortOrder: 0, bookingStateSet: false,
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
          id: "tr1", bookingStateSet: false,
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

describe("TransportCard Stop + point label (Task 11)", () => {
  it("shows the Stop with its departure point in the heading", () => {
    render(
      <TransportCard
        transport={{
          id: "tr1", bookingStateSet: false,
          mode: "FLIGHT" as const,
          sortOrder: 0,
          fromStopId: "s1",
          fromStopName: "Aghalee",
          depPlace: "Belfast City (BHD)",
          toStopId: "s2",
          toStopName: "London",
        }}
      />,
    );
    const heading = screen.getByTestId("transport-heading");
    expect(heading.textContent).toContain("Aghalee · Belfast City (BHD)");
  });

  it("still shows the point alone when there is no fromStopName", () => {
    render(
      <TransportCard
        transport={{
          id: "tr1", bookingStateSet: false,
          mode: "FLIGHT" as const,
          sortOrder: 0,
          depPlace: "Milan Malpensa (MXP)",
          toStopId: "s2",
          toStopName: "London",
        }}
      />,
    );
    const heading = screen.getByTestId("transport-heading");
    expect(heading.textContent).toContain("Milan Malpensa (MXP)");
  });
});

describe("TransportCard home-base timezone (Task 7)", () => {
  it("shows a Home departure in the Trip's Home zone when homeTimezone is set", () => {
    render(
      <TransportCard
        transport={{
          id: "tr1", bookingStateSet: false,
          mode: "FLIGHT" as const,
          depIsHome: true,
          toStopId: "s1",
          toStopName: "Bali",
          toStopTimezone: "Asia/Makassar",
          depAt: new Date("2026-12-04T07:50:00Z"),
          sortOrder: 0,
        }}
        homeBaseName="Gold Coast"
        homeTimezone="Australia/Brisbane"
      />,
    );
    expect(screen.getByText(/17:50/)).toBeInTheDocument();
  });

  it("falls back to the far-end zone when homeTimezone is absent", () => {
    render(
      <TransportCard
        transport={{
          id: "tr1", bookingStateSet: false,
          mode: "FLIGHT" as const,
          depIsHome: true,
          toStopId: "s1",
          toStopName: "Bali",
          toStopTimezone: "Asia/Makassar",
          depAt: new Date("2026-12-04T07:50:00Z"),
          sortOrder: 0,
        }}
        homeBaseName="Gold Coast"
      />,
    );
    expect(screen.getByText(/15:50/)).toBeInTheDocument();
  });
});

describe("TransportCard NoteThread", () => {
  it("renders a note thread trigger for a transport", () => {
    render(
      <TransportCard
        transport={{ id: "tr1", bookingStateSet: false, mode: "FLIGHT" as const, sortOrder: 0 }}
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
        transport={{ id: "tr1", bookingStateSet: false, mode: "FLIGHT" as const, sortOrder: 0 }}
        tripId="t1"
        currentUserId="u1"
      />,
    );
    expect(screen.queryByRole("button", { name: /note/i })).not.toBeInTheDocument();
  });
});

describe("TransportCard placeless leg — no duplicate mode label", () => {
  it("renders the mode label exactly once when there are no from/to places", () => {
    render(
      <TransportCard
        transport={{
          id: "t1", bookingStateSet: false,
          mode: "TRAIN" as const,
          sortOrder: 0,
          // no depPlace, arrPlace, depIsHome, arrIsHome, fromStopName, toStopName
        }}
      />,
    );
    // "Train" should appear only once (in the heading fallback) — NOT also in the subline
    const matches = screen.getAllByText(/^Train$/i);
    expect(matches).toHaveLength(1);
  });

  it("still renders a reference in the subline when there are no places", () => {
    render(
      <TransportCard
        transport={{
          id: "t1", bookingStateSet: false,
          mode: "TRAIN" as const,
          sortOrder: 0,
          reference: "TK123",
        }}
      />,
    );
    expect(screen.getByText("TK123")).toBeInTheDocument();
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
          id: "t1", bookingStateSet: false,
          mode: "TRAIN" as const,
          sortOrder: 0,
          depPlace: "Kyoto",
          arrPlace: "Osaka",
        }}
      />,
    );
    // The heading must contain both place names in order: Kyoto … Osaka
    const heading = screen.getByTestId("transport-heading");
    expect(heading.textContent).toMatch(/Kyoto[\s\S]*Osaka/);
  });

  it("shows mode label beneath the heading, not above it", () => {
    const { container } = render(
      <TransportCard
        transport={{
          id: "t1", bookingStateSet: false,
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

describe("TransportCard mobile overflow", () => {
  it("folds Delete into the overflow menu", async () => {
    const user = userEvent.setup();
    render(
      <TransportCard
        transport={base}
        tripId="t1"
        currentUserId="u1"
        notes={[]}
        attachments={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "More actions for this transport",
    });
    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
  });
});

describe("TransportCard highlight (Booking import)", () => {
  it("marks the highlighted fields and nothing else", () => {
    const { container } = render(
      <TransportCard
        transport={{ id: "p1", bookingStateSet: false, mode: "FLIGHT", sortOrder: 0, depPlace: "Brisbane (BNE)", arrPlace: "Lisbon (LIS)", reference: "QX7P2M", notes: "SK101", depAt: new Date("2026-12-01T00:00:00Z"), arrAt: new Date("2026-12-02T07:15:00Z"), fromStopTimezone: "Australia/Brisbane", toStopTimezone: "Europe/Lisbon" }}
        highlight={["depAt", "reference"]}
      />,
    );
    const marked = [...container.querySelectorAll("[data-highlight]")].map((el) => el.getAttribute("data-highlight"));
    expect(marked.sort()).toEqual(["depAt", "reference"]);
    expect(screen.queryByRole("button")).toBeNull(); // no controls without handlers
  });
});

describe("TransportCard Booking state (spec 2026-10-17 R2)", () => {
  it("shows To book and its book-by date (spec R2)", () => {
    render(<TransportCard transport={{ ...base, bookingState: "TO_BOOK", bookBy: "2026-11-20" }} />);
    expect(screen.getByText("To book")).toBeInTheDocument();
    expect(screen.getByText("Book by 20 Nov")).toBeInTheDocument();
  });
  it("a Booked thing shows no badge", () => {
    render(<TransportCard transport={{ ...base, bookingState: "BOOKED" }} />);
    expect(screen.queryByText("To book")).not.toBeInTheDocument();
  });
});
