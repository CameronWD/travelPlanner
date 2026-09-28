import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import TripsLoading from "./loading";
import { FRAME } from "@/lib/trips/trips-page-frame";

/** I3: the skeleton must carry [data-trips-shell] (so <main> drops its own
 * padding) and the page's own FRAME padding — otherwise the loading state
 * double-pads under <main>'s padding while the real page pads itself. */
describe("TripsLoading", () => {
  it("carries data-trips-shell with the page's FRAME padding", () => {
    const { container } = render(<TripsLoading />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-trips-shell");
    expect(root.className).toBe(FRAME);
  });
});
