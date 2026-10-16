import { describe, expect, it } from "vitest";
import { mergeStopPatch, LONE_DATE, NIGHTS_REQUIRED, TIMEZONE_ON_ROUGH } from "./stop-patch";

const rough = { name: "Rome", country: "Italy", countryCode: "it", lat: 41.9, lng: 12.5, notes: "old notes", nights: 2, arriveDate: null, departDate: null, timezone: null, chapterId: "chap-1" };
const scheduled = { ...rough, nights: null, arriveDate: "2026-05-01", departDate: "2026-05-04", timezone: "Europe/Rome", chapterId: null };

describe("mergeStopPatch", () => {
  it("on a rough Stop with only notes keeps chapterId, mode and the point", () => {
    expect(mergeStopPatch(rough, { notes: "new notes" })).toEqual({
      mode: "rough", name: "Rome", country: "Italy", countryCode: "it", lat: 41.9, lng: 12.5, notes: "new notes", nights: 2, chapterId: "chap-1",
    });
  });
  it("on a scheduled Stop with only name keeps dates, timezone and the point", () => {
    expect(mergeStopPatch(scheduled, { name: "New name" })).toMatchObject({
      mode: "scheduled", name: "New name", arriveDate: "2026-05-01", departDate: "2026-05-04", timezone: "Europe/Rome", lat: 41.9, countryCode: "it",
    });
  });
  it("switches a scheduled Stop to rough when nights is given with no dates", () => {
    expect(mergeStopPatch(scheduled, { nights: 5 })).toMatchObject({ mode: "rough", nights: 5 });
  });
  it("switches a rough Stop to scheduled when both dates are given, the zone from the country", () => {
    expect(mergeStopPatch(rough, { arriveDate: "2026-06-01", departDate: "2026-06-03" })).toMatchObject({ mode: "scheduled", arriveDate: "2026-06-01", departDate: "2026-06-03", timezone: "Europe/Rome" });
  });
  it("a rough patch with no nights anywhere is refused", () => {
    expect(mergeStopPatch({ ...rough, nights: null }, { notes: "x" })).toEqual(NIGHTS_REQUIRED);
  });
  it("a lone date on a rough Stop is refused; on a scheduled Stop it merges with the other", () => {
    expect(mergeStopPatch(rough, { arriveDate: "2026-06-01" })).toEqual(LONE_DATE);
    expect(mergeStopPatch(rough, { departDate: "2026-06-03" })).toEqual(LONE_DATE);
    expect(mergeStopPatch(scheduled, { arriveDate: "2026-04-30" })).toMatchObject({ arriveDate: "2026-04-30", departDate: "2026-05-04" });
    expect(mergeStopPatch(scheduled, { departDate: "2026-05-06" })).toMatchObject({ arriveDate: "2026-05-01", departDate: "2026-05-06" });
  });
  it("a timezone on a Stop that ends up rough is refused (rough, or made rough by nights)", () => {
    expect(mergeStopPatch(rough, { timezone: "Europe/Rome" })).toEqual(TIMEZONE_ON_ROUGH);
    expect(mergeStopPatch(scheduled, { nights: 3, timezone: "Europe/Rome" })).toEqual(TIMEZONE_ON_ROUGH);
  });
  it("nights that disagree with both supplied dates are refused; agreeing ones accepted", () => {
    expect(mergeStopPatch(scheduled, { arriveDate: "2026-06-01", departDate: "2026-06-03", nights: 5 })).toMatchObject({ success: false, errors: { nights: [expect.stringMatching(/cover 2 nights/)] } });
    expect(mergeStopPatch(scheduled, { arriveDate: "2026-06-01", departDate: "2026-06-03", nights: 2 })).toMatchObject({ mode: "scheduled" });
  });
  // Place (deviation 4) and the form's full input:
  it("a patch that says where (country) drops the row's point so the save re-geocodes", () => {
    const m = mergeStopPatch(scheduled, { country: "France" });
    expect(m).toMatchObject({ country: "France" });
    expect(m).not.toHaveProperty("lat");
    expect(m).not.toHaveProperty("countryCode");
  });
  it("the form's rough save with No chapter and emptied notes clears both", () => {
    const m = mergeStopPatch(rough, { mode: "rough", name: "Rome", country: "Italy", nights: 2, chapterId: null, notes: null });
    expect(m).toMatchObject({ mode: "rough", nights: 2 });
    expect(m).not.toHaveProperty("chapterId");
    expect(m).not.toHaveProperty("notes");
  });
  it("the form's scheduled save is taken whole", () => {
    expect(mergeStopPatch(rough, { mode: "scheduled", name: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77, countryCode: "jp", timezone: "Asia/Tokyo", arriveDate: "2026-12-22", departDate: "2026-12-24", notes: null }))
      .toEqual({ mode: "scheduled", name: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77, countryCode: "jp", timezone: "Asia/Tokyo", arriveDate: "2026-12-22", departDate: "2026-12-24" });
  });
  it("a countryCode-only patch says where: the row's lat/lng go, the sent code stays", () => {
    const m = mergeStopPatch(rough, { countryCode: "fr" });
    expect(m).toMatchObject({ mode: "rough", countryCode: "fr", country: "Italy" });
    expect(m).not.toHaveProperty("lat");
    expect(m).not.toHaveProperty("lng");
  });
  it("an explicit country: null clears the country and drops the row's point", () => {
    const m = mergeStopPatch(scheduled, { country: null });
    expect(m).toMatchObject({ mode: "scheduled", name: "Rome", timezone: "Europe/Rome" });
    expect((m as { country?: string }).country).toBeUndefined();
    expect(m).not.toHaveProperty("lat");
    expect(m).not.toHaveProperty("countryCode");
  });
  it("nights alone on a rough Stop re-nights it and keeps the chapter and the point", () => {
    expect(mergeStopPatch(rough, { nights: 4 })).toEqual({
      mode: "rough", name: "Rome", country: "Italy", countryCode: "it", lat: 41.9, lng: 12.5, notes: "old notes", nights: 4, chapterId: "chap-1",
    });
  });
});
