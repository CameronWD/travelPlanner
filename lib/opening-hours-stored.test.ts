import { describe, expect, it } from "vitest";
import { parseOpeningHours } from "@/lib/validations/opening-hours";
import { withOpeningHours } from "./opening-hours-stored";

// Adapted from the D.2 brief to S's actual storage (d-as-built.md): the
// column is a JSON string, not jsonb, so there is no "jsonb hands numeric
// keys back as strings" concern, and readStoredOpeningHours/
// storedOpeningHours/itemFamilyWhere are S's parseOpeningHours/
// serializeOpeningHours/itemFamilyRoot/itemFamilyWhere
// (already tested in lib/validations/opening-hours.test.ts and
// lib/item-family.test.ts) — not re-tested here.
describe("withOpeningHours", () => {
  it("parses a row's column in place", () => {
    const stored = '{"week":{"mon":[["10:00","18:00"]]},"seasons":[],"closed":[]}';
    expect(withOpeningHours({ id: "i1", openingHours: stored })).toEqual({
      id: "i1",
      openingHours: parseOpeningHours(stored),
    });
  });

  it("a null column stays null", () => {
    expect(withOpeningHours({ id: "i1", openingHours: null })).toEqual({ id: "i1", openingHours: null });
  });

  it("unreadable JSON parses as not known (null), not a throw", () => {
    expect(withOpeningHours({ id: "i1", openingHours: "not json" })).toEqual({ id: "i1", openingHours: null });
  });
});
