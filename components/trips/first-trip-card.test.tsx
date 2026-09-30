import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { FirstTripCard } from "./first-trip-card";

describe("FirstTripCard", () => {
  beforeEach(() => push.mockReset());

  it("whitespace keeps the button disabled and goes nowhere", () => {
    render(<FirstTripCard variant="desktop" />);
    const btn = screen.getByRole("button", { name: "Start planning" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Trip name" }), { target: { value: "   " } });
    expect(btn).toBeDisabled();
    fireEvent.submit(btn.closest("form")!);
    expect(push).not.toHaveBeenCalled();
  });

  it("Start planning opens New trip at step 2 with the trimmed name (spec C4)", () => {
    render(<FirstTripCard variant="desktop" />);
    const input = screen.getByRole("textbox", { name: "Trip name" });
    fireEvent.change(input, { target: { value: " Japan in spring " } });
    fireEvent.submit(input.closest("form")!);
    expect(push).toHaveBeenCalledWith("/trips/new?name=Japan%20in%20spring&step=2");
  });

  it("encodes a name that needs it", () => {
    render(<FirstTripCard variant="mobile" />);
    const input = screen.getByRole("textbox", { name: "Trip name" });
    fireEvent.change(input, { target: { value: "Rock & Roll?" } });
    fireEvent.submit(input.closest("form")!);
    expect(push).toHaveBeenCalledWith("/trips/new?name=Rock%20%26%20Roll%3F&step=2");
  });

  it("renders the heading and placeholder copy", () => {
    render(<FirstTripCard variant="desktop" />);
    expect(screen.getByRole("heading", { name: /Where to first\?/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Name it, e.g. Japan in spring")).toBeInTheDocument();
    expect(screen.getByText("FIRST TRIP")).toBeInTheDocument();
  });

  it("never creates a trip itself", () => {
    const src = readFileSync(join(__dirname, "first-trip-card.tsx"), "utf8");
    expect(src).not.toMatch(/server\/actions|trips\/actions|startFirstTrip/);
  });
});
