import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StopBadge } from "./stop-badge";
import { HUE_CLASSES } from "@/lib/hues";
import { stopHue } from "@/lib/stop-colours";

describe("StopBadge", () => {
  it("shows the number on the Stop's own hue when scheduled", () => {
    render(<StopBadge number={3} sortOrder={2} rough={false} />);
    const badge = screen.getByText("3");
    expect(badge.className).toContain(HUE_CLASSES[stopHue(2)].fill);
    expect(badge.className).not.toContain("border-dashed");
  });

  it("is dashed and neutral when rough", () => {
    render(<StopBadge number={4} sortOrder={2} rough />);
    const badge = screen.getByText("4");
    expect(badge.className).toContain("border-dashed");
    expect(badge.className).toContain("bg-muted");
    expect(badge.className).not.toContain(HUE_CLASSES[stopHue(2)].fill);
  });
});
