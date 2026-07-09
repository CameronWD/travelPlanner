import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ok, fail, flattenZodErrors, validationResult } from "./action-result";

describe("ok", () => {
  it("returns a plain success", () => {
    expect(ok()).toEqual({ success: true });
  });
  it("spreads a payload onto the success branch", () => {
    expect(ok({ tripId: "t1" })).toEqual({ success: true, tripId: "t1" });
  });
});

describe("fail", () => {
  it("wraps a field-error dict", () => {
    expect(fail({ name: ["Required"] })).toEqual({
      success: false,
      errors: { name: ["Required"] },
    });
  });
});

describe("flattenZodErrors", () => {
  it("maps field errors and defaults missing arrays to []", () => {
    const schema = z.object({ name: z.string().min(1), age: z.number() });
    const parsed = schema.safeParse({ name: "", age: 5 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = flattenZodErrors(parsed.error);
      expect(errors.name.length).toBeGreaterThan(0);
    }
  });
  it("surfaces form-level errors under the _ key", () => {
    const schema = z.string().min(3);
    const parsed = schema.safeParse("a");
    if (!parsed.success) {
      const errors = flattenZodErrors(parsed.error);
      expect(errors._.length).toBeGreaterThan(0);
    }
  });
});

describe("validationResult", () => {
  it("returns a failure result from a ZodError", () => {
    const schema = z.object({ name: z.string().min(1) });
    const parsed = schema.safeParse({ name: "" });
    if (!parsed.success) {
      const result = validationResult(parsed.error);
      expect(result.success).toBe(false);
      expect(result.errors.name.length).toBeGreaterThan(0);
    }
  });
});
