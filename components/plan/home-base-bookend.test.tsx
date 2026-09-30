import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { HomeBaseBookend } from "./home-base-bookend";

describe("HomeBaseBookend (PLAN.md §1.3)", () => {
  it("a 44px dashed row linking to settings, with the jump ids", () => {
    const { rerender } = render(<HomeBaseBookend tripId="t1" name="Sydney" variant="origin" dateISO="2026-12-04" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("id", "home-base-top");
    expect(link).toHaveAttribute("href", "/trips/t1/settings");
    expect(link.className).toContain("h-11");
    expect(link.className).toMatch(/border-dashed/);
    expect(screen.getByText("Home base · leave Fri 4 Dec")).toBeInTheDocument();
    rerender(<HomeBaseBookend tripId="t1" name="Sydney" variant="return" dateISO="2027-01-08" />);
    expect(screen.getByRole("link")).toHaveAttribute("id", "home-base-bottom");
    expect(screen.getByText("Home base · back Fri 8 Jan")).toBeInTheDocument();
  });
  it("no date: just Home base", () => {
    render(<HomeBaseBookend tripId="t1" name="Sydney" variant="origin" dateISO={null} />);
    expect(screen.getByText("Home base")).toBeInTheDocument();
  });

  it("anchorId overrides the default jump id (the mobile list's own bookend anchors)", () => {
    const { rerender } = render(
      <HomeBaseBookend tripId="t1" name="Sydney" variant="origin" dateISO={null} anchorId="m-home-base-top" />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("id", "m-home-base-top");
    rerender(<HomeBaseBookend tripId="t1" name="Sydney" variant="return" dateISO={null} anchorId="m-home-base-bottom" />);
    expect(screen.getByRole("link")).toHaveAttribute("id", "m-home-base-bottom");
  });
});
