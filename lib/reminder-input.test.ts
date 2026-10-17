import { describe, it, expect } from "vitest";
import { checkReminderInput } from "./reminder-input";
import { reminderFieldsSchema } from "./validations/reminder";
import { flattenZodErrors } from "./action-result";

const CASES = [
  { title: "Reconfirm the tour", date: "2026-12-05" },
  { title: "   ", date: "2026-12-05" },
  { title: "x".repeat(201), date: "2026-12-05" },
  { title: "Ok", date: "" },
  { title: "Ok", date: "5 Dec" },
  { title: "", date: "" },
  { title: "Ok", date: "2026-02-30" },
  { title: "Ok", date: "2026-12-05", notes: "  door code 4411  " },
  { title: "Ok", date: "2026-12-05", notes: "" },
  { title: "Ok", date: "2026-12-05", notes: "x".repeat(2001) },
];

describe("checkReminderInput (spec 2026-10-06 §R)", () => {
  it.each(CASES)("agrees with reminderSchema on %o", (input) => {
    const plain = checkReminderInput(input);
    const zod = reminderFieldsSchema.omit({ stopId: true, itemId: true, transportId: true }).safeParse(input);
    expect(plain.success).toBe(zod.success);
    if (plain.success && zod.success) expect(plain.data).toEqual(zod.data);
    if (!plain.success && !zod.success) expect(plain.errors).toEqual(flattenZodErrors(zod.error));
  });

  it("refuses an impossible date with the schema's message", () => {
    expect(checkReminderInput({ title: "Ok", date: "2026-02-30" })).toEqual({
      success: false,
      errors: { date: ["Reminder date must be a real date"] },
    });
  });
});
