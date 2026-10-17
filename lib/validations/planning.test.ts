import { describe, expect, it } from "vitest";
import { z } from "zod";
import { bookingStateSchema } from "@/lib/enums";
import { arriveByMinutesSchema, bookBySchema, checkSlotFields, refundableSchema, slotTimeSchema } from "./planning";

describe("bookingStateSchema", () => {
  it("accepts the three states only", () => {
    expect(bookingStateSchema.safeParse("TO_BOOK").success).toBe(true);
    expect(bookingStateSchema.safeParse("TENTATIVE").success).toBe(false);
  });
});

describe("bookBySchema", () => {
  it("is a real calendar date with a book-by message", () => {
    expect(bookBySchema.parse("2026-11-01")).toBe("2026-11-01");
    const bad = bookBySchema.safeParse("2026-02-30");
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("Book-by date must be a real calendar date");
    expect(bookBySchema.safeParse("1 Nov").error?.issues[0]?.message).toBe("Book-by date must be in YYYY-MM-DD format");
  });
});

describe("slot fields", () => {
  it("slot time is HH:MM", () => {
    expect(slotTimeSchema.safeParse("12:00").success).toBe(true);
    expect(slotTimeSchema.safeParse("12").success).toBe(false);
  });
  it("arrive-by is whole minutes from 0 to 720", () => {
    expect(arriveByMinutesSchema.safeParse(0).success).toBe(true);
    expect(arriveByMinutesSchema.safeParse(720).success).toBe(true);
    expect(arriveByMinutesSchema.safeParse(721).success).toBe(false);
    expect(arriveByMinutesSchema.safeParse(-1).success).toBe(false);
    expect(arriveByMinutesSchema.safeParse(7.5).success).toBe(false);
  });
  it("arrive-by's errors use the field's label, Be there early", () => {
    const msg = (v: number) => arriveByMinutesSchema.safeParse(v).error?.issues[0]?.message;
    expect(msg(7.5)).toBe("Be there early must be whole minutes");
    expect(msg(-1)).toBe("Be there early can't be negative");
    expect(msg(721)).toBe("Be there early can be at most 12 hours");
  });
  it("refundable is yes or no (null, not known, is the caller's nullable())", () => {
    expect(refundableSchema.safeParse(false).success).toBe(true);
    expect(refundableSchema.safeParse("no").success).toBe(false);
  });
  it("an arrive-by margin needs a slot time", () => {
    const s = z
      .object({ slotTime: slotTimeSchema.nullable().optional(), arriveByMinutes: arriveByMinutesSchema.nullable().optional() })
      .superRefine(checkSlotFields);
    expect(s.safeParse({ slotTime: "12:00", arriveByMinutes: 15 }).success).toBe(true);
    expect(s.safeParse({ slotTime: "12:00" }).success).toBe(true);
    expect(s.safeParse({}).success).toBe(true);
    const bad = s.safeParse({ arriveByMinutes: 15 });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]).toMatchObject({ path: ["arriveByMinutes"], message: "Be there early needs a slot time" });
    expect(s.safeParse({ slotTime: null, arriveByMinutes: 15 }).success).toBe(false);
  });
});
