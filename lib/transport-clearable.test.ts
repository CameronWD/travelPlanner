import { describe, expect, it } from "vitest";
import { transportClearable } from "./transport-clearable";
import { TRANSPORT_DETAIL_KEYS } from "./transport-details";
import { toPatch } from "./patch";
import type { TransportInput } from "@/lib/validations/transport";

describe("transportClearable", () => {
  it("lists every Travel detail, so a form that leaves one empty clears it (toPatch only nulls an absent key; a filled one stays)", () => {
    const list = transportClearable({ depIsHome: false, arrIsHome: false });
    expect(list).toEqual(expect.arrayContaining([...TRANSPORT_DETAIL_KEYS]));
    const patch = toPatch({ mode: "TRAIN", gate: "B14" } as TransportInput, list);
    expect(patch.seat).toBeNull();
    expect(patch.gate).toBe("B14");
  });
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
