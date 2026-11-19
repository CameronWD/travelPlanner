import { describe, it, expect } from "vitest";
import { ROW_FIGURE_CLASS, ROW_NAME_CLASS } from "./row-text";

describe("row text classes", () => {
  it("clamps a name to two lines", () => {
    expect(ROW_NAME_CLASS).toBe("min-w-0 flex-1 line-clamp-2 break-words");
  });
  it("keeps a figure on one line", () => {
    expect(ROW_FIGURE_CLASS).toBe("shrink-0 whitespace-nowrap tabular-nums");
  });
});
