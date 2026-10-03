import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { deleteTrip } = vi.hoisted(() => ({ deleteTrip: vi.fn() }));
vi.mock("@/server/actions/trips", () => ({ deleteTrip }));

import { DangerZone } from "./danger-zone";

describe("DangerZone", () => {
  it("shows the Recently deleted copy and a Delete confirm button", () => {
    render(<DangerZone tripId="t1" tripName="Japan 2026" />);
    fireEvent.click(screen.getByRole("button", { name: /Delete trip/i }));

    expect(
      screen.getByText(/Goes to Recently deleted for 30 days\. Only you can restore it\./),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Japan 2026", { selector: "strong" }).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Japan 2026"), { target: { value: "Japan 2026" } });
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
