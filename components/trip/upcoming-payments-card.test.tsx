import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UpcomingPaymentsCard } from "./upcoming-payments-card";
import type { UpcomingPayment } from "@/lib/upcoming-payments";

const payment = (o: Partial<UpcomingPayment> & { costId: string }): UpcomingPayment => ({
  label: "Hotel Lutetia",
  costMinor: 45000,
  currency: "EUR",
  dueDate: "2026-10-01",
  daysUntil: 3,
  ...o,
});

describe("UpcomingPaymentsCard", () => {
  it("renders nothing when there are no payments", () => {
    const { container } = render(<UpcomingPaymentsCard payments={[]} tripId="trip-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("titles the section 'Upcoming payments'", () => {
    render(<UpcomingPaymentsCard payments={[payment({ costId: "a" })]} tripId="trip-1" />);
    expect(screen.getByText("Upcoming payments")).toBeInTheDocument();
  });

  it("shows the label, formatted amount, and 'comes out in N days' phrasing", () => {
    render(<UpcomingPaymentsCard payments={[payment({ costId: "a", daysUntil: 3 })]} tripId="trip-1" />);
    expect(screen.getByText("Hotel Lutetia")).toBeInTheDocument();
    expect(screen.getByText(/450\.00/)).toBeInTheDocument();
    expect(screen.getByText("comes out in 3 days")).toBeInTheDocument();
  });

  it("shows 'comes out tomorrow' for daysUntil === 1", () => {
    render(<UpcomingPaymentsCard payments={[payment({ costId: "a", daysUntil: 1 })]} tripId="trip-1" />);
    expect(screen.getByText("comes out tomorrow")).toBeInTheDocument();
  });

  it("shows 'comes out today' for daysUntil === 0", () => {
    render(<UpcomingPaymentsCard payments={[payment({ costId: "a", daysUntil: 0 })]} tripId="trip-1" />);
    expect(screen.getByText("comes out today")).toBeInTheDocument();
  });

  it("shows 'was due N day(s) ago' and a warning treatment for overdue rows", () => {
    render(<UpcomingPaymentsCard payments={[payment({ costId: "a", daysUntil: -4 })]} tripId="trip-1" />);
    const phrase = screen.getByText("was due 4 day(s) ago");
    expect(phrase).toBeInTheDocument();
    expect(phrase.className).toMatch(/text-sun-text/);
  });

  it("links each row through to the trip's budget page", () => {
    render(<UpcomingPaymentsCard payments={[payment({ costId: "a" })]} tripId="trip-42" />);
    expect(screen.getByRole("link", { name: /hotel lutetia/i })).toHaveAttribute(
      "href",
      "/trips/trip-42/budget",
    );
  });

  it("renders one row per payment", () => {
    render(
      <UpcomingPaymentsCard
        payments={[payment({ costId: "a", label: "Hotel" }), payment({ costId: "b", label: "Flight" })]}
        tripId="trip-1"
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
