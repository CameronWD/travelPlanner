import { describe, expect, it } from "vitest";
import { parseOpeningHours } from "@/lib/validations/opening-hours";
import { readStoredOpeningHours, withOpeningHours } from "./opening-hours-stored";

// Adapted from the D.2 brief to S's actual storage (d-as-built.md): the
// column is a JSON string, not jsonb, so there is no "jsonb hands numeric
// keys back as strings" concern, and readStoredOpeningHours/
// storedOpeningHours/openingHoursFamilyWhere are S's parseOpeningHours/
// serializeOpeningHours/openingHoursFamilyRoot/openingHoursFamilyWhere
// (already tested in lib/validations/opening-hours.test.ts and
// lib/opening-hours.test.ts) — not re-tested here.
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

// Task D.11: the Claude connection's reads feed this function either the
// stored JSON string (get_trip_plan, the narrow reads) or an already-parsed
// value (get_day's items), and need the same result from both.
describe("readStoredOpeningHours", () => {
  const stored = '{"week":{"mon":[["10:00","18:00"]]},"seasons":[],"closed":[]}';

  it("null or undefined reads as not known", () => {
    expect(readStoredOpeningHours(null)).toBeNull();
    expect(readStoredOpeningHours(undefined)).toBeNull();
  });

  it("a stored JSON string parses the same as parseOpeningHours", () => {
    expect(readStoredOpeningHours(stored)).toEqual(parseOpeningHours(stored));
  });

  it("an already-parsed value is idempotent", () => {
    const parsed = parseOpeningHours(stored);
    expect(readStoredOpeningHours(parsed)).toEqual(parsed);
  });

  it("an invalid already-parsed shape reads as not known, not a throw", () => {
    expect(readStoredOpeningHours({ week: "?" })).toBeNull();
  });
});
