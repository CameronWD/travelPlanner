import { describe, expect, it } from "vitest";
import { transportClearable } from "./transport-clearable";

describe("transportClearable", () => {
  it("clears both points when neither end is Home", () => {
    expect(transportClearable({ depIsHome: false, arrIsHome: false })).toEqual(expect.arrayContaining(["depPlace", "arrPlace"]));
  });
  it("leaves a Home end's point out so a save keeps it", () => {
    const dep = transportClearable({ depIsHome: true, arrIsHome: false });
    expect(dep).not.toContain("depPlace");
    expect(dep).toContain("arrPlace");
    const arr = transportClearable({ depIsHome: false, arrIsHome: true });
    expect(arr).not.toContain("arrPlace");
    expect(arr).toContain("depPlace");
  });
});
