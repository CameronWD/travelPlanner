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
});
