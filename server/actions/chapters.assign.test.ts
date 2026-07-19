import { describe, it, expect } from "vitest";

import { canAssignToChapter } from "@/lib/chapters";

describe("canAssignToChapter", () => {
  it("allows rough stops", () => expect(canAssignToChapter({ arriveDate: null })).toBe(true));
  it("blocks dated stops", () => expect(canAssignToChapter({ arriveDate: "2026-07-03" })).toBe(false));
});
