import { describe, expect, it } from "vitest";
import {
  ACTIVITY_VERBS,
  ACTIVITY_ENTITY_TYPES,
  describeChanges,
  entityLabel,
  headline,
} from "@/lib/activity";

// ---------------------------------------------------------------------------
// Vocab constants
// ---------------------------------------------------------------------------

describe("ACTIVITY_VERBS", () => {
  it("contains the four expected verbs", () => {
    expect(ACTIVITY_VERBS).toEqual(["CREATED", "UPDATED", "DELETED", "NOTED"]);
  });
});

describe("ACTIVITY_ENTITY_TYPES", () => {
  it("contains the seven expected entity types", () => {
    expect(ACTIVITY_ENTITY_TYPES).toEqual([
      "STOP",
      "ITEM",
      "TRANSPORT",
      "ACCOMMODATION",
      "CHAPTER",
      "COST",
      "NOTE",
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
  it("formats estimatedMinor with formatMoney using the row currency", () => {
    const changes = describeChanges(
      "COST",
      { estimatedMinor: 1000, currency: "AUD" },
      { estimatedMinor: 2500, currency: "AUD" },
    );
    const est = changes.find((c) => c.field === "estimatedMinor");
    expect(est).toBeDefined();
    // A$10.00 → A$25.00 (en-AU locale)
    expect(est!.from).toContain("10.00");
    expect(est!.to).toContain("25.00");
  });

  it("formats actualMinor with formatMoney using the row currency", () => {
    const changes = describeChanges(
      "COST",
      { actualMinor: 500, currency: "USD" },
      { actualMinor: 750, currency: "USD" },
    );
    const act = changes.find((c) => c.field === "actualMinor");
    expect(act).toBeDefined();
    expect(act!.from).toContain("5.00");
    expect(act!.to).toContain("7.50");
  });

  it("returns [] when no COST fields changed", () => {
    const row = { estimatedMinor: 1000, actualMinor: 500, currency: "AUD", category: "OTHER" };
    expect(describeChanges("COST", row, { ...row })).toHaveLength(0);
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
});
