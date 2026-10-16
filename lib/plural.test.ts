import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("adds an s by default", () => {
    expect(plural(1, "night")).toBe("1 night");
    expect(plural(0, "night")).toBe("0 nights");
    expect(plural(3, "night")).toBe("3 nights");
  });
  it("takes an explicit plural for irregular nouns and capitalised labels", () => {
    expect(plural(1, "country", "countries")).toBe("1 country");
    expect(plural(2, "country", "countries")).toBe("2 countries");
    expect(plural(2, "Access request", "Access requests")).toBe("2 Access requests");
  });
  it("treats only exactly 1 as singular", () => {
    expect(plural(-1, "night")).toBe("-1 nights");
    expect(plural(1.5, "night")).toBe("1.5 nights");
  });
});
