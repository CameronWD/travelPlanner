import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ok, fail, formFail, flattenZodErrors, validationResult } from "./action-result";

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
  it("fail() with extra failure fields keeps them on the failure branch", () => {
    const r = fail({ _: ["x"] }, { code: "busy", createdStops: { a: "b" } });
    expect(r.code).toBe("busy");
    expect(r.createdStops).toEqual({ a: "b" });
  });
});

describe("formFail", () => {
  it("formFail puts the message under the one form-level key and carries a code", () => {
    expect(formFail("Nope", "disabled")).toEqual({ success: false, errors: { _: ["Nope"] }, code: "disabled" });
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
