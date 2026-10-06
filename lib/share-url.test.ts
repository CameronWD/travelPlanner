import { describe, it, expect } from "vitest";
import { shareUrl } from "./share-url";

describe("shareUrl", () => {
  it("is the absolute /share/<token> URL in the browser", () => {
    expect(shareUrl("tok-1")).toBe(`${window.location.origin}/share/tok-1`);
  });
});
