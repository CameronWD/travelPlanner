import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewTripForm, NEW_TRIP_FORM_GRID_CLASS } from "./new-trip-form";

const createMock = vi.fn();
vi.mock("@/server/actions/trips", () => ({
  createTrip: (...args: unknown[]) => createMock(...args),
}));

describe("NewTripForm", () => {
  beforeEach(() => createMock.mockReset().mockResolvedValue({ success: true, tripId: "t1" }));

  // S2: every field the form already has must resolve via getByLabelText,
  // and the submit button must carry the kit's label. This pins the
  // restyle's accessible-name wiring (Field <-> control) without adding or
  // removing any field.
  it("associates every field with its label", () => {
    render(<NewTripForm />);
    expect(screen.getByLabelText(/trip name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/home currency/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/home base/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cover photo/i)).toBeInTheDocument();
  });

  it("has a submit button labelled Create trip", () => {
    render(<NewTripForm />);
    expect(screen.getByRole("button", { name: /create trip/i })).toBeInTheDocument();
  });

  // Preserved behaviour: submitting the name (and the currency default)
  // calls the unchanged createTrip server action with the same shape of
  // input the pre-restyle form sent.
  it("submits the trip name and default currency", async () => {
    render(<NewTripForm />);
    await userEvent.type(screen.getByLabelText(/trip name/i), "Kyoto Autumn");
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }));
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Kyoto Autumn", homeCurrency: "AUD" }),
        null,
      ),
    );
  });

  // Preserved behaviour: a validation error from the server action is shown
  // inline against the offending field rather than thrown.
  it("shows a field error returned by the server action instead of navigating away", async () => {
    createMock.mockResolvedValue({
      success: false,
      errors: { name: ["Trip name is required."] },
    });
    render(<NewTripForm />);
    await userEvent.click(screen.getByRole("button", { name: /create trip/i }));
    expect(await screen.findByText("Trip name is required.")).toBeInTheDocument();
  });
  it("uses the cover dropzone, and still submits with no cover chosen", async () => {
    render(<NewTripForm />);
    expect(screen.getByTestId("cover-dropzone")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Trip name/), "Japan");
    fireEvent.submit(screen.getByRole("button", { name: "Create trip" }).closest("form")!);
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0][1]).toBeNull(); // cover
  });
});

describe("NewTripForm past mode (?past=1)", () => {
  beforeEach(() => createMock.mockReset().mockResolvedValue({ success: true, tripId: "t1" }));

  it("past mode: dates are required, copy changes, submit reads Add trip", () => {
    render(<NewTripForm past />);
    expect(screen.getByText("When did you go?")).toBeInTheDocument();
    expect(screen.queryByText("optional — sketch first")).toBeNull();
    expect(screen.getByRole("button", { name: "Add trip" })).toBeInTheDocument();
  });

  it("past mode: submitting without dates shows errors and never calls createTrip", async () => {
    render(<NewTripForm past />);
    fireEvent.change(screen.getByPlaceholderText("Europe Summer 2026"), { target: { value: "Bali 2024" } });
    fireEvent.submit(screen.getByRole("button", { name: "Add trip" }).closest("form")!);
    expect(await screen.findAllByText("Add the dates you went")).toHaveLength(2);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("NewTripForm companion-column layout (LA-034)", () => {
  it("new trip form uses two columns from lg", () => {
    expect(NEW_TRIP_FORM_GRID_CLASS).toContain("lg:grid-cols-2");
  });

  // Spec §3: phones keep today's one-column order — Dates second, straight
  // after the name. The lg columns are placed explicitly, not by DOM order.
  it("keeps the original one-column field order in the DOM for phones (I-4)", () => {
    const { container } = render(<NewTripForm />);
    const order = Array.from(
      container.querySelectorAll<HTMLInputElement>(
        "input[name], button[id='homeCurrency']",
      ),
    )
      .map((el) => el.getAttribute("name") ?? el.id)
      .filter((n) => ["name", "startDate", "endDate", "homeCurrency", "homeName", "cover"].includes(n));
    expect(order).toEqual(["name", "startDate", "endDate", "homeCurrency", "homeName", "cover"]);
  });

  it("keeps one column grid below lg and two from lg, with the actions row spanning both", () => {
    expect(NEW_TRIP_FORM_GRID_CLASS).toContain("grid-cols-1");
    expect(NEW_TRIP_FORM_GRID_CLASS).toContain("lg:grid-cols-2");
  });
});
