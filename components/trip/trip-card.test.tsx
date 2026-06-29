import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
        phase={{ phase: "planning", label: "Planning", countdown: "In 26 days" }}
      />,
    );
    expect(screen.getByText(/planning · in 26 days/i)).toBeInTheDocument();
  });

  it("shows only the countdown for travelling trips", () => {
    render(
      <TripCard
        {...defaultProps}
        phase={{ phase: "travelling", label: "Travelling", countdown: "Day 5 of 11" }}
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
});
