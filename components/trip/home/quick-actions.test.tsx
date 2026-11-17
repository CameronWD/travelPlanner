import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a>,
}));

import { QuickActions } from "./quick-actions";

describe("QuickActions (spec 2026-10-06 §F)", () => {
  it("'Add a cost' opens the cost form on Money while Travelling", () => {
    render(<QuickActions tripId="t1" phase="travelling" />);
    expect(screen.getByRole("link", { name: "Add a cost" })).toHaveAttribute("href", "/trips/t1/budget?add=cost");
  });
  it("while Travelling the actions are Add a cost, Journal, Files, Checklists, in that order", () => {
    render(<QuickActions tripId="t1" phase="travelling" />);
    expect(screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Add a cost", "/trips/t1/budget?add=cost"],
      ["Journal", "/trips/t1/journal"],
      ["Files", "/trips/t1/files"],
      ["Checklists", "/trips/t1/checklists"],
    ]);
  });
  it("…and while Planning", () => {
    render(<QuickActions tripId="t1" phase="planning" />);
    expect(screen.getByRole("link", { name: "Add a cost" })).toHaveAttribute("href", "/trips/t1/budget?add=cost");
  });
  it("'Add a place' opens the add-Stop form on the Plan", () => {
    render(<QuickActions tripId="t1" phase="sketching" />);
    expect(screen.getByRole("link", { name: "Add a place" })).toHaveAttribute("href", "/trips/t1/plan?add=stop");
  });
});
