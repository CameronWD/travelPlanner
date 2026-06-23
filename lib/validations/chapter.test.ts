import { describe, expect, it } from "vitest";
import { chapterSchema } from "./chapter";

const VALID = { name: "Italy", colour: "rose", startDate: "2026-07-10", endDate: "2026-07-18" };

describe("chapterSchema", () => {
  it("accepts a valid chapter", () => {
    expect(chapterSchema.safeParse(VALID).success).toBe(true);
  });
  it("rejects an empty name", () => {
    expect(chapterSchema.safeParse({ ...VALID, name: "  " }).success).toBe(false);
  });
  it("rejects an unknown colour", () => {
    expect(chapterSchema.safeParse({ ...VALID, colour: "chartreuse" }).success).toBe(false);
  });
  it("rejects endDate before startDate", () => {
    const r = chapterSchema.safeParse({ ...VALID, startDate: "2026-07-18", endDate: "2026-07-10" });
    expect(r.success).toBe(false);
  });
  it("allows a single-day chapter (end == start)", () => {
    expect(chapterSchema.safeParse({ ...VALID, startDate: "2026-07-10", endDate: "2026-07-10" }).success).toBe(true);
  });
});
