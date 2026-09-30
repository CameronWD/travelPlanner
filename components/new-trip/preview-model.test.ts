import { describe, it, expect } from "vitest";
import { previewModel, type PreviewInput } from "./preview-model";

const base: PreviewInput = { past: false, step: 1, name: "Japan at Christmas", dateMode: "exact", today: "2026-09-28" };

describe("previewModel (NEW_TRIP.md §7 table)", () => {
  it("name only: NEW TRIP, skeleton bottom, stamp with — — —", () => {
    const m = previewModel(base);
    expect(m.pill).toEqual({ kind: "up-next", label: "NEW TRIP" });
    expect(m.bottom).toEqual({ kind: "skeleton" });
    // stampPlace({ stops: [], name, size: "hero" }) with no stops just returns the name verbatim.
    expect(m.stamp).toEqual({ place: "Japan at Christmas", startDate: null, dateLabel: "— — —" });
    expect(m.dateLine).toBeNull();
    expect(m.caption).toBe("Fills in as you answer");
  });
  it("an empty name shows the Your trip placeholder, and the stamp falls back to TRIP", () => {
    const m = previewModel({ ...base, name: "  " });
    expect(m).toMatchObject({ title: "Your trip", placeholder: true });
    expect(m.stamp.place).toBe("TRIP");
  });
  it("exact dates: UP NEXT, the range, the sleeps and the stamp date", () => {
    const m = previewModel({ ...base, step: 2, startDate: "2026-12-04", endDate: "2027-01-08" });
    expect(m.pill.label).toBe("UP NEXT");
    expect(m.dateLine).toBe("4 Dec – 8 Jan");
    expect(m.bottom).toEqual({ kind: "big", big: { value: "67", unit: ["sleeps", "to go"] } });
    expect(m.stamp).toMatchObject({ startDate: "2026-12-04", dateLabel: "04 DEC 26" });
    expect(m.caption).toBe("Dates start the countdown and date the stamp");
  });
  it("a rough month: UP NEXT, Sometime in April, stamp APR 27", () => {
    const m = previewModel({ ...base, dateMode: "rough", roughMonth: "2027-04" });
    expect(m.pill.label).toBe("UP NEXT");
    expect(m.bottom).toEqual({ kind: "rough", month: "April" });
    expect(m.stamp.dateLabel).toBe("APR 27");
  });
  it("step 4 adds the first-stop chip and reads Ready to go", () => {
    const m = previewModel({ ...base, step: 4 });
    expect(m.chip).toBe(true);
    expect(m.caption).toBe("Ready to go");
  });
  it("past mode with dates reads as a Done card with nights away, and no chip", () => {
    const m = previewModel({ ...base, past: true, step: 4, startDate: "2026-07-01", endDate: "2026-07-10" });
    expect(m.pill).toEqual({ kind: "done", label: "DONE" });
    expect(m.bottom).toEqual({ kind: "big", big: { value: "9", unit: ["nights", "away"] } });
    expect(m.chip).toBe(false);
  });
  it("reads the stamp from the debounced name when given (MOTION N5)", () => {
    // stampPlace with no Stops echoes the name it is given, so the stamp lags the title.
    expect(previewModel({ ...base, name: "Japan at Christmas", stampName: "Jap" }).stamp.place).toBe("Jap");
    expect(previewModel({ ...base, name: "Japan at Christmas", stampName: "Jap" }).title).toBe("Japan at Christmas");
    expect(previewModel({ ...base, name: "Kyoto", stampName: " " }).stamp.place).toBe("TRIP");
  });
});
