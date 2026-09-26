import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/guards", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("./new-trip-form", () => ({
  NewTripForm: () => <div data-testid="new-trip-form" />,
}));

import NewTripPage from "./page";

describe("/trips/new", () => {
  it("renders the New trip header and form", async () => {
    render(await NewTripPage());
    expect(screen.getByRole("heading", { name: "New trip" })).toBeInTheDocument();
    expect(screen.getByTestId("new-trip-form")).toBeInTheDocument();
  });

  // New trip width (re-check E Polish): a 2-column form doesn't need the
  // ~1600px wide-shell cap — capped to a plain 64rem instead. The banned
  // legacy shell widths (see app/page-widths.test.ts) rule out a named
  // Tailwind size here, so this uses an arbitrary value.
  it("caps the page at 64rem instead of the wide shell width", async () => {
    const { container } = render(await NewTripPage());
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("max-w-[64rem]");
    expect(wrapper.className).not.toContain("max-w-page-wide");
  });
});
