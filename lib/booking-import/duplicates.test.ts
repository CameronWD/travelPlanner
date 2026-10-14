import { describe, expect, it } from "vitest";
import { findDuplicate, normaliseRef, NO_EXISTING, type ExistingBookings } from "./duplicates";

const EXISTING: ExistingBookings = {
  transports: [{ id: "t-out", mode: "FLIGHT", reference: "qx7 p2m", depLocalDate: "2026-12-01", label: "Flight QX7P2M" }],
  accommodations: [{ id: "a-1", confirmation: "CDR-55821", label: "Casa do Rio Lisboa" }],
  items: [{ id: "i-1", booking: "pena 1", label: "Pena Palace entry" }],
};

describe("findDuplicate", () => {
  it("normalises references by case and spaces", () => {
    expect(normaliseRef(" QX7 p2M ")).toBe("qx7p2m");
  });

  it("a Transport needs the same reference, mode and local departure date", () => {
    expect(findDuplicate({ kind: "transport", reference: "QX7P2M", mode: "FLIGHT", date: "2026-12-01" }, EXISTING)).toEqual({ kind: "transport", id: "t-out", label: "Flight QX7P2M" });
    expect(findDuplicate({ kind: "transport", reference: "QX7P2M", mode: "FLIGHT", date: "2026-12-15" }, EXISTING)).toBeNull();
    expect(findDuplicate({ kind: "transport", reference: "QX7P2M", mode: "TRAIN", date: "2026-12-01" }, EXISTING)).toBeNull();
    expect(findDuplicate({ kind: "transport", reference: undefined, mode: "FLIGHT", date: "2026-12-01" }, EXISTING)).toBeNull();
  });

  it("Accommodation by confirmation, Item by booking reference", () => {
    expect(findDuplicate({ kind: "accommodation", confirmation: "cdr-55821" }, EXISTING)).toEqual({ kind: "accommodation", id: "a-1", label: "Casa do Rio Lisboa" });
    expect(findDuplicate({ kind: "item", booking: "PENA1" }, EXISTING)).toEqual({ kind: "item", id: "i-1", label: "Pena Palace entry" });
    expect(findDuplicate({ kind: "item", booking: "PENA1" }, NO_EXISTING)).toBeNull();
  });
});
