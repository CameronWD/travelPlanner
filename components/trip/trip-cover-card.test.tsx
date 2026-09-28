import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TripCoverCard } from "./trip-cover-card";

describe("TripCoverCard", () => {
  it("is a 2xl card that clips its child", () => {
    const { container } = render(<TripCoverCard className="h-10"><span>x</span></TripCoverCard>);
    expect(container.firstElementChild!.className).toContain("overflow-hidden");
    expect(container.firstElementChild!.className).toContain("rounded-2xl");
  });
});
