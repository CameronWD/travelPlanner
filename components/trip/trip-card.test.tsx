import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Must be declared before component imports so vi.mock hoisting works.
vi.mock("@/server/actions/trips", () => ({
  duplicateTrip: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { TripCard } from "./trip-card";

const defaultProps = {
  id: "t",
  name: "Europe",
  startDate: "2026-07-20" as string | null,
  endDate: "2026-07-30" as string | null,
  stopCount: 3,
  hasCover: false,
  coverStops: [] as { lat: number; lng: number }[],
};

describe("TripCard", () => {
  it("shows a phase badge when provided", () => {
    render(
      <TripCard
        {...defaultProps}
        phase={{ phase: "planning", label: "Planning", countdown: "In 26 days", countdownValue: "26", countdownUnit: "DAYS TO GO" }}
      />,
    );
    expect(screen.getByText(/planning · in 26 days/i)).toBeInTheDocument();
  });

  it("shows only the countdown for travelling trips", () => {
    render(
      <TripCard
        {...defaultProps}
        phase={{ phase: "travelling", label: "Travelling", countdown: "Day 5 of 11", countdownValue: "5", countdownUnit: "OF 11" }}
      />,
    );
    expect(screen.getByText("Day 5 of 11")).toBeInTheDocument();
  });

  it("shows an unread badge when unreadCount > 0", () => {
    render(
      <TripCard
        {...defaultProps}
        stopCount={2}
        unreadCount={3}
      />,
    );
    const badge = screen.getByLabelText("3 new");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("3");
  });

  it("caps unread badge at '9+' for counts above 9", () => {
    render(
      <TripCard
        {...defaultProps}
        stopCount={2}
        unreadCount={15}
      />,
    );
    const badge = screen.getByLabelText("15 new");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("9+");
  });

  it("does not render an unread badge when unreadCount is 0", () => {
    render(
      <TripCard
        {...defaultProps}
        stopCount={2}
        unreadCount={0}
      />,
    );
    expect(screen.queryByLabelText(/new/i)).not.toBeInTheDocument();
  });

  it("does not render an unread badge when unreadCount is absent", () => {
    render(
      <TripCard
        {...defaultProps}
        stopCount={2}
      />,
    );
    expect(screen.queryByLabelText(/new/i)).not.toBeInTheDocument();
  });

  it("renders the monogram (first letter of trip name) when hasCover is false and no stops", () => {
    render(
      <TripCard
        {...defaultProps}
        name="Europe"
        hasCover={false}
        coverStops={[]}
      />,
    );
    expect(screen.getByText("E")).toBeInTheDocument();
  });

  it("renders an img with the cover src when hasCover is true", () => {
    render(
      <TripCard
        {...defaultProps}
        id="trip-123"
        hasCover={true}
        coverStops={[]}
      />,
    );
    const img = screen.getByRole("img", { name: /europe cover/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/api/trips/trip-123/cover");
  });

  it("opens the ⋯ menu and shows Duplicate item when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<TripCard {...defaultProps} />);

    const trigger = screen.getByRole("button", { name: /trip actions/i });
    await user.click(trigger);

    const item = await screen.findByRole("menuitem", { name: /duplicate/i });
    expect(item).toBeInTheDocument();
  });

  it("renders a leading hue dot inside the phase badge for planning phase", () => {
    const { container } = render(
      <TripCard
        {...defaultProps}
        phase={{ phase: "planning", label: "Planning", countdown: "In 26 days", countdownValue: "26", countdownUnit: "DAYS TO GO" }}
      />,
    );
    const dot = container.querySelector("[data-testid='phase-dot']") as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(dot.className).toContain("rounded-full");
    expect(dot.className).toContain("bg-primary");
  });

  it("renders a leading hue dot inside the phase badge for sketching phase", () => {
    const { container } = render(
      <TripCard
        {...defaultProps}
        phase={{ phase: "sketching", label: "Sketching", countdown: "Not dated yet", countdownValue: "Not dated", countdownUnit: null }}
      />,
    );
    const dot = container.querySelector("[data-testid='phase-dot']") as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.className).toContain("bg-amber");
  });

  it("renders a leading hue dot inside the phase badge for past phase", () => {
    const { container } = render(
      <TripCard
        {...defaultProps}
        phase={{ phase: "past", label: "Past", countdown: "Ended 14 days ago", countdownValue: "14", countdownUnit: "DAYS AGO" }}
      />,
    );
    const dot = container.querySelector("[data-testid='phase-dot']") as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.className).toContain("bg-stone");
  });
});
