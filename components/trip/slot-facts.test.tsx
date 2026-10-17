import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlotFacts } from "./slot-facts";

describe("SlotFacts (R3)", () => {
  it("says the slot, when to be there, and Non-refundable", () => {
    render(<div><SlotFacts item={{ slotTime: "12:00", arriveByMinutes: 15, refundable: false }} /></div>);
    expect(screen.getByText("Slot 12:00 · be there 11:45")).toHaveAttribute("data-slot-time");
    expect(screen.getByText("Non-refundable")).toHaveAttribute("data-refund");
  });
  it("renders nothing with no slot and a refundable or unknown ticket", () => {
    const { container } = render(<div><SlotFacts item={{ slotTime: null, refundable: null }} /></div>);
    expect(container.firstChild).toBeEmptyDOMElement();
  });
  it("marks the slot uncertain for a Booking import card", () => {
    render(<div><SlotFacts item={{ slotTime: "12:00" }} highlight={["slotTime"]} /></div>);
    expect(screen.getByText("Slot 12:00")).toHaveAttribute("data-highlight");
  });
});
