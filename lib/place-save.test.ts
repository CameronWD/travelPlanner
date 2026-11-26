import { describe, expect, it, vi } from "vitest";
import { placeForSave } from "./place-save";

const BKK = { lat: 13.69, lng: 100.75, countryCode: "th", region: null, placeId: "bkk-id" };

describe("placeForSave", () => {
  it("a case-or-whitespace-only change keeps the held place and looks nothing up", async () => {
    const lookUp = vi.fn();

    const saved = await placeForSave({ text: "  bangkok (bkk) ", pick: null, before: { text: "Bangkok (BKK)", place: BKK }, lookUp });

    expect(saved).toEqual({ place: BKK, source: "kept" });
    expect(lookUp).not.toHaveBeenCalled();
  });

  it("new text looks the place up again", async () => {
    const lookUp = vi.fn().mockResolvedValue({ lat: 1.36, lng: 103.99, placeId: "sin-id", countryCode: "SG" });

    const saved = await placeForSave({ text: "Singapore Changi", pick: null, before: { text: "Bangkok (BKK)", place: BKK }, lookUp });

    expect(saved.source).toBe("looked-up");
    expect(saved.place).toMatchObject({ lat: 1.36, lng: 103.99, countryCode: "sg" });
  });
});
