import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingStateBadge } from "./booking-state-badge";

describe("BookingStateBadge (CONTEXT.md Booking state)", () => {
  it("says To book, and the book-by date when there is one", () => {
    render(<BookingStateBadge state="TO_BOOK" bookBy="2026-11-20" />);
    expect(screen.getByText("To book")).toBeInTheDocument();
    expect(screen.getByText("Book by 20 Nov")).toBeInTheDocument();
  });
  it("compact is one badge: the date when set, else To book", () => {
    const { rerender } = render(<BookingStateBadge state="TO_BOOK" bookBy="2026-11-20" compact />);
    expect(screen.getByText("Book by 20 Nov")).toBeInTheDocument();
    expect(screen.queryByText("To book")).not.toBeInTheDocument();
    rerender(<BookingStateBadge state="TO_BOOK" compact />);
    expect(screen.getByText("To book")).toBeInTheDocument();
  });
  it.each(["BOOKED", "NONE", null, undefined] as const)("renders nothing for %s", (state) => {
    const { container } = render(<BookingStateBadge state={state} bookBy="2026-11-20" />);
    expect(container).toBeEmptyDOMElement();
  });
});
