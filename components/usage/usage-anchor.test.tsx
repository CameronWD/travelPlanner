import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/usage/client", () => ({ recordUsageAction: vi.fn() }));

import { recordUsageAction } from "@/lib/usage/client";
import { UsageAnchor } from "./usage-anchor";

describe("UsageAnchor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders exactly the markup of the plain anchor", () => {
    const props = { href: "https://example.test/dir", target: "_blank", rel: "noopener noreferrer", "aria-label": "Directions to Northvale", className: "x y" };
    expect(renderToString(<UsageAnchor action="directions-tapped" {...props}>Go</UsageAnchor>)).toBe(
      renderToString(<a {...props}>Go</a>),
    );
  });

  it("records once, then calls the passed onClick", () => {
    const order: string[] = [];
    vi.mocked(recordUsageAction).mockImplementation(() => void order.push("record"));
    const onClick = vi.fn(() => void order.push("click"));
    render(<UsageAnchor action="directions-tapped" href="#x" onClick={onClick}>Go</UsageAnchor>);
    fireEvent.click(screen.getByRole("link", { name: "Go" }));
    expect(recordUsageAction).toHaveBeenCalledTimes(1);
    expect(recordUsageAction).toHaveBeenCalledWith("directions-tapped");
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["record", "click"]);
  });
});
