import { describe, it, expect } from "vitest";
import { groupJournalDayByAuthor, isMeaningfulJournalEntry } from "./journal-authors";

const e = (authorId: string, body: string) => ({ authorId, body });
const p = (id: string, uploadedById: string) => ({ id, uploadedById });

describe("groupJournalDayByAuthor", () => {
  it("puts the viewer first and groups every author's photos with them", () => {
    const slots = groupJournalDayByAuthor({
      entries: [e("them", "their note"), e("me", "my note")],
      photos: [p("a", "them"), p("b", "me"), p("c", "them"), p("d", "me")],
      viewerId: "me",
      includeViewerSlot: true,
    });
    expect(slots.map((s) => s.authorId)).toEqual(["me", "them"]);
    expect(slots[0].isViewer).toBe(true);
    expect(slots[0].photos.map((x) => x.id)).toEqual(["b", "d"]);
    expect(slots[1].photos.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("includes a photo-only co-Traveller (no entry row)", () => {
    const slots = groupJournalDayByAuthor({
      entries: [],
      photos: [p("a", "them")],
      viewerId: "me",
      includeViewerSlot: false,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ authorId: "them", entry: null, isViewer: false });
  });

  it("drops a co-Traveller's blank switch-only row with no photo", () => {
    const slots = groupJournalDayByAuthor({
      entries: [e("them", "")],
      photos: [],
      viewerId: "me",
      includeViewerSlot: true,
    });
    expect(slots.map((s) => s.authorId)).toEqual(["me"]);
  });

  it("keeps a blank row that rides with a photo", () => {
    const slots = groupJournalDayByAuthor({
      entries: [e("them", "")],
      photos: [p("a", "them")],
      viewerId: "me",
      includeViewerSlot: false,
    });
    expect(slots.map((s) => s.authorId)).toEqual(["them"]);
    expect(slots[0].entry).toEqual(e("them", ""));
  });

  it("hands the viewer's blank row to their slot when writable, omits it when not", () => {
    const writable = groupJournalDayByAuthor({
      entries: [e("me", "")],
      photos: [],
      viewerId: "me",
      includeViewerSlot: true,
    });
    expect(writable[0].entry).toEqual(e("me", ""));
    const readOnly = groupJournalDayByAuthor({
      entries: [e("me", "")],
      photos: [],
      viewerId: "me",
      includeViewerSlot: false,
    });
    expect(readOnly).toEqual([]);
  });
});

describe("isMeaningfulJournalEntry", () => {
  it("is false only for a blank body with no photo from that author", () => {
    expect(isMeaningfulJournalEntry(e("a", "x"), new Set())).toBe(true);
    expect(isMeaningfulJournalEntry(e("a", ""), new Set(["a"]))).toBe(true);
    expect(isMeaningfulJournalEntry(e("a", ""), new Set(["b"]))).toBe(false);
  });
});
