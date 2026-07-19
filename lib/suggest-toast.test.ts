import { describe, expect, it } from "vitest";
import { suggestResultToast } from "@/lib/suggest-toast";

describe("suggestResultToast", () => {
  it("returns a destructive toast on failure", () => {
    const result = suggestResultToast({
      success: false,
      errors: { _: ["Trip not found."] },
    });
    expect(result).toEqual({
      variant: "destructive",
      title: "Couldn't suggest chapters",
      description: "Trip not found.",
    });
  });

  it("falls back to generic description when no _ error is present", () => {
    const result = suggestResultToast({
      success: false,
      errors: { tripId: ["Invalid trip."] },
    });
    expect(result).toEqual({
      variant: "destructive",
      title: "Couldn't suggest chapters",
      description: "Something went wrong.",
    });
  });

  it("returns a 'nothing to group' toast when created is 0", () => {
    const result = suggestResultToast({ success: true, created: 0 });
    expect(result).toEqual({
      title: "Nothing to group",
      description:
        "Add stops with a resolvable country (or dates) first — anything already grouped is left alone.",
    });
  });

  it("uses singular 'chapter' when created is 1", () => {
    const result = suggestResultToast({ success: true, created: 1 });
    expect(result).toEqual({
      title: "Created 1 chapter",
      description: "Rename or redraw them any time.",
    });
  });

  it("uses plural 'chapters' when created is 2", () => {
    const result = suggestResultToast({ success: true, created: 2 });
    expect(result).toEqual({
      title: "Created 2 chapters",
      description: "Rename or redraw them any time.",
    });
  });
});
