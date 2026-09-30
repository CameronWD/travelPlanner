import { describe, it, expect } from "vitest";
import { filesMeta, activityMeta, comparePlansMeta } from "./page-meta";

describe("page meta lines (AUDIT.md §2)", () => {
  it("files", () => {
    expect(filesMeta(0)).toBeNull();
    expect(filesMeta(1)).toBe("1 file");
    expect(filesMeta(3)).toBe("3 files");
  });
  it("activity says when it is showing only the last 100", () => {
    expect(activityMeta(0)).toBe("No changes yet");
    expect(activityMeta(1)).toBe("1 change");
    expect(activityMeta(42)).toBe("42 changes");
    expect(activityMeta(100)).toBe("Last 100 changes");
  });
  it("compare counts plans, real plan included", () => {
    expect(comparePlansMeta(1)).toBeNull();
    expect(comparePlansMeta(3)).toBe("3 plans");
  });
});
