import { describe, expect, it } from "vitest";
import { withTryList } from "./try-list-stored";

describe("withTryList", () => {
  it("parses a row's stored Try list in place; none or unreadable reads as null", () => {
    const list = [{ id: "e1", text: "Lebkuchen", tried: true }];
    expect(withTryList({ id: "i1", tryList: JSON.stringify(list) })).toEqual({ id: "i1", tryList: list });
    expect(withTryList({ id: "i2", tryList: null })).toEqual({ id: "i2", tryList: null });
    expect(withTryList({ id: "i3", tryList: "nope" })).toEqual({ id: "i3", tryList: null });
  });
});
