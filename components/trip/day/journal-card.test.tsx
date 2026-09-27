import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { JournalCard } from "@/components/trip/day/journal-card";

vi.mock("@/components/trip/journal-editor", () => ({ JournalEditor: ({ date }: { date: string }) => <div data-testid="editor">{date}</div> }));
vi.mock("@/components/trip/journal-entry-view", () => ({ JournalEntryView: ({ body }: { body: string }) => <p>{body}</p> }));

describe("JournalCard", () => {
  it("future date: 'Opens on the day' and the honest copy, no editor", () => {
    render(<JournalCard tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" journal={{ open: false, mine: null, others: [] }} />);
    expect(screen.getByRole("heading", { name: "Journal" })).toBeInTheDocument();
    expect(screen.getByText("Opens on the day")).toBeInTheDocument();
    expect(screen.getByText("Come back on Sat 12 Dec to jot down a memory.")).toBeInTheDocument();
    expect(screen.queryByTestId("editor")).toBeNull();
  });
  it("on the day: the editor, and co-travellers' entries above it", () => {
    render(<JournalCard tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" journal={{ open: true, mine: { body: "", updatedAt: null, photo: null, extraPhotos: [], hiddenFromShares: false }, others: [{ authorId: "u2", body: "Snow!", updatedAt: new Date(), author: null, photos: [] }] }} />);
    expect(screen.getByTestId("editor")).toHaveTextContent("2026-12-12");
    expect(screen.getByText("Snow!")).toBeInTheDocument();
    expect(screen.queryByText("Opens on the day")).toBeNull();
    // Co-travellers' entries sit above the editor.
    expect(screen.getByText("Snow!").compareDocumentPosition(screen.getByTestId("editor")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
