import { describe, expect, it } from "vitest";
import {
  ACTIVITY_VERBS,
  ACTIVITY_ENTITY_TYPES,
  activityLine,
  checklistItemSummary,
  checklistItemsAddedSummary,
  checklistTickSummary,
  dayTitleSummary,
  homeTimezoneSummary,
  surpriseSummary,
  describeChanges,
  entityLabel,
  headline,
  templateAppliedSummary,
  viaLabel,
  voteSummary,
  type ActivitySummary,
} from "@/lib/activity";
import { serializeOpeningHours } from "@/lib/validations/opening-hours";

// ---------------------------------------------------------------------------
// Vocab constants
// ---------------------------------------------------------------------------

describe("ACTIVITY_VERBS", () => {
  it("contains PROMOTED verb", () => {
    expect(ACTIVITY_VERBS).toContain("PROMOTED");
  });
});

describe("ACTIVITY_ENTITY_TYPES", () => {
  it("contains the expected entity types including FORK, ATTACHMENT, DAY_TITLE, CHECKLIST_ITEM, REMINDER and VOTE", () => {
    expect(ACTIVITY_ENTITY_TYPES).toEqual([
      "STOP",
      "ITEM",
      "TRANSPORT",
      "ACCOMMODATION",
      "CHAPTER",
      "COST",
      "NOTE",
      "FORK",
      "ATTACHMENT",
      "DAY_TITLE",
      "CHECKLIST_ITEM",
      "REMINDER",
      "VOTE",
    ]);
  });
});

// ---------------------------------------------------------------------------
// describeChanges — STOP
// ---------------------------------------------------------------------------

