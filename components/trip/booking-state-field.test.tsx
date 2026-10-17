import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BookingSubject } from "@/lib/booking-state";
import { BookingStateField, seedFromProposal, useBookingStateField, type BookingStateSeed } from "./booking-state-field";

function Harness({ kind, seed, onPayload }: { kind: BookingSubject; seed?: BookingStateSeed; onPayload(p: object): void }) {
  const [reference, setReference] = React.useState("");
  const field = useBookingStateField(kind, seed, reference);
  return (
    <>
      <input aria-label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
      <BookingStateField field={field} errors={{}} />
      <button type="button" onClick={() => onPayload(field.payload())}>Save</button>
    </>
  );
}

const on = (name: string) => screen.getByRole("radio", { name });

describe("BookingStateField (CONTEXT.md Booking state)", () => {
  it("a new leg shows To book with a Book by date; typing a reference previews Booked and hides the date", async () => {
    const user = userEvent.setup();
    let sent: object = {};
    render(<Harness kind="TRANSPORT" onPayload={(p) => (sent = p)} />);
    expect(on("To book")).toHaveAttribute("data-state", "on");
    expect(screen.getByLabelText("Book by")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Reference"), "ICE 512");
    expect(on("Booked")).toHaveAttribute("data-state", "on");
    expect(screen.queryByLabelText("Book by")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toEqual({}); // nothing chosen: the server derives Booked from the reference
  });

  it("a book-by date typed while To book is not sent once a reference previews Booked", async () => {
    const user = userEvent.setup();
    let sent: object = {};
    render(<Harness kind="TRANSPORT" onPayload={(p) => (sent = p)} />);
    await user.type(screen.getByLabelText("Book by"), "2027-05-01");
    await user.type(screen.getByLabelText("Reference"), "ICE 512");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toEqual({});
  });

  it("pressing the To book already shown makes it a choice, so a reference no longer flips it", async () => {
    const user = userEvent.setup();
    let sent: object = {};
    render(<Harness kind="TRANSPORT" onPayload={(p) => (sent = p)} />);
    await user.click(on("To book"));
    await user.type(screen.getByLabelText("Reference"), "ICE 512");
    expect(on("To book")).toHaveAttribute("data-state", "on");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toEqual({ bookingState: "TO_BOOK" });
  });

  it("a thing to do needs no booking until the Traveller says so; choosing To book sends it with the date", async () => {
    const user = userEvent.setup();
    let sent: object = {};
    render(<Harness kind="ITEM" onPayload={(p) => (sent = p)} />);
    expect(on("No booking needed")).toHaveAttribute("data-state", "on");
    expect(screen.queryByLabelText("Book by")).not.toBeInTheDocument();
    await user.click(on("To book"));
    await user.type(screen.getByLabelText("Book by"), "2027-05-20");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toEqual({ bookingState: "TO_BOOK", bookBy: "2027-05-20" });
  });

  it("a saved choice is kept and re-sent; a Proposal seeds Booked as a choice", async () => {
    const user = userEvent.setup();
    let sent: object = {};
    render(<Harness kind="ACCOMMODATION" seed={{ bookingState: "NONE", bookingStateSet: true, bookBy: null }} onPayload={(p) => (sent = p)} />);
    await user.type(screen.getByLabelText("Reference"), "HX-1");
    expect(on("No booking needed")).toHaveAttribute("data-state", "on");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toEqual({ bookingState: "NONE" });
    expect(seedFromProposal({ bookingState: "BOOKED" })).toEqual({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
    expect(seedFromProposal(undefined)).toBeUndefined();
    expect(seedFromProposal({})).toBeUndefined();
  });

  it("an un-chosen saved row derives from the reference, not its stored state", () => {
    render(<Harness kind="TRANSPORT" seed={{ bookingState: "BOOKED", bookingStateSet: false, bookBy: null }} onPayload={() => {}} />);
    // The harness's reference is empty, so the un-chosen leg previews To book.
    expect(on("To book")).toHaveAttribute("data-state", "on");
  });

  it("says booking is not paying", () => {
    render(<Harness kind="ITEM" onPayload={() => {}} />);
    expect(screen.getByText(/booked doesn't mean paid/i)).toBeInTheDocument();
  });
});
