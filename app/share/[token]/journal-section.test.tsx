import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildJournalDays, JournalSection } from "./journal-section";

// Task 20 (spec L / ADR 0051 amendment): "How it's going" — arrived Trip
// days, newest first, each Traveller's note and photo by display name only
// (no avatar, no email). A photo-only contribution (no note) still
// surfaces its author, mirroring lib/journal-loader.ts's loadTodaysJournal
// union.
//
// hiddenFromShares filtering is NOT this module's job (fix round 1): the
// two queries in app/share/[token]/page.tsx exclude hidden rows in their
// `where`, so `entries`/`photos` here are always already visible. See
// page.test.tsx for the hidden-entry coverage.

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
        { date: "2026-09-25", authorId: "u1", body: "Day one", author: traveller() },
        { date: "2026-09-27", authorId: "u1", body: "Day three", author: traveller() },
      ],
      [],
    );
    expect(days.map((d) => d.dateISO)).toEqual(["2026-09-27", "2026-09-25"]);
  });

  it("omits a day with no entries and no photos", () => {
    const days = buildJournalDays("tok", ["2026-09-25"], [], []);
    expect(days).toEqual([]);
  });

  it("keeps one entry per author for the same day", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25"],
      [
        { date: "2026-09-25", authorId: "u1", body: "From Cam", author: traveller({ id: "u1", name: "Cam" }) },
        { date: "2026-09-25", authorId: "u2", body: "From Robin", author: traveller({ id: "u2", name: "Robin" }) },
      ],
      [],
    );
    expect(days[0]!.entries).toHaveLength(2);
    expect(days[0]!.entries.map((e) => e.authorFirstName).sort()).toEqual(["Cam", "Robin"]);
  });

  it("builds the photo URL from the token and photo id, matched by date + author", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25"],
      [{ date: "2026-09-25", authorId: "u1", body: "Note", author: traveller() }],
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
      { authorId: "u1", authorFirstName: "Robin", body: "", photoUrl: "/share/tok/journal-photo/photo-1" },
    ]);
  });

  it("uses each entry's authorId as its stable identity", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25"],
      [{ date: "2026-09-25", authorId: "u1", body: "Hi", author: traveller() }],
      [],
    );
    expect(days[0]!.entries[0]!.authorId).toBe("u1");
  });

  it("uses first name only", () => {
    const days = buildJournalDays(
      "tok",
      ["2026-09-25"],
      [{ date: "2026-09-25", authorId: "u1", body: "Hi", author: traveller({ name: "Cameron Williams" }) }],
      [],
    );
    expect(days[0]!.entries[0]!.authorFirstName).toBe("Cameron");
  });
});

describe("JournalSection", () => {
  it("renders nothing when there are no days", () => {
    const { container } = render(<JournalSection token="tok" dates={[]} entries={[]} photos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the 'How it's going' heading, the author's first name, and the note text", () => {
    render(
      <JournalSection
        token="tok"
        dates={["2026-09-27"]}
        entries={[{ date: "2026-09-27", authorId: "u1", body: "Great day in Lisbon", author: traveller({ name: "Cam Williams" }) }]}
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
        entries={[{ date: "2026-09-27", authorId: "u1", body: "Note", author: traveller() }]}
        photos={[{ id: "photo-1", targetId: "2026-09-27", uploadedById: "u1", uploadedBy: traveller() }]}
      />,
    );
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "/share/tok/journal-photo/photo-1");
  });

  it("renders one entry per author for a multi-author day", () => {
    render(
      <JournalSection
        token="tok"
        dates={["2026-09-27"]}
        entries={[
          { date: "2026-09-27", authorId: "u1", body: "From Cam", author: traveller({ id: "u1", name: "Cam" }) },
          { date: "2026-09-27", authorId: "u2", body: "From Robin", author: traveller({ id: "u2", name: "Robin" }) },
        ]}
        photos={[]}
      />,
    );
    expect(screen.getByText("From Cam")).toBeInTheDocument();
    expect(screen.getByText("From Robin")).toBeInTheDocument();
  });
});
