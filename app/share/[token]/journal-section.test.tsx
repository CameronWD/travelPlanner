import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { buildJournalDays, JournalSection } from "./journal-section";

// Task 20 (spec L / ADR 0051 amendment): "How it's going" — arrived Trip
// days, newest first, each Traveller's note and photo by display name only
// (no avatar, no email). Entries marked hiddenFromShares are omitted
// entirely, and a photo-only contribution (no note) still surfaces its
// author, mirroring lib/journal-loader.ts's loadTodaysJournal union.

const traveller = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "u1",
  name: "Cam Williams",
  displayName: null,
  image: "https://example.com/avatar.png",
  photoKey: null,
  photoUpdatedAt: null,
  ...over,
});

describe("buildJournalDays", () => {
  it("orders arrived days newest first", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25", "2026-09-26", "2026-09-27"],
      [
        { date: "2026-09-25", authorId: "u1", body: "Day one", hiddenFromShares: false, author: traveller() },
        { date: "2026-09-27", authorId: "u1", body: "Day three", hiddenFromShares: false, author: traveller() },
      ],
      [],
    );
    expect(days.map((d) => d.dateISO)).toEqual(["2026-09-27", "2026-09-25"]);
  });

  it("omits a day with no visible entries", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25"],
      [{ date: "2026-09-25", authorId: "u1", body: "Hidden", hiddenFromShares: true, author: traveller() }],
      [],
    );
    expect(days).toEqual([]);
  });

  it("omits an entry marked hiddenFromShares, keeping other authors' entries for the same day", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25"],
      [
        { date: "2026-09-25", authorId: "u1", body: "Visible", hiddenFromShares: false, author: traveller({ id: "u1", name: "Cam" }) },
        { date: "2026-09-25", authorId: "u2", body: "Hidden", hiddenFromShares: true, author: traveller({ id: "u2", name: "Robin" }) },
      ],
      [],
    );
    expect(days[0]!.entries).toHaveLength(1);
    expect(days[0]!.entries[0]!.authorFirstName).toBe("Cam");
  });

  it("builds the photo URL from the token and photo id, matched by date + author", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25"],
      [{ date: "2026-09-25", authorId: "u1", body: "Note", hiddenFromShares: false, author: traveller() }],
      [{ id: "photo-1", targetId: "2026-09-25", uploadedById: "u1", uploadedBy: traveller() }],
    );
    expect(days[0]!.entries[0]!.photoUrl).toBe("/share/tok/journal-photo/photo-1");
  });

  it("surfaces a photo-only contribution (no note) under its author", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25"],
      [],
      [{ id: "photo-1", targetId: "2026-09-25", uploadedById: "u1", uploadedBy: traveller({ name: "Robin Hood" }) }],
    );
    expect(days[0]!.entries).toEqual([
      { authorFirstName: "Robin", body: "", photoUrl: "/share/tok/journal-photo/photo-1" },
    ]);
  });

  it("omits a photo whose author's entry for that date is hiddenFromShares", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25"],
      [{ date: "2026-09-25", authorId: "u1", body: "", hiddenFromShares: true, author: traveller() }],
      [{ id: "photo-1", targetId: "2026-09-25", uploadedById: "u1", uploadedBy: traveller() }],
    );
    expect(days).toEqual([]);
  });

  it("uses first name only", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25"],
      [{ date: "2026-09-25", authorId: "u1", body: "Hi", hiddenFromShares: false, author: traveller({ name: "Cameron Williams" }) }],
      [],
    );
    expect(days[0]!.entries[0]!.authorFirstName).toBe("Cameron");
  });
});

describe("JournalSection", () => {
  it("renders nothing when there are no arrived/visible days", () => {
    const { container } = render(<JournalSection token="tok" dates={[]} entries={[]} photos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the 'How it's going' heading, the author's first name, and the note text", () => {
    render(
      <JournalSection
        token="tok"
        dates={["2026-09-27"]}
        entries={[{ date: "2026-09-27", authorId: "u1", body: "Great day in Lisbon", hiddenFromShares: false, author: traveller({ name: "Cam Williams" }) }]}
        photos={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "How it's going" })).toBeInTheDocument();
    expect(screen.getByText("Cam")).toBeInTheDocument();
    expect(screen.getByText("Great day in Lisbon")).toBeInTheDocument();
  });

  it("never renders an avatar image — only the photo, when present", () => {
    render(
      <JournalSection
        token="tok"
        dates={["2026-09-27"]}
        entries={[{ date: "2026-09-27", authorId: "u1", body: "Note", hiddenFromShares: false, author: traveller() }]}
        photos={[{ id: "photo-1", targetId: "2026-09-27", uploadedById: "u1", uploadedBy: traveller() }]}
      />,
    );
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "/share/tok/journal-photo/photo-1");
  });

  it("omits a hidden entry from the rendered section entirely", () => {
    render(
      <JournalSection
        token="tok"
        dates={["2026-09-27"]}
        entries={[{ date: "2026-09-27", authorId: "u1", body: "Secret", hiddenFromShares: true, author: traveller() }]}
        photos={[]}
      />,
    );
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "How it's going" })).not.toBeInTheDocument();
  });
});
