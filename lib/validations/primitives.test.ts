import { describe, expect, it } from "vitest";
import { hhmm, isoDate, isoDateWith } from "./primitives";

const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe("isoDate", () => {
  it.each(["2026-07-01", "2024-02-29", "2026-12-31"])("accepts the real date %s", (s) => {
    expect(isoDate.safeParse(s).success).toBe(true);
  });

  it.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-04-31", "2026-00-10"])(
    "refuses %s, which matches the format but is not a calendar date",
    (s) => {
      expect(messages(isoDate.safeParse(s))).toEqual(["Date must be a real calendar date"]);
    },
  );

  it.each(["", "5 Dec", "2026-7-1", "2026-07-01T00:00:00Z"])("refuses %o with only the format message", (s) => {
    expect(messages(isoDate.safeParse(s))).toEqual(["Date must be in YYYY-MM-DD format"]);
  });

  it("stays a plain string schema (optional/nullable/union compose)", () => {
    expect(isoDate.optional().safeParse(undefined).success).toBe(true);
    expect(isoDate.nullable().safeParse(null).success).toBe(true);
  });
});

describe("isoDateWith", () => {
  const due = isoDateWith("Due date must be YYYY-MM-DD", "Due date must be a real calendar date");
  it("carries its own messages", () => {
    expect(messages(due.safeParse("soon"))).toEqual(["Due date must be YYYY-MM-DD"]);
    expect(messages(due.safeParse("2026-02-30"))).toEqual(["Due date must be a real calendar date"]);
  });
});

describe("hhmm", () => {
  it.each(["00:00", "09:30", "23:59"])("accepts %s", (s) => expect(hhmm.safeParse(s).success).toBe(true));
  it.each(["24:00", "9:30", "12:60", "12:00:00", ""])("refuses %o", (s) => {
    expect(messages(hhmm.safeParse(s))).toEqual(["Time must be in HH:MM format (24h)"]);
  });
});
