import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
//
// Task 14 (SHARE.md §8): journal entries as tilted polaroids, with an
// avatar that follows the link's showTravellers dial (initials otherwise).

vi.mock("@/components/ui/traveller-avatar", () => ({
  TravellerAvatar: ({ traveller }: { traveller: { name: string; image: string | null } }) => (
    <span data-testid="avatar" data-image={traveller.image ?? ""} />
  ),
}));

import { buildJournalDays, JournalPolaroids, buildJournalCards, type JournalPolaroidsProps } from "./journal-polaroids";

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
    expect(days[0]!.entries).toMatchObject([
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

const cam = { id: "u1", name: "Cam Williams", displayName: null, image: "https://lh3.example/cam.png", photoKey: null, photoUpdatedAt: null, email: "cam@example.com" };
const props = (over: Partial<JournalPolaroidsProps> = {}): JournalPolaroidsProps => ({
  token: "tok",
  dates: ["2026-12-05", "2026-12-06", "2026-12-07"],
  entries: [
    { date: "2026-12-05", authorId: "u1", body: "Made it.", author: cam },
    { date: "2026-12-07", authorId: "u1", body: "Hamilton", author: cam },
  ],
  photos: [{ id: "p1", targetId: "2026-12-07", uploadedById: "u1", uploadedBy: cam }],
  stage: "during",
  stopNameByDate: { "2026-12-05": "London", "2026-12-07": "London" },
  showTravellers: false,
  ...over,
});

describe("JournalPolaroids (SHARE.md §8)", () => {
  it("heads How it's going during and How it went after", () => {
    const { rerender } = render(<JournalPolaroids {...props()} />);
    expect(screen.getByRole("heading", { name: "How it's going" })).toBeInTheDocument();
    rerender(<JournalPolaroids {...props({ stage: "after" })} />);
    expect(screen.getByRole("heading", { name: "How it went" })).toBeInTheDocument();
  });

  it("one polaroid per entry, newest first, with date · place and the photo via the link route", () => {
    const { container } = render(<JournalPolaroids {...props()} />);
    const cards = container.querySelectorAll("[data-slot='share-polaroid']");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Mon 7 Dec · London");
    expect(cards[0].querySelector("img")).toHaveAttribute("src", "/share/tok/journal-photo/p1");
  });

  it("tilts each card by its id, stably, within ±2°", () => {
    const cards = buildJournalCards(props());
    expect(cards.map((c) => c.tilt)).toEqual(buildJournalCards(props()).map((c) => c.tilt));
    expect(cards.every((c) => Math.abs(c.tilt) <= 2)).toBe(true);
  });

  it("carries the tilt as --tp-tilt, so the desktop hover can straighten the card (MOTION.md S9)", () => {
    const { container } = render(<JournalPolaroids {...props()} />);
    const card = container.querySelector("[data-slot='share-polaroid']") as HTMLElement;
    const tilt = buildJournalCards(props())[0].tilt;
    expect(card.style.getPropertyValue("--tp-tilt")).toBe(`${tilt}deg`);
    expect(card.style.rotate).toBe("");
    expect(card.className).toContain("[rotate:var(--tp-tilt)]");
  });

  it("attributes by first name; avatars show initials unless showTravellers is on", () => {
    const { rerender } = render(<JournalPolaroids {...props()} />);
    expect(screen.getAllByText("Cam")[0]).toBeInTheDocument();
    expect(screen.getAllByTestId("avatar").every((a) => a.getAttribute("data-image") === "")).toBe(true);
    rerender(<JournalPolaroids {...props({ showTravellers: true })} />);
    expect(screen.getAllByTestId("avatar")[0]).toHaveAttribute("data-image", "https://lh3.example/cam.png");
  });

  it("never carries an email", () => {
    const { container } = render(<JournalPolaroids {...props({ showTravellers: true })} />);
    expect(container.innerHTML).not.toContain("cam@example.com");
    expect(JSON.stringify(buildJournalCards(props({ showTravellers: true })))).not.toContain("cam@example.com");
  });

  it("on mobile shows the latest 2 during and offers the rest", async () => {
    const many = props({
      dates: ["2026-12-01", "2026-12-02", "2026-12-03"],
      entries: ["01", "02", "03"].map((d) => ({ date: `2026-12-${d}`, authorId: "u1", body: `Day ${d}`, author: cam })),
      photos: [],
    });
    render(<JournalPolaroids {...many} />);
    const more = screen.getByRole("button", { name: "3 entries" });
    expect(screen.getByText("Day 01").closest("li")!.className).toMatch(/max-lg:hidden/);
    await userEvent.click(more);
    expect(screen.getByText("Day 01").closest("li")!.className).not.toMatch(/max-lg:hidden/);
  });

  it("renders nothing with no entries", () => {
    const { container } = render(<JournalPolaroids {...props({ entries: [], photos: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
