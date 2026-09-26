import { describe, expect, it } from "vitest";
import { siteMismatchWarning } from "./feedback-resolve-site";

describe("siteMismatchWarning", () => {
  it("warns when the note's site differs from the site being resolved for", () => {
    expect(siteMismatchWarning("beta", "main")).toBe(
      "Warning: this note was written on Beta, but you're resolving for Main. Resolving anyway.",
    );
  });

  it("treats a note with no site as main", () => {
    expect(siteMismatchWarning(null, "main")).toBeNull();
    expect(siteMismatchWarning(null, "beta")).toContain("written on Main");
  });

  it("says nothing without --site", () => {
    expect(siteMismatchWarning("beta", null)).toBeNull();
  });
});
