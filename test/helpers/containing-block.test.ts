// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { nearestPositionedAncestor } from "./containing-block";

describe("nearestPositionedAncestor", () => {
  it("finds the closest ancestor with a bare position utility", () => {
    document.body.innerHTML =
      '<div id="far" class="fixed"><div id="near" class="relative flex"><span><input id="x" class="sr-only" /></span></div></div>';
    expect(nearestPositionedAncestor(document.getElementById("x")!)?.id).toBe("near");
  });

  it("ignores breakpoint-prefixed utilities, which are not positioned at every width", () => {
    document.body.innerHTML = '<div id="far" class="fixed"><div class="sm:relative"><input id="x" /></div></div>';
    expect(nearestPositionedAncestor(document.getElementById("x")!)?.id).toBe("far");
  });

  it("returns null when nothing above is positioned", () => {
    document.body.innerHTML = '<div><input id="x" /></div>';
    expect(nearestPositionedAncestor(document.getElementById("x")!)).toBeNull();
  });
});
