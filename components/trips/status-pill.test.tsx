import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./status-pill";

describe("StatusPill (TRIPS_PAGE.md §4a–b; W17 contrast)", () => {
  it.each([
    ["planning", "PLANNING", "bg-teal"],
    ["idea", "IDEA", "bg-lilac"],
  ] as const)("%s sits on a pastel fill with the accent ink, like every other chip on a fill", (kind, text, fill) => {
    render(<StatusPill kind={kind} />);
    const classes = screen.getByText(text).className.split(/\s+/);
    expect(classes).toContain(fill);
    expect(classes).toContain("text-on-accent");
    expect(classes).not.toContain("text-foreground");
  });
  it.each(["up-next", "on-the-road", "done"] as const)("%s stays on the card with the page ink", (kind) => {
    render(<StatusPill kind={kind} label="X" />);
    const classes = screen.getByText("X").className.split(/\s+/);
    expect(classes).toContain("bg-card");
    expect(classes).toContain("text-foreground");
  });
});
