import { describe, expect, it } from "vitest";
import { reminderSchema, REMINDER_ONE_THING } from "./reminder";
import { flattenZodErrors } from "@/lib/action-result";

const CUID_A = "cst0p00000000000000000001";
const CUID_B = "cit3m00000000000000000001";

describe("reminderSchema (spec F8)", () => {
  it("takes optional notes, trimmed, up to 2000 characters", () => {
    expect(reminderSchema.parse({ title: "T", date: "2026-12-05", notes: "  door code  " })).toEqual({ title: "T", date: "2026-12-05", notes: "door code" });
    const r = reminderSchema.safeParse({ title: "T", date: "2026-12-05", notes: "x".repeat(2001) });
    expect(r.success).toBe(false);
    if (!r.success) expect(flattenZodErrors(r.error)).toEqual({ notes: ["Notes must be 2000 characters or fewer"] });
  });
  it("is about one Stop, one Item or one leg", () => {
    for (const about of [{ stopId: CUID_A }, { itemId: CUID_A }, { transportId: CUID_A }]) {
      expect(reminderSchema.safeParse({ title: "T", date: "2026-12-05", ...about }).success).toBe(true);
    }
  });
  it("refuses a Reminder about two things, form-level", () => {
    const r = reminderSchema.safeParse({ title: "T", date: "2026-12-05", stopId: CUID_A, itemId: CUID_B });
    expect(r.success).toBe(false);
    if (!r.success) expect(flattenZodErrors(r.error)).toEqual({ _: [REMINDER_ONE_THING] });
  });
  // An empty about id is "not about that" (as aboutCount reads it), never a
  // value to write: "" would fail the FK, and it must not count as a second thing.
  it("reads an empty about id as unset", () => {
    expect(reminderSchema.parse({ title: "T", date: "2026-12-05", stopId: "", itemId: "", transportId: "" })).toEqual({ title: "T", date: "2026-12-05" });
    expect(reminderSchema.parse({ title: "T", date: "2026-12-05", stopId: "", itemId: CUID_B })).toEqual({ title: "T", date: "2026-12-05", itemId: CUID_B });
  });
});
