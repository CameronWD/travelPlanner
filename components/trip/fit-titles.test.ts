import { describe, it, expect } from "vitest";
import { fitTitles } from "./fit-titles";

describe("fitTitles", () => {
  it("shows all titles when they fit, else as many as fit leaving room for +N", () => {
    expect(fitTitles(["Louvre", "Lunch"], 400).shown).toBe(2);
    expect(fitTitles(["A very long museum name", "Another long dinner name", "Third"], 200).shown).toBe(1);
    expect(fitTitles([], 300).shown).toBe(0);
    expect(fitTitles(["x"], 0).shown).toBe(1); // never hide the first title
  });
});
