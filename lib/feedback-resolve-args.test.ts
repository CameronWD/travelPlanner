import { describe, expect, it } from "vitest";
import { parseResolveArgs } from "@/lib/feedback-resolve-args";

describe("parseResolveArgs", () => {
  it("marks a Feedback note done with a resolution", () => {
    expect(parseResolveArgs(["n1", "--note", "Fixed the drag handle"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: "Fixed the drag handle",
      dryRun: false,
    });
  });

  it("accepts --note=value form", () => {
    expect(parseResolveArgs(["n1", "--note=Fixed it"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: "Fixed it",
      dryRun: false,
    });
  });

  it("marks a Feedback note won't fix", () => {
    expect(
      parseResolveArgs(["n1", "--wontfix", "--note", "Out of scope"]),
    ).toEqual({
      id: "n1",
      status: "WONTFIX",
      resolution: "Out of scope",
      dryRun: false,
    });
  });

  it("allows closing without a resolution line", () => {
    expect(parseResolveArgs(["n1"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: null,
      dryRun: false,
    });
  });

  it("recognises --dry-run", () => {
    expect(parseResolveArgs(["n1", "--note", "Fixed it", "--dry-run"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: "Fixed it",
      dryRun: true,
    });
  });

  it("recognises --dry-run before the id", () => {
    expect(parseResolveArgs(["--dry-run", "n1"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: null,
      dryRun: true,
    });
  });

  it("combines --dry-run with --wontfix", () => {
    expect(parseResolveArgs(["n1", "--wontfix", "--dry-run"])).toEqual({
      id: "n1",
      status: "WONTFIX",
      resolution: null,
      dryRun: true,
    });
  });

  it("does not treat --dry-run as the value of --note", () => {
    expect(parseResolveArgs(["n1", "--note", "--dry-run"])).toEqual({
      error: expect.stringContaining("--note"),
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

  it("errors when --note is immediately followed by another flag", () => {
    expect(parseResolveArgs(["n1", "--note", "--wontfix"])).toEqual({
      error: expect.stringContaining("--note"),
    });
  });

  it("errors on a second positional argument", () => {
    expect(parseResolveArgs(["n1", "n2"])).toEqual({
      error: expect.stringContaining("n2"),
    });
  });

  it("rejects a wrong-case flag as unknown rather than silently ignoring it", () => {
    expect(parseResolveArgs(["n1", "--Note", "x"])).toEqual({
      error: expect.stringContaining("--Note"),
    });
  });
});
