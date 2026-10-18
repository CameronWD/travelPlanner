import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TRY_ENTRIES, MAX_TRY_TEXT, TRY_ENTRY_ID_LENGTH, applyTryListInput, newTryEntryId,
  sameTryEntries, triedLabel, tryListProgress, tryListSummary, untickAll, withEntryTried, type TryList,
} from "./try-list";

const LIST: TryList = [
  { id: "aaaa1111", text: "Drei im Weggla", tried: true },
  { id: "bbbb2222", text: "Feuerzangenbowle", tried: false },
];

afterEach(() => vi.restoreAllMocks());

describe("limits", () => {
  it("are 30 entries of 1–80 characters", () => {
    expect(MAX_TRY_ENTRIES).toBe(30);
    expect(MAX_TRY_TEXT).toBe(80);
  });
});

describe("newTryEntryId", () => {
  it("is 8 lowercase letters or digits", () => {
    expect(TRY_ENTRY_ID_LENGTH).toBe(8);
    for (let i = 0; i < 50; i++) expect(newTryEntryId()).toMatch(/^[a-z0-9]{8}$/);
  });

  it("never returns an id already taken", () => {
    const real = crypto.getRandomValues.bind(crypto);
    vi.spyOn(crypto, "getRandomValues")
      .mockImplementationOnce(((a: Uint8Array) => a.fill(0)) as never) // "aaaaaaaa"
      .mockImplementation(real as never);
    const id = newTryEntryId(new Set(["aaaaaaaa"]));
    expect(id).not.toBe("aaaaaaaa");
    expect(id).toMatch(/^[a-z0-9]{8}$/);
  });
});

describe("applyTryListInput (replace the list; ticks follow the id)", () => {
  it("keeps an existing id and its tick unless tried is given; others get a fresh id, untried by default; input order wins", () => {
    const next = applyTryListInput(LIST, [
      { id: "bbbb2222", text: "Feuerzangenbowle (Christkindlesmarkt)" },
      { id: "aaaa1111", text: "Drei im Weggla" },
      { text: "Lebkuchen" },
      { id: "zzzz9999", text: "Rauchbier", tried: true },
    ]);
    expect(next.map((e) => [e.text, e.tried])).toEqual([
      ["Feuerzangenbowle (Christkindlesmarkt)", false],
      ["Drei im Weggla", true],
      ["Lebkuchen", false],
      ["Rauchbier", true],
    ]);
    expect(next[0].id).toBe("bbbb2222");
    expect(next[1].id).toBe("aaaa1111");
    expect(next[2].id).toMatch(/^[a-z0-9]{8}$/);
    expect(next[3].id).not.toBe("zzzz9999"); // an unknown id is not adopted
    expect(new Set(next.map((e) => e.id)).size).toBe(4);
  });

  it("an explicit tried overrides the kept tick", () => {
    expect(applyTryListInput(LIST, [{ id: "aaaa1111", text: "Drei im Weggla", tried: false }])).toEqual([
      { id: "aaaa1111", text: "Drei im Weggla", tried: false },
    ]);
  });

  it("drops entries left out, starts from nothing when there is no list, and an empty input is an empty list", () => {
    expect(applyTryListInput(LIST, [{ id: "bbbb2222", text: "Feuerzangenbowle" }])).toEqual([LIST[1]]);
    expect(applyTryListInput(null, [{ text: "Lebkuchen" }])).toEqual([{ id: expect.stringMatching(/^[a-z0-9]{8}$/), text: "Lebkuchen", tried: false }]);
    expect(applyTryListInput(LIST, [])).toEqual([]);
  });

  it("a repeated id keeps the first; the second gets a fresh id", () => {
    const next = applyTryListInput(LIST, [{ id: "aaaa1111", text: "A" }, { id: "aaaa1111", text: "B" }]);
    expect(next[0]).toEqual({ id: "aaaa1111", text: "A", tried: true });
    expect(next[1].id).not.toBe("aaaa1111");
    expect(next[1].tried).toBe(false);
  });
});

describe("withEntryTried", () => {
  it("ticks or unticks one entry by id and leaves the rest", () => {
    expect(withEntryTried(LIST, "bbbb2222", true)).toEqual([LIST[0], { ...LIST[1], tried: true }]);
    expect(withEntryTried(LIST, "aaaa1111", false)).toEqual([{ ...LIST[0], tried: false }, LIST[1]]);
    expect(LIST[1].tried).toBe(false); // input untouched
  });
  it("is null when there is no such entry or no list", () => {
    expect(withEntryTried(LIST, "nope", true)).toBeNull();
    expect(withEntryTried(null, "aaaa1111", true)).toBeNull();
  });
});

describe("untickAll", () => {
  it("keeps ids, text and order with every tick cleared; no list stays no list", () => {
    expect(untickAll(LIST)).toEqual([{ ...LIST[0], tried: false }, LIST[1]]);
    expect(untickAll(null)).toBeNull();
  });
});

describe("tryListProgress", () => {
  it("counts ticks; null with no list or an empty one", () => {
    expect(tryListProgress(LIST)).toEqual({ tried: 1, total: 2 });
    expect(tryListProgress([])).toBeNull();
    expect(tryListProgress(null)).toBeNull();
    expect(tryListProgress(undefined)).toBeNull();
  });
});

describe("triedLabel (the Timeline's count)", () => {
  it("reads 'tried/total tried'; no list is no label", () => {
    expect(triedLabel(LIST)).toBe("1/2 tried");
    expect(triedLabel([])).toBeNull();
    expect(triedLabel(null)).toBeNull();
    expect(triedLabel(undefined)).toBeNull();
  });
});

describe("tryListSummary (one Activity line)", () => {
  it("names up to five entries, then how many more", () => {
    expect(tryListSummary(LIST)).toBe("Drei im Weggla, Feuerzangenbowle");
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `x${i}`, text: `Thing ${i + 1}`, tried: false }));
    expect(tryListSummary(seven)).toBe("Thing 1, Thing 2, Thing 3, Thing 4, Thing 5 +2 more");
    expect(tryListSummary(seven.slice(0, 5))).toBe("Thing 1, Thing 2, Thing 3, Thing 4, Thing 5");
  });
});

describe("sameTryEntries (a tick is not a list edit)", () => {
  it("compares the entries' texts in order, not the ticks", () => {
    expect(sameTryEntries(LIST, [{ ...LIST[0], tried: false }, { ...LIST[1], tried: true }])).toBe(true);
    expect(sameTryEntries(LIST, [LIST[1], LIST[0]])).toBe(false);
    expect(sameTryEntries(LIST, [LIST[0]])).toBe(false);
    expect(sameTryEntries(LIST, [LIST[0], { ...LIST[1], text: "Schäufele" }])).toBe(false);
    expect(sameTryEntries(null, [])).toBe(true);
    expect(sameTryEntries(undefined, null)).toBe(true);
  });
});
