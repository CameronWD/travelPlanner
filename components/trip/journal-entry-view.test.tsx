import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JournalEntryView } from "./journal-entry-view";

const UPDATED = new Date("2026-01-05T20:00:00Z");

describe("JournalEntryView — Playground kit shape (Task 13)", () => {
  it("attributes the entry with a kit Avatar (initials) and the author's name", () => {
    const { container } = render(
      <JournalEntryView body="Arctic Circle!" updatedAt={UPDATED} authorName="Cam Williams" />,
    );
    expect(screen.getByText("Arctic Circle!")).toBeInTheDocument();
    expect(screen.getByText("CW")).toBeInTheDocument();
    expect(screen.getByText(/Cam Williams/)).toBeInTheDocument();
    // The time is a real <time> with the ISO timestamp.
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(UPDATED.toISOString());
  });

  it("is a kit Card by default (day page) and unframed inside the journal's day card", () => {
    const { container, rerender } = render(
      <JournalEntryView body="x" updatedAt={UPDATED} authorName="Cam" />,
    );
    expect(container.firstElementChild?.className).toMatch(/border-2/);
    rerender(<JournalEntryView body="x" updatedAt={UPDATED} authorName="Cam" framed={false} />);
    expect(container.firstElementChild?.className ?? "").not.toMatch(/border-2|shadow-hard/);
  });

  it("falls back to the time alone when the author has no name", () => {
    const { container } = render(
      <JournalEntryView body="x" updatedAt={UPDATED} authorName={null} />,
    );
    expect(container.querySelector("time")).toBeTruthy();
  });
});
