import { describe, expect, it } from "vitest";
import { parseResolveArgs } from "@/lib/feedback-resolve-args";

describe("parseResolveArgs", () => {
  it("marks a note done with a resolution", () => {
    expect(parseResolveArgs(["n1", "--note", "Fixed the drag handle"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: "Fixed the drag handle",
    });
  });

  it("accepts --note=value form", () => {
    expect(parseResolveArgs(["n1", "--note=Fixed it"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: "Fixed it",
    });
  });

  it("marks a note won't fix", () => {
    expect(
      parseResolveArgs(["n1", "--wontfix", "--note", "Out of scope"]),
    ).toEqual({ id: "n1", status: "WONTFIX", resolution: "Out of scope" });
  });

  it("allows closing without a resolution line", () => {
    expect(parseResolveArgs(["n1"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: null,
    });
  });

  it("errors when no id is given", () => {
    expect(parseResolveArgs([])).toEqual({
      error: expect.stringContaining("id"),
    });
  });

  it("errors when --note has no value", () => {
    expect(parseResolveArgs(["n1", "--note"])).toEqual({
      error: expect.stringContaining("--note"),
    });
  });

  it("errors on an unknown flag rather than silently ignoring it", () => {
    expect(parseResolveArgs(["n1", "--done"])).toEqual({
      error: expect.stringContaining("--done"),
    });
  });
});
