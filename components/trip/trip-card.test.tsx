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

  it("crops the cover photo around the Trip's focal point (spec E2)", () => {
    render(
      <TripCard {...defaultProps} id="trip-123" hasCover={true} coverStops={[]} focalX={0.3} focalY={0.6} />,
    );
    const img = screen.getByRole("img", { name: /europe cover/i }) as HTMLImageElement;
    expect(img.className).toContain("object-cover");
    expect(img.style.objectPosition).toBe("30% 60%");
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
    expect(dot.className).toContain("bg-hue-sun");
  });

  it("renders as a single Card-styled link to the trip, named after it", () => {
    render(<TripCard {...defaultProps} id="trip-1" name="Europe" />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);

    const link = links[0];
    expect(link).toHaveAttribute("href", "/trips/trip-1");
    expect(link).toHaveAccessibleName(/europe/i);
    // Kit shape: 2px outlined card (components/ui/card.tsx cardVariants).
    expect(link.className).toMatch(/\bborder-2\b/);

    expect(screen.getByRole("heading", { name: "Europe" })).toBeInTheDocument();
  });

  it("LA-016: status badge wraps instead of clipping", () => {
    render(
      <TripCard
        {...defaultProps}
        phase={{ phase: "planning", label: "Planning", countdown: "In 72 days", countdownValue: "72", countdownUnit: "DAYS TO GO" }}
      />,
    );
    const badge = screen.getByText(/planning · in 72 days/i);
    expect(badge.className).toContain("whitespace-normal");
    expect(badge.className).toContain("max-w-[calc(100%-1.5rem)]");
  });

  it("does not drop a very long trip name", () => {
    const longName = "A".repeat(60);
    render(<TripCard {...defaultProps} name={longName} />);
    expect(screen.getByText(longName)).toBeInTheDocument();
  });

  it("gives the card root h-full so every row's cards match height", () => {
    render(<TripCard {...defaultProps} />);
    const link = screen.getByRole("link");
    expect(link.className).toContain("h-full");
  });

  it("gives a featured card h-full too", () => {
    render(<TripCard {...defaultProps} featured />);
    const link = screen.getByRole("link");
    expect(link.className).toContain("h-full");
  });

  it("renders featuredDetails (countdown, route summary, stops/nights, next step) on a featured card", () => {
    render(
      <TripCard
        {...defaultProps}
        featured
        featuredDetails={{
          countdown: "26",
          unit: "DAYS TO GO",
          routeSummary: "Paris → Rome",
          stopsAndNights: "3 stops · 9 nights",
          nextStep: "Book transport",
        }}
      />,
    );
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getByText("DAYS TO GO")).toBeInTheDocument();
    expect(screen.getByText("Paris → Rome")).toBeInTheDocument();
    expect(screen.getByText("3 stops · 9 nights")).toBeInTheDocument();
    expect(screen.getByText("Book transport")).toBeInTheDocument();
  });

  it("renders no next-step line when featuredDetails.nextStep is null", () => {
    render(
      <TripCard
        {...defaultProps}
        featured
        featuredDetails={{
          countdown: "26",
          unit: "DAYS TO GO",
          routeSummary: "Paris → Rome",
          stopsAndNights: "3 stops · 9 nights",
          nextStep: null,
        }}
      />,
    );
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.queryByTestId("featured-next-step")).not.toBeInTheDocument();
  });

  it("never renders a single-letter monogram on a featured card with no photo and no located stops — the trip name instead", () => {
    render(
      <TripCard
        {...defaultProps}
        name="Europe"
        featured
        hasCover={false}
        coverStops={[]}
      />,
    );
    expect(screen.queryByText("E")).not.toBeInTheDocument();
    // The name renders once as the card title and once in the monogram fallback.
    expect(screen.getAllByText("Europe").length).toBeGreaterThanOrEqual(2);
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
    expect(dot.className).toContain("bg-hue-stone");
  });
});
