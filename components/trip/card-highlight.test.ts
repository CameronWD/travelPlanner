import { describe, expect, it } from "vitest";
import { HIGHLIGHT_CLASS, highlightAttrs } from "./card-highlight";

describe("highlightAttrs", () => {
  it("marks a highlighted field and keeps the element's own classes", () => {
    expect(highlightAttrs(["depAt"], "depAt", "font-mono")).toEqual({ className: `font-mono ${HIGHLIGHT_CLASS}`, "data-highlight": "depAt" });
  });
  it("matches any of several fields, naming the first that is highlighted", () => {
    expect(highlightAttrs(["checkOut"], ["checkIn", "checkOut"])["data-highlight"]).toBe("checkOut");
  });
  it("leaves an unhighlighted element alone", () => {
    expect(highlightAttrs(undefined, "name", "truncate")).toEqual({ className: "truncate" });
    expect(highlightAttrs([], "name")).toEqual({ className: undefined });
  });
});
