import { describe, expect, it } from "vitest";
import { applyPatch, patched, toPatch } from "./patch";

type Input = { name: string; notes?: string; address?: string; nights?: number; hidden?: boolean };

describe("patched (one field)", () => {
  it("undefined keeps the current value", () => {
    expect(patched(undefined, "old")).toBe("old");
  });
  it("null clears, whatever the current value", () => {
    expect(patched(null, "old")).toBeUndefined();
  });
  it("a value replaces, falsy ones included", () => {
    expect(patched("", "old")).toBe("");
    expect(patched(0, 5)).toBe(0);
    expect(patched(false, true)).toBe(false);
  });
  it("a current null reads as no value", () => {
    expect(patched(undefined, null)).toBeUndefined();
  });
});

describe("applyPatch", () => {
  const row = { name: "Rome", notes: "old", address: null, nights: 2, hidden: true };
  it("an empty patch keeps every current value and turns a stored null into no value", () => {
    expect(applyPatch<Input>(row, {})).toEqual({ name: "Rome", notes: "old", nights: 2, hidden: true });
    expect(applyPatch<Input>(row, {})).not.toHaveProperty("address");
  });
  it("undefined keeps, null clears, a value replaces", () => {
    expect(applyPatch<Input>(row, { notes: null, name: "Roma", nights: undefined })).toEqual({ name: "Roma", nights: 2, hidden: true });
  });
  it("a full input replaces every field it names (a form's save)", () => {
    expect(applyPatch<Input>(row, { name: "Naples", notes: "new", address: "Via Roma 1", nights: 3, hidden: false })).toEqual({
      name: "Naples", notes: "new", address: "Via Roma 1", nights: 3, hidden: false,
    });
  });
  it("a key the row doesn't have passes through (inline cost fields, surpriseForIds)", () => {
    expect(applyPatch<Input & { costMinor?: number }>(row, { costMinor: 500 })).toMatchObject({ costMinor: 500 });
  });
});

describe("toPatch (a form's full input as a PATCH)", () => {
  it("sends null for a listed field the form left empty, absent or undefined", () => {
    const input: Input = { name: "Rome", notes: undefined };
    expect(toPatch(input, ["notes", "address"])).toEqual({ name: "Rome", notes: null, address: null });
  });
  it("leaves a filled field and every unlisted field alone", () => {
    const input: Input = { name: "Rome", notes: "kept", nights: undefined };
    const out = toPatch(input, ["notes"]);
    expect(out).toEqual({ name: "Rome", notes: "kept", nights: undefined });
  });
  it("does not change the input it was given", () => {
    const input: Input = { name: "Rome" };
    toPatch(input, ["notes"]);
    expect(input).toEqual({ name: "Rome" });
  });
});
