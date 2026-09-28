import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { startFirstTrip } = vi.hoisted(() => ({ startFirstTrip: vi.fn() }));
vi.mock("@/app/(app)/trips/actions", () => ({ startFirstTrip: (n: string) => startFirstTrip(n) }));

import { FirstTripCard } from "./first-trip-card";

// The mock is reset at the top of each test body rather than in a
// beforeEach hook: resetting it from a hook (with the promise from an
// in-flight, never-resolving transition pending in another test) hangs this
// vitest/jsdom/React-19 combination — see task-8-report.md for the isolated
// repro. Resetting inline avoids that entirely and keeps each test's mock
// state independent of run order.
describe("FirstTripCard", () => {
  it("whitespace keeps the button disabled", () => {
    startFirstTrip.mockReset();
    render(<FirstTripCard variant="desktop" />);
    const btn = screen.getByRole("button", { name: "Start planning" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Trip name" }), { target: { value: "   " } });
    expect(btn).toBeDisabled();
    fireEvent.submit(btn.closest("form")!);
    expect(startFirstTrip).not.toHaveBeenCalled();
  });
  it("submits on Enter with the trimmed name and shows Starting…", async () => {
    startFirstTrip.mockReset();
    startFirstTrip.mockImplementation(() => new Promise(() => {}));
    render(<FirstTripCard variant="desktop" />);
    const input = screen.getByRole("textbox", { name: "Trip name" });
    fireEvent.change(input, { target: { value: " Japan in spring " } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(startFirstTrip).toHaveBeenCalledWith("Japan in spring"));
    expect(screen.getByRole("button", { name: "Starting…" })).toBeInTheDocument();
  });
  it("shows an inline error", async () => {
    startFirstTrip.mockReset();
    startFirstTrip.mockResolvedValue({ success: false, errors: { name: ["Trip name must be 120 characters or fewer"] } });
    render(<FirstTripCard variant="desktop" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Trip name" }), { target: { value: "x" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("120 characters");
  });
  it("renders the heading and placeholder copy", () => {
    startFirstTrip.mockReset();
    render(<FirstTripCard variant="desktop" />);
    expect(screen.getByRole("heading", { name: /Where to first\?/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Name it, e.g. Japan in spring")).toBeInTheDocument();
    expect(screen.getByText("FIRST TRIP")).toBeInTheDocument();
  });
});
