import { describe, expect, it } from "vitest";
import { backgroundImageIsIgnorable } from "./contrast-audit";

describe("backgroundImageIsIgnorable (W17: underline and dot-pattern backgrounds)", () => {
  it("treats a linear-gradient of two identical stops as a text underline", () => {
    expect(backgroundImageIsIgnorable("linear-gradient(rgb(29, 29, 27), rgb(29, 29, 27))", "auto", "rgb(29, 29, 27)")).toBe("underline");
    expect(backgroundImageIsIgnorable("linear-gradient(currentColor, currentColor)", "auto", "rgb(29, 29, 27)")).toBe("underline");
    expect(backgroundImageIsIgnorable("linear-gradient(rgb(29, 29, 27), rgb(255, 255, 255))", "auto", "rgb(29, 29, 27)")).toBeNull();
  });
  it("treats a small radial-gradient dot pattern as its base colour", () => {
    expect(backgroundImageIsIgnorable("radial-gradient(rgb(230, 225, 215) 1.5px, rgba(0, 0, 0, 0) 1.5px)", "22px 22px", "rgb(29, 29, 27)")).toBe("dots");
    expect(backgroundImageIsIgnorable("radial-gradient(rgb(230, 225, 215) 1.5px, rgba(0, 0, 0, 0) 1.5px)", "200px 200px", "rgb(29, 29, 27)")).toBeNull();
    expect(backgroundImageIsIgnorable("url(photo.jpg)", "cover", "rgb(29, 29, 27)")).toBeNull();
    expect(backgroundImageIsIgnorable("none", "auto", "rgb(29, 29, 27)")).toBeNull();
  });
  it("requires exactly one background layer for the dot-pattern rule (fix round 1)", () => {
    // Single layer -- control case, still "dots".
    expect(
      backgroundImageIsIgnorable("radial-gradient(rgb(230, 225, 215) 1.5px, transparent 1.5px)", "22px 22px", "rgb(29, 29, 27)"),
    ).toBe("dots");
    // A second, genuinely unmeasurable layer (an unrelated image) stacked
    // behind the dot pattern must NOT be classified "dots" -- that would
    // silently composite against the node's background-color and hide the
    // real unmeasurable layer behind it.
    expect(
      backgroundImageIsIgnorable(
        "radial-gradient(rgb(230, 225, 215) 1.5px, transparent 1.5px), url(photo.jpg)",
        "22px 22px, 400px 400px",
        "rgb(29, 29, 27)",
      ),
    ).toBeNull();
  });
});
