import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type * as React from "react";
import type { Route } from "next";

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a>,
}));

import { ReviewHomeLine } from "./review-home-line";

describe("ReviewHomeLine (R10)", () => {
  it("is one link to the Reviews tab carrying the line", () => {
    render(<ReviewHomeLine text="2 open from the 18 Oct review" href={"/trips/xmas/reviews" as Route} className="mb-6" />);
    const link = screen.getByRole("link", { name: "2 open from the 18 Oct review" });
    expect(link).toHaveAttribute("href", "/trips/xmas/reviews");
    expect(link).toHaveClass("mb-6");
  });
});