describe("describeChanges STOP", () => {
  it("yields one change when only name differs", () => {
    const changes = describeChanges(
      "STOP",
      { name: "Paris", country: "France" },
      { name: "Rome", country: "France" },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("name");
    expect(changes[0].label).toBe("Name");
    expect(changes[0].from).toBe("Paris");
    expect(changes[0].to).toBe("Rome");
  });

  it("formats arriveDate as a long date string", () => {
    const changes = describeChanges(
      "STOP",
      { arriveDate: "2026-07-01" },
      { arriveDate: "2026-07-05" },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("arriveDate");
    expect(changes[0].from).toBe("Wed 1 Jul 2026");
    expect(changes[0].to).toBe("Sun 5 Jul 2026");
  });

  it("returns [] when nothing changed", () => {
    const changes = describeChanges(
      "STOP",
      { name: "Paris", country: "France" },
      { name: "Paris", country: "France" },
    );
    expect(changes).toHaveLength(0);
  });

  it("omits fields that are both null/undefined/empty", () => {
    // both empty → no change
    const changes = describeChanges(
      "STOP",
      { name: "Paris", nights: null },
      { name: "Paris", nights: undefined },
    );
    expect(changes).toHaveLength(0);
  });

  it("treats null and empty string as the same (empty)", () => {
    const changes = describeChanges(
      "STOP",
      { name: "Paris", country: null },
      { name: "Paris", country: "" },
    );
    expect(changes).toHaveLength(0);
  });

  it("detects a change from empty to a value", () => {
    const changes = describeChanges(
      "STOP",
      { name: "Paris", country: null },
      { name: "Paris", country: "France" },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("country");
    expect(changes[0].from).toBe("");
    expect(changes[0].to).toBe("France");
  });
});

// ---------------------------------------------------------------------------
// describeChanges — COST (money formatting)
// ---------------------------------------------------------------------------

describe("describeChanges COST", () => {
  it("formats costMinor with formatMoney using the row currency", () => {
    const changes = describeChanges(
      "COST",
      { costMinor: 1000, currency: "AUD" },
      { costMinor: 2500, currency: "AUD" },
    );
    const est = changes.find((c) => c.field === "costMinor");
    expect(est).toBeDefined();
    // A$10.00 → A$25.00 (en-AU locale)
    expect(est!.from).toContain("10.00");
    expect(est!.to).toContain("25.00");
  });

  it("formats paidMinor with formatMoney using the row currency", () => {
    const changes = describeChanges(
      "COST",
      { paidMinor: 500, currency: "USD" },
      { paidMinor: 750, currency: "USD" },
    );
    const act = changes.find((c) => c.field === "paidMinor");
    expect(act).toBeDefined();
    expect(act!.from).toContain("5.00");
    expect(act!.to).toContain("7.50");
  });

  it("returns [] when no COST fields changed", () => {
    const row = { costMinor: 1000, paidMinor: 500, currency: "AUD", category: "OTHER" };
    expect(describeChanges("COST", row, { ...row })).toHaveLength(0);
  });

  it("describes marking a cost unpaid", () => {
    const changes = describeChanges("COST", { paidAt: new Date("2026-08-01T00:00:00Z") }, { paidAt: null });
    expect(changes).toHaveLength(1);
    expect(changes[0].label).toBe("Paid");
    expect(changes[0].from).toBe("Sat 1 Aug 2026");
    expect(changes[0].to).toBe("not paid");
  });

  it("describes marking a cost paid", () => {
    const changes = describeChanges("COST", { paidAt: null }, { paidAt: new Date("2026-08-14T00:00:00Z") });
    expect(changes).toHaveLength(1);
    expect(changes[0].from).toBe("not paid");
    expect(changes[0].to).toBe("Fri 14 Aug 2026");
  });
});

// ---------------------------------------------------------------------------
// describeChanges — TRANSPORT (mode label)
// ---------------------------------------------------------------------------

describe("describeChanges TRANSPORT", () => {
  it("shows human mode label for a mode change", () => {
    const changes = describeChanges(
      "TRANSPORT",
      { mode: "FLIGHT" },
      { mode: "TRAIN" },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("mode");
    expect(changes[0].from).toBe("Flight");
    expect(changes[0].to).toBe("Train");
  });

  it("returns [] when mode is unchanged", () => {
    expect(
      describeChanges("TRANSPORT", { mode: "FLIGHT" }, { mode: "FLIGHT" }),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// describeChanges — TRANSPORT Date equality (phantom-change guard)
// ---------------------------------------------------------------------------

describe("describeChanges TRANSPORT Date equality", () => {
  it("does NOT emit a depAt change when the same instant is represented by two distinct Date objects", () => {
    const instant = new Date("2025-07-03T14:00:00Z");
    const sameDateNewRef = new Date(instant.getTime()); // distinct object, same value
    const changes = describeChanges(
      "TRANSPORT",
      { depAt: instant, reference: "BA123" },
      { depAt: sameDateNewRef, reference: "BA456" },
    );
    // Only 'reference' should be reported; depAt is unchanged
    expect(changes.find((c) => c.field === "depAt")).toBeUndefined();
    expect(changes.find((c) => c.field === "reference")).toBeDefined();
    expect(changes).toHaveLength(1);
  });

  it("emits a depAt change with formatted strings (not raw Date.toString) when the time actually changed", () => {
    const before = new Date("2025-07-03T14:00:00Z");
    const after = new Date("2025-07-03T18:30:00Z");
    const changes = describeChanges(
      "TRANSPORT",
      { depAt: before },
      { depAt: after },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("depAt");
    // Should NOT be the raw Date.toString() output (which contains "GMT")
    expect(changes[0].from).not.toMatch(/GMT/);
    expect(changes[0].to).not.toMatch(/GMT/);
    // Should contain the formatted date-time
    expect(changes[0].from).toBe("3 Jul 2025, 14:00");
    expect(changes[0].to).toBe("3 Jul 2025, 18:30");
  });
});

// ---------------------------------------------------------------------------
// describeChanges — NOTE has no diffable fields
// ---------------------------------------------------------------------------

describe("describeChanges NOTE", () => {
  it("always returns [] for NOTE entities", () => {
    expect(
      describeChanges("NOTE", { content: "hello" }, { content: "world" }),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// entityLabel
// ---------------------------------------------------------------------------

describe("entityLabel", () => {
  it("STOP → name field", () => {
    expect(entityLabel("STOP", { name: "Rome" })).toBe("Rome");
  });

  it("ACCOMMODATION → name field", () => {
    expect(entityLabel("ACCOMMODATION", { name: "Hotel Splendid" })).toBe(
      "Hotel Splendid",
    );
  });

  it("CHAPTER → name field", () => {
    expect(entityLabel("CHAPTER", { name: "Southern Loop" })).toBe(
      "Southern Loop",
    );
  });

  it("ITEM → title field", () => {
    expect(entityLabel("ITEM", { title: "Colosseum visit" })).toBe(
      "Colosseum visit",
    );
  });

  it("TRANSPORT → reference when present", () => {
    expect(
      entityLabel("TRANSPORT", { reference: "BA2490", depPlace: "London" }),
    ).toBe("BA2490");
  });

  it("TRANSPORT → depPlace when reference is absent", () => {
    expect(entityLabel("TRANSPORT", { depPlace: "London" })).toBe("London");
  });

  it("TRANSPORT → 'transport' when both reference and depPlace are absent", () => {
    expect(entityLabel("TRANSPORT", {})).toBe("transport");
  });

  it("COST → label field when present", () => {
    expect(entityLabel("COST", { label: "Flights" })).toBe("Flights");
  });

  it("COST → 'cost' when label is absent", () => {
    expect(entityLabel("COST", {})).toBe("cost");
  });

  it("NOTE → 'note'", () => {
    expect(entityLabel("NOTE", { content: "Don't forget the tickets" })).toBe(
      "note",
    );
  });

  it("FORK → 'what-if plan' when name is absent", () => {
    expect(entityLabel("FORK", {})).toBe("what-if plan");
  });
});

// ---------------------------------------------------------------------------
// headline
// ---------------------------------------------------------------------------

describe("headline", () => {
  it("CREATED → 'added the ... stop'", () => {
    const h = headline({ verb: "CREATED", entityType: "STOP", entityLabel: "Rome" });
    expect(h).toContain("added");
    expect(h).toContain("Rome");
    expect(h).toContain("stop");
  });

  it("UPDATED → 'updated the ... transport'", () => {
    const h = headline({
      verb: "UPDATED",
      entityType: "TRANSPORT",
      entityLabel: "BA2490",
    });
    expect(h).toContain("updated");
    expect(h).toContain("BA2490");
    expect(h).toContain("transport");
  });

  it("DELETED → 'removed the ... accommodation'", () => {
    const h = headline({
      verb: "DELETED",
      entityType: "ACCOMMODATION",
      entityLabel: "Hotel X",
    });
    expect(h).toContain("removed");
    expect(h).toContain("Hotel X");
    expect(h).toContain("accommodation");
  });

  it("NOTED → 'left a note'", () => {
    const h = headline({ verb: "NOTED", entityType: "NOTE", entityLabel: "note" });
    expect(h).toContain("left a note");
  });

  it("CREATED ITEM includes 'item'", () => {
    const h = headline({ verb: "CREATED", entityType: "ITEM", entityLabel: "Colosseum" });
    expect(h).toContain("item");
  });

  it("DELETED COST includes 'cost'", () => {
    const h = headline({ verb: "DELETED", entityType: "COST", entityLabel: "Flights" });
    expect(h).toContain("cost");
  });

  it("CREATED CHAPTER includes 'chapter'", () => {
    const h = headline({ verb: "CREATED", entityType: "CHAPTER", entityLabel: "Southern Loop" });
    expect(h).toContain("chapter");
  });

  // What-if plans on screen (CONTEXT.md **Fork**, **Promote**): the Activity
  // feed's FORK lines use the traveller-facing noun, and PROMOTED reads as
  // "Make this the real plan" in the past tense.
  it("CREATED FORK reads as a what-if plan, not a fork", () => {
    const h = headline({ verb: "CREATED", entityType: "FORK", entityLabel: "Italy first" });
    expect(h).toBe("added the Italy first what-if plan");
  });

  it("DELETED FORK reads as a what-if plan, not a fork", () => {
    const h = headline({ verb: "DELETED", entityType: "FORK", entityLabel: "Italy first" });
    expect(h).toBe("removed the Italy first what-if plan");
  });

  it("PROMOTED reads as making the what-if plan the real plan", () => {
    const h = headline({ verb: "PROMOTED", entityType: "FORK", entityLabel: "Italy first" });
    expect(h).toBe("made the Italy first what-if plan the real plan");
    expect(h).not.toContain("promoted");
    expect(h).not.toContain("fork");
  });
});

// ---------------------------------------------------------------------------
// describeChanges — STOP pinned boolean
// ---------------------------------------------------------------------------

describe("STOP pinned diff", () => {
  it("renders pinned booleans as Pinned / Not pinned", () => {
    const changes = describeChanges("STOP", { pinned: false }, { pinned: true });
    expect(changes).toEqual([
      { field: "pinned", label: "Pinned", from: "Not pinned", to: "Pinned" },
    ]);
  });

  it("emits no change when pinned is unchanged", () => {
    expect(describeChanges("STOP", { pinned: true }, { pinned: true })).toEqual([]);
  });

  it("emits no change when both pinned values are empty/null", () => {
    expect(describeChanges("STOP", { pinned: null }, { pinned: null })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ActivitySummary type
// ---------------------------------------------------------------------------

describe("ActivitySummary", () => {
  it("is a { summary } shape", () => {
    const s: ActivitySummary = { summary: "firmed up 4 stops" };
    expect(s.summary).toBe("firmed up 4 stops");
  });
});

// ---------------------------------------------------------------------------
// viaLabel
// ---------------------------------------------------------------------------

describe("viaLabel", () => {
  it("returns 'via Claude' for source CLAUDE", () => {
    expect(viaLabel("CLAUDE")).toBe("via Claude");
  });

  it("returns null for a null source (written by the app)", () => {
    expect(viaLabel(null)).toBeNull();
  });

  it("returns null for an undefined source", () => {
    expect(viaLabel(undefined)).toBeNull();
  });

  it("returns null for any other source string", () => {
    expect(viaLabel("OTHER")).toBeNull();
  });
});

describe("TC-07 line builders", () => {
  it("names the list a Checklist item was added to or removed from", () => {
    expect(checklistItemSummary("CREATED", "Travel insurance", "PRETRIP")).toEqual({
      summary: "added Travel insurance to the pre-trip checklist",
    });
    expect(checklistItemSummary("DELETED", "Sunscreen", "PACKING")).toEqual({
      summary: "removed Sunscreen from the packing list",
    });
    expect(checklistItemSummary("CREATED", "Adapter", "SHOPPING").summary).toBe(
      "added Adapter to the shopping list",
    );
  });

  it("ticks and un-ticks", () => {
    expect(checklistTickSummary("Travel insurance", true).summary).toBe("ticked off Travel insurance");
    expect(checklistTickSummary("Travel insurance", false).summary).toBe("un-ticked Travel insurance");
  });

  it("counts a template's items, singular and plural", () => {
    expect(templateAppliedSummary(23, "Beach").summary).toBe(
      "added 23 items from the Beach template to the packing list",
    );
    expect(templateAppliedSummary(1, "Beach").summary).toBe(
      "added 1 item from the Beach template to the packing list",
    );
  });

  it("counts a bulk add's items, singular and plural, named by kind (AI packing Add all)", () => {
    expect(checklistItemsAddedSummary(27, "PACKING").summary).toBe(
      "added 27 items to the packing list",
    );
    expect(checklistItemsAddedSummary(1, "PRETRIP").summary).toBe(
      "added 1 item to the pre-trip checklist",
    );
    expect(checklistItemsAddedSummary(3, "SHOPPING").summary).toBe(
      "added 3 items to the shopping list",
    );
  });

  it("words a new vote and a changed vote", () => {
    expect(voteSummary("Sintra", null, "MUST").summary).toBe("voted must-do on Sintra");
    expect(voteSummary("Sintra", "KEEN", "MEH").summary).toBe(
      "changed their vote on Sintra from keen to meh",
    );
  });

  it("words a Day title set, rename and removal with the day and the Stop", () => {
    const base = { date: "2026-12-11", stopName: "Lisbon" };
    expect(dayTitleSummary({ ...base, before: null, after: "Sintra day trip" }).summary).toBe(
      "titled Fri 11 Dec in Lisbon “Sintra day trip”",
    );
    expect(dayTitleSummary({ ...base, before: "Sintra day trip", after: "Rest day" }).summary).toBe(
      "renamed Fri 11 Dec in Lisbon from “Sintra day trip” to “Rest day”",
    );
    expect(dayTitleSummary({ ...base, before: "Sintra day trip", after: null }).summary).toBe(
      "removed the “Sintra day trip” title from Fri 11 Dec in Lisbon",
    );
  });
});

describe("TC-07 entity types", () => {
  it("diffs a Checklist item's text, due date and assignee name", () => {
    expect(
      describeChanges(
        "CHECKLIST_ITEM",
        { text: "Insurance", dueDate: null, assignedToName: null },
        { text: "Travel insurance", dueDate: "2026-11-20", assignedToName: "Sam" },
      ).map((c) => [c.label, c.from, c.to]),
    ).toEqual([
      ["Text", "Insurance", "Travel insurance"],
      ["Due date", "", "Fri 20 Nov 2026"],
      ["Assigned to", "", "Sam"],
    ]);
  });

  it("diffs a Reminder's title, date, notes and what it is about (spec F8)", () => {
    expect(
      describeChanges(
        "REMINDER",
        { title: "Print docs", date: "2026-11-26", notes: null, about: null },
        { title: "Print docs", date: "2026-11-28", notes: "Two copies", about: "Lisbon" },
      ).map((c) => c.label),
    ).toEqual(["Date", "Notes", "About"]);
  });

  it("labels the new entity types from their text", () => {
    expect(entityLabel("CHECKLIST_ITEM", { text: "Sunscreen" })).toBe("Sunscreen");
    expect(entityLabel("REMINDER", { title: "Print docs" })).toBe("Print docs");
    expect(entityLabel("VOTE", { title: "Sintra" })).toBe("Sintra");
    expect(entityLabel("DAY_TITLE", { title: "Rest day" })).toBe("Rest day");
    expect(entityLabel("DAY_TITLE", {})).toBe("Day title");
  });

  it("gives the new entity types sensible fallback headlines", () => {
    expect(headline({ verb: "UPDATED", entityType: "CHECKLIST_ITEM", entityLabel: "Sunscreen" })).toBe(
      "updated the Sunscreen checklist item",
    );
    expect(headline({ verb: "CREATED", entityType: "REMINDER", entityLabel: "Print docs" })).toBe(
      "added the Print docs reminder",
    );
    expect(headline({ verb: "CREATED", entityType: "VOTE", entityLabel: "Sintra" })).toBe("voted on Sintra");
  });
});

describe("activityLine", () => {
  it("prefers a summary payload", () => {
    expect(
      activityLine({
        verb: "UPDATED",
        entityType: "VOTE",
        entityLabel: "Sintra",
        changes: { summary: "voted must-do on Sintra" },
      }),
    ).toBe("voted must-do on Sintra");
  });

  it("falls back to the headline for diffs, excerpts and null", () => {
    expect(activityLine({ verb: "UPDATED", entityType: "STOP", entityLabel: "Rome", changes: [] })).toBe(
      "updated the Rome stop",
    );
    expect(activityLine({ verb: "NOTED", entityType: "NOTE", entityLabel: "note", changes: { excerpt: "hi" } })).toBe(
      "left a note",
    );
  });

  it("still renders a legacy Day-title row as before", () => {
    expect(activityLine({ verb: "UPDATED", entityType: "DAY_TITLE", entityLabel: "Day title", changes: null })).toBe(
      "updated a day title",
    );
    expect(activityLine({ verb: "DELETED", entityType: "DAY_TITLE", entityLabel: "Day title", changes: null })).toBe(
      "removed a day title",
    );
  });
});

describe("surpriseSummary", () => {
  it("words setting a Surprise with the surprised Travellers' names", () => {
    expect(surpriseSummary({ kind: "set", kindOf: "STOP", label: "Paris", forNames: ["Sam", "Alex"] }).summary).toBe(
      "made Paris a surprise for Sam and Alex",
    );
    expect(surpriseSummary({ kind: "set", kindOf: "ITEM", label: "Dinner", forNames: ["Sam", "Alex", "Jo"] }).summary).toBe(
      "made Dinner a surprise for Sam, Alex and Jo",
    );
    expect(surpriseSummary({ kind: "set", kindOf: "ITEM", label: "Dinner", forNames: ["Sam"] }).summary).toBe(
      "made Dinner a surprise for Sam",
    );
  });

  it("words a reveal differently for a Stop and an Item", () => {
    expect(surpriseSummary({ kind: "reveal", kindOf: "STOP", label: "Paris" }).summary).toBe("revealed the surprise in Paris");
    expect(surpriseSummary({ kind: "reveal", kindOf: "ITEM", label: "Dinner" }).summary).toBe("revealed the surprise: Dinner");
  });
});

describe("homeTimezoneSummary (ADR 0030 amendment 2026-10-16)", () => {
  it("names the new zone and says the Home-end times kept their local time", () => {
    expect(homeTimezoneSummary("Australia/Brisbane", true)).toEqual({
      summary: "changed the Home timezone to Australia/Brisbane; Home-end times kept as local times",
    });
  });
  it("leaves the clause off when no Home-end time had to move", () => {
    expect(homeTimezoneSummary("Australia/Brisbane", false)).toEqual({ summary: "changed the Home timezone to Australia/Brisbane" });
  });
  it("a cleared zone reads as cleared", () => {
    expect(homeTimezoneSummary(null, true)).toEqual({ summary: "cleared the Home timezone; Home-end times kept as local times" });
  });
  it("is the line activityLine shows", () => {
    expect(activityLine({ verb: "UPDATED", entityType: "TRANSPORT", entityLabel: "Home timezone", changes: homeTimezoneSummary("Australia/Brisbane", true) }))
      .toBe("changed the Home timezone to Australia/Brisbane; Home-end times kept as local times");
  });
});

describe("describeChanges booking state (spec 2026-10-17 R2)", () => {
  it.each(["ITEM", "TRANSPORT", "ACCOMMODATION"] as const)("%s: names the state and the book-by date in words", (kind) => {
    const changes = describeChanges(kind, { bookingState: "TO_BOOK", bookBy: "2026-11-20" }, { bookingState: "BOOKED", bookBy: null });
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: "bookingState", label: "Booking", from: "To book", to: "Booked" },
        expect.objectContaining({ field: "bookBy", label: "Book by", to: "" }),
      ]),
    );
  });
  it("an unchanged state is no change", () => {
    expect(describeChanges("TRANSPORT", { bookingState: "TO_BOOK" }, { bookingState: "TO_BOOK" })).toEqual([]);
  });
});

describe("describeChanges ITEM: Slot time (R3)", () => {
  it("names the slot, the margin and refundability in plain words", () => {
    expect(
      describeChanges(
        "ITEM",
        { title: "Tour", slotTime: null, arriveByMinutes: null, refundable: null },
        { title: "Tour", slotTime: "12:00", arriveByMinutes: 15, refundable: false },
      ).map((c) => [c.label, c.from, c.to]),
    ).toEqual([
      ["Slot time", "", "12:00"],
      ["Be there early", "", "15 min"],
      ["Refundable", "Not known", "No"],
    ]);
  });
  it("refundable Yes back to not known", () => {
    expect(
      describeChanges("ITEM", { refundable: true }, { refundable: null }).map((c) => [c.label, c.from, c.to]),
    ).toEqual([["Refundable", "Yes", "Not known"]]);
  });
  it("an unchanged slot is no change", () => {
    expect(describeChanges("ITEM", { slotTime: "12:00", refundable: true }, { slotTime: "12:00", refundable: true })).toEqual([]);
    expect(describeChanges("ITEM", { refundable: null }, { refundable: null })).toEqual([]);
  });
});

// Adapted from task-D.4-brief.md to Section S's actual shape (d-as-built.md,
// authoritative): Item.openingHours is a JSON *string* column
// (lib/validations/opening-hours.ts), not a Json column, so the before/after
// values here are already serialised strings — describeChanges compares them
// with plain `===` (two equal JSON strings from the same source object are
// byte-identical), so normaliseForComparison needs no new object-handling.
describe("describeChanges: an Item's opening hours (CONTEXT.md Opening hours)", () => {
  const span = [["10:00", "18:00"]];
  const hours = { week: { sun: [], mon: span, tue: span, wed: span, thu: span, fri: span, sat: [] }, seasons: [], closed: [] };
  const stored = serializeOpeningHours(hours as never);

  it("reads a change as the one-line summary, and not set as 'Not set'", () => {
    expect(describeChanges("ITEM", { title: "Lello", openingHours: null }, { title: "Lello", openingHours: stored })).toEqual([
      { field: "openingHours", label: "Opening hours", from: "Not set", to: "Mon–Fri 10:00–18:00 · Sat–Sun closed" },
    ]);
  });

  it("an unchanged value (re-serialised from an equal object) is no change", () => {
    const again = serializeOpeningHours(JSON.parse(JSON.stringify(hours)));
    expect(describeChanges("ITEM", { openingHours: stored }, { openingHours: again })).toEqual([]);
  });
});

describe("describeChanges: an Item's Try list (CONTEXT.md Try list)", () => {
  const two = JSON.stringify([
    { id: "e1", text: "Lebkuchen", tried: true },
    { id: "e2", text: "Drei im Weggla", tried: false },
  ]);

  it("adding entries reads as the list before and after; none reads 'Not set'", () => {
    expect(describeChanges("ITEM", { title: "Market", tryList: null }, { title: "Market", tryList: two })).toEqual([
      { field: "tryList", label: "Try list", from: "Not set", to: "Lebkuchen, Drei im Weggla" },
    ]);
    const three = JSON.stringify([...JSON.parse(two), { id: "e3", text: "Schäufele", tried: false }]);
    expect(describeChanges("ITEM", { tryList: two }, { tryList: three })).toEqual([
      { field: "tryList", label: "Try list", from: "Lebkuchen, Drei im Weggla", to: "Lebkuchen, Drei im Weggla, Schäufele" },
    ]);
    expect(describeChanges("ITEM", { tryList: two }, { tryList: null })).toEqual([
      { field: "tryList", label: "Try list", from: "Lebkuchen, Drei im Weggla", to: "Not set" },
    ]);
  });

  it("a change that only moves ticks is no change (ticks are not Activity)", () => {
    const ticked = JSON.stringify([
      { id: "e1", text: "Lebkuchen", tried: false },
      { id: "e2", text: "Drei im Weggla", tried: true },
    ]);
    expect(describeChanges("ITEM", { tryList: two }, { tryList: ticked })).toEqual([]);
  });

  it("a reorder or rename is a change", () => {
    const reordered = JSON.stringify([
      { id: "e2", text: "Drei im Weggla", tried: false },
      { id: "e1", text: "Lebkuchen", tried: true },
    ]);
    expect(describeChanges("ITEM", { tryList: two }, { tryList: reordered })).toEqual([
      { field: "tryList", label: "Try list", from: "Lebkuchen, Drei im Weggla", to: "Drei im Weggla, Lebkuchen" },
    ]);
  });

  it("an unreadable stored value still reads as a change, as 'Set'", () => {
    expect(describeChanges("ITEM", { tryList: "not json" }, { tryList: two })).toEqual([
      { field: "tryList", label: "Try list", from: "Set", to: "Lebkuchen, Drei im Weggla" },
    ]);
  });
});
