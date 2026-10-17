import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { TryEntryInput, TryList } from "@/lib/try-list";
import { parseTryList, serializeTryList, tryEntryTextSchema, tryListInputSchema, tryListSchema } from "./try-list";

const LIST = [
  { id: "aaaa1111", text: "Drei im Weggla", tried: true },
  { id: "bbbb2222", text: "Feuerzangenbowle", tried: false },
];
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}`, text: `Thing ${i}`, tried: false }));

describe("tryEntryTextSchema", () => {
  it("trims, and needs 1–80 characters", () => {
    expect(tryEntryTextSchema.parse("  Lebkuchen ")).toBe("Lebkuchen");
    expect(tryEntryTextSchema.safeParse("   ").success).toBe(false);
    expect(tryEntryTextSchema.safeParse("x".repeat(80)).success).toBe(true);
    expect(tryEntryTextSchema.safeParse("x".repeat(81)).success).toBe(false);
  });
});

describe("tryListSchema (the stored shape)", () => {
  it("parses to the TryList model", () => {
    expectTypeOf<z.output<typeof tryListSchema>>().toExtend<TryList>();
    expect(tryListSchema.parse(LIST)).toEqual(LIST);
  });
  it("refuses more than 30 entries, a repeated id, a missing tick, an odd id and an unknown key", () => {
    expect(tryListSchema.safeParse(many(30)).success).toBe(true);
    expect(tryListSchema.safeParse(many(31)).success).toBe(false);
    expect(tryListSchema.safeParse([LIST[0], { ...LIST[1], id: "aaaa1111" }]).success).toBe(false);
    expect(tryListSchema.safeParse([{ id: "aaaa1111", text: "x" }]).success).toBe(false);
    expect(tryListSchema.safeParse([{ id: "Not An Id", text: "x", tried: false }]).success).toBe(false);
    expect(tryListSchema.safeParse([{ ...LIST[0], due: "2027-01-01" }]).success).toBe(false);
  });
});

describe("tryListInputSchema (what a writer sends)", () => {
  it("takes entries with optional id and tick, trimmed", () => {
    expectTypeOf<z.output<typeof tryListInputSchema>>().toExtend<TryEntryInput[]>();
    expect(tryListInputSchema.parse([{ text: " Lebkuchen " }, { id: "aaaa1111", text: "Weggla", tried: true }])).toEqual([
      { text: "Lebkuchen" },
      { id: "aaaa1111", text: "Weggla", tried: true },
    ]);
    expect(tryListInputSchema.parse([])).toEqual([]);
  });
  it("refuses more than 30 entries, an empty text and the same id twice", () => {
    expect(tryListInputSchema.safeParse(many(31).map(({ text }) => ({ text }))).success).toBe(false);
    expect(tryListInputSchema.safeParse([{ text: "  " }]).success).toBe(false);
    expect(tryListInputSchema.safeParse([{ id: "aaaa1111", text: "A" }, { id: "aaaa1111", text: "B" }]).success).toBe(false);
  });
});

describe("parseTryList / serializeTryList", () => {
  it("round-trips a list", () => {
    expect(parseTryList(serializeTryList(LIST))).toEqual(LIST);
  });
  it("an empty list is stored as null, and null/empty/unreadable/invalid reads as no list", () => {
    expect(serializeTryList([])).toBeNull();
    expect(serializeTryList(null)).toBeNull();
    expect(serializeTryList(undefined)).toBeNull();
    expect(parseTryList(null)).toBeNull();
    expect(parseTryList("")).toBeNull();
    expect(parseTryList("[]")).toBeNull();
    expect(parseTryList("not json")).toBeNull();
    expect(parseTryList(JSON.stringify(many(31)))).toBeNull();
    expect(parseTryList('{"id":"x"}')).toBeNull();
  });
});
