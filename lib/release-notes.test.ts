import { describe, it, expect } from "vitest";
import {
  RELEASE_NOTES,
  WHATS_NEW_CARD_LIMIT,
  unreadReleaseNotes,
  releaseNoteDate,
  type ReleaseNote,
} from "./release-notes";

const NOTES: ReleaseNote[] = [
  { publishedAt: "2026-09-21T12:00:00Z", text: "Third" },
  { publishedAt: "2026-09-21T09:00:00Z", text: "Second" },
  { publishedAt: "2026-09-10T09:00:00Z", text: "First" },
];

const CREATED = new Date("2026-01-01T00:00:00Z");

describe("unreadReleaseNotes", () => {
  it("returns everything published after the last dismissal", () => {
    const seen = new Date("2026-09-21T10:00:00Z");
    expect(unreadReleaseNotes(NOTES, seen, CREATED).map((n) => n.text)).toEqual(["Third"]);
  });

  it("returns nothing when the Traveller is fully caught up", () => {
    const seen = new Date("2026-09-22T00:00:00Z");
    expect(unreadReleaseNotes(NOTES, seen, CREATED)).toEqual([]);
  });

  it("treats a null dismissal as caught up at account creation, not as unread history", () => {
    // The feature must not introduce itself by dumping the entire backlog on
    // the two Travellers who were already here when it shipped.
    const createdAfterEverything = new Date("2026-09-22T00:00:00Z");
    expect(unreadReleaseNotes(NOTES, null, createdAfterEverything)).toEqual([]);
  });

  it("shows a never-dismissed Traveller only what shipped since they joined", () => {
    const joined = new Date("2026-09-15T00:00:00Z");
    expect(unreadReleaseNotes(NOTES, null, joined).map((n) => n.text)).toEqual([
      "Third",
      "Second",
    ]);
  });

  it("distinguishes two releases published on the same day", () => {
    // Why publishedAt carries a time and not just a date: dismissing the
    // morning's release must not silently swallow the afternoon's.
    const seen = new Date("2026-09-21T09:30:00Z");
    expect(unreadReleaseNotes(NOTES, seen, CREATED).map((n) => n.text)).toEqual(["Third"]);
  });

  it("preserves newest-first order", () => {
    const seen = new Date("2026-01-02T00:00:00Z");
    expect(unreadReleaseNotes(NOTES, seen, CREATED).map((n) => n.text)).toEqual([
      "Third",
      "Second",
      "First",
    ]);
  });
});

describe("releaseNoteDate", () => {
  it("is the calendar date, for grouping a release under one heading", () => {
    expect(releaseNoteDate({ publishedAt: "2026-09-21T12:00:00Z", text: "x" })).toBe("2026-09-21");
  });
});

describe("RELEASE_NOTES", () => {
  it("is ordered newest first", () => {
    const times = RELEASE_NOTES.map((n) => Date.parse(n.publishedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("has a valid timestamp on every note", () => {
    for (const note of RELEASE_NOTES) {
      expect(Number.isNaN(Date.parse(note.publishedAt))).toBe(false);
    }
  });

  it("keeps every note to one line", () => {
    // A Release note is one line. The cap on the card is a backstop; this is
    // the actual discipline.
    for (const note of RELEASE_NOTES) {
      expect(note.text).not.toContain("\n");
      expect(note.text.length).toBeLessThanOrEqual(140);
    }
  });

  it("caps the card at three", () => {
    expect(WHATS_NEW_CARD_LIMIT).toBe(3);
  });

  it("dates no note in the future", () => {
    // A future-dated note is "unread" until the clock catches up, which
    // makes a dismissal in that window not stick (see dismissWhatsNew's
    // seenAt clamp in server/actions/release-notes.ts). The clamp covers the
    // case if it ever happens anyway, but a note should never actually be
    // written ahead of when it ships.
    const now = Date.now();
    for (const note of RELEASE_NOTES) {
      expect(Date.parse(note.publishedAt)).toBeLessThanOrEqual(now);
    }
  });
});
