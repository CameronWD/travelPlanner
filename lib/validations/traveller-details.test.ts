import { describe, expect, it } from "vitest";
import { travellerDetailsSchema, travelNumberSchema } from "./traveller-details";

describe("travellerDetailsSchema", () => {
  it("trims, and turns empty strings into null", () => {
    expect(travellerDetailsSchema.parse({ mobile: " +61 400 000 000 ", emergencyName: "", emergencyPhone: undefined, bankDetails: "  " })).toEqual({
      mobile: "+61 400 000 000",
      emergencyName: null,
      emergencyPhone: null,
      bankDetails: null,
    });
  });

  it("caps each field", () => {
    expect(travellerDetailsSchema.safeParse({ mobile: "1".repeat(41) }).success).toBe(false);
    expect(travellerDetailsSchema.safeParse({ emergencyName: "n".repeat(81) }).success).toBe(false);
    expect(travellerDetailsSchema.safeParse({ emergencyPhone: "1".repeat(41) }).success).toBe(false);
    expect(travellerDetailsSchema.safeParse({ bankDetails: "b".repeat(501) }).success).toBe(false);
    expect(travellerDetailsSchema.safeParse({}).success).toBe(true);
  });
});

describe("travelNumberSchema", () => {
  it("trims and caps at 40", () => {
    expect(travelNumberSchema.parse("  +39 333 1234567 ")).toBe("+39 333 1234567");
    expect(travelNumberSchema.safeParse("1".repeat(41)).success).toBe(false);
    expect(travelNumberSchema.parse("")).toBe("");
  });
});
