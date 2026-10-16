import { describe, expect, it } from "vitest";
import { mergeTransportPatch, type TransportPatchRow } from "./transport-patch";

const row: TransportPatchRow = {
  mode: "TRAIN", fromStopId: "stop-a", toStopId: "stop-b", anchorStopId: "stop-a", depIsHome: false, arrIsHome: false,
  depPlace: "Roma Termini", arrPlace: null, depAt: new Date("2026-05-04T08:00:00Z"), arrAt: new Date("2026-05-04T11:00:00Z"),
  reference: "FR 9512", notes: null,
};
const homeDep: TransportPatchRow = { ...row, fromStopId: null, depPlace: null, depIsHome: true };
const at = (overrides: Partial<TransportPatchRow>): TransportPatchRow => ({ ...row, ...overrides });

describe("mergeTransportPatch", () => {
  it("with only reference keeps every other field, including stop ids, home flags and times", () => {
    expect(mergeTransportPatch(row, { reference: "FR 9514" })).toEqual({
      mode: "TRAIN", fromStopId: "stop-a", toStopId: "stop-b", anchorStopId: "stop-a", depIsHome: false, arrIsHome: false,
      depPlace: "Roma Termini", arrPlace: undefined, depAt: row.depAt, arrAt: row.arrAt, reference: "FR 9514", notes: undefined,
    });
  });
  it("keeps depIsHome true when the patch doesn't mention it", () => {
    expect(mergeTransportPatch(homeDep, { notes: "x" })).toMatchObject({ depIsHome: true, fromStopId: undefined });
  });
  it("the form's whole end (stop + null point + not home) replaces the end", () => {
    expect(mergeTransportPatch(row, { fromStopId: "stop-c", depPlace: null, depIsHome: false })).toMatchObject({ fromStopId: "stop-c", depPlace: undefined, depIsHome: false });
  });
  it("the form's Home end (nulls + home) is Home, not a contradiction", () => {
    expect(mergeTransportPatch(row, { fromStopId: null, depPlace: null, depIsHome: true })).toMatchObject({ depIsHome: true, fromStopId: undefined, depPlace: undefined });
  });
  it("the form's 'none' end (nulls, not home) saves an end with neither (the app allows it)", () => {
    expect(mergeTransportPatch(row, { fromStopId: null, depPlace: null, depIsHome: false })).toMatchObject({ fromStopId: undefined, depPlace: undefined, depIsHome: false });
  });
  it("depIsHome true together with a non-empty fromStopId is refused", () => {
    expect(mergeTransportPatch(row, { depIsHome: true, fromStopId: "stop-c" })).toMatchObject({ success: false, errors: { depIsHome: [expect.any(String)] } });
  });
  it("explicit null clears the reference", () => {
    expect(mergeTransportPatch(row, { reference: null })).toMatchObject({ reference: undefined });
  });

  // Ported from update_transport's tool tests (lib/mcp/tools/bookings-write.test.ts).
  it("forwards depIsHome (true) when the patch doesn't mention it, instead of resetting it false", () => {
    expect(mergeTransportPatch(homeDep, { reference: "NEW-REF" })).toEqual(expect.objectContaining({ depIsHome: true }));
  });
  it("setting fromStopId on a currently-Home departure clears depIsHome and depPlace", () => {
    expect(mergeTransportPatch(homeDep, { fromStopId: "stop-new" })).toEqual(expect.objectContaining({ fromStopId: "stop-new", depIsHome: false, depPlace: undefined }));
  });
  it("depPlace alone on a Stop departure keeps the Stop", () => {
    expect(mergeTransportPatch(row, { depPlace: "The station" })).toEqual(expect.objectContaining({ depPlace: "The station", fromStopId: "stop-a", depIsHome: false }));
  });
  it("depPlace alone on a Home departure sets a point with no Stop", () => {
    expect(mergeTransportPatch(homeDep, { depPlace: "Gare du Nord" })).toEqual(expect.objectContaining({ fromStopId: undefined, depPlace: "Gare du Nord", depIsHome: false }));
  });
  it("fromStopId \"\" together with depPlace sets a point alone, no Stop", () => {
    expect(mergeTransportPatch(at({ depPlace: null }), { fromStopId: "", depPlace: "Gare du Nord" })).toEqual(expect.objectContaining({ fromStopId: undefined, depPlace: "Gare du Nord", depIsHome: false }));
  });
  it("fromStopId \"\" alone with no current place is refused", () => {
    expect(mergeTransportPatch(at({ depPlace: null }), { fromStopId: "" })).toMatchObject({ success: false, errors: { fromStopId: ["Departure needs a stop or a place."] } });
  });
  it("depPlace \"\" alone on a Home departure leaves it Home, unchanged", () => {
    expect(mergeTransportPatch(homeDep, { depPlace: "" })).toEqual(expect.objectContaining({ fromStopId: undefined, depPlace: undefined, depIsHome: true }));
  });
  it("depPlace \"\" alone on a point-alone departure is refused, not a silent neither", () => {
    expect(mergeTransportPatch(at({ fromStopId: null, depPlace: "Gare du Nord" }), { depPlace: "" })).toMatchObject({ success: false, errors: { fromStopId: ["Departure needs a stop or a place."] } });
  });
  it("fromStopId \"\" alone unlinks the Stop and keeps the current place", () => {
    expect(mergeTransportPatch(at({ depPlace: "Gare du Nord" }), { fromStopId: "" })).toEqual(expect.objectContaining({ fromStopId: undefined, depPlace: "Gare du Nord", depIsHome: false }));
  });
  it("fromStopId and depPlace together set both the Stop and its point", () => {
    expect(mergeTransportPatch(row, { fromStopId: "stop-new", depPlace: "Gare du Nord" })).toEqual(expect.objectContaining({ fromStopId: "stop-new", depPlace: "Gare du Nord", depIsHome: false }));
  });
  it("fromStopId with depPlace \"\" links the new Stop with no point", () => {
    expect(mergeTransportPatch(row, { fromStopId: "stop-new", depPlace: "" })).toEqual(expect.objectContaining({ fromStopId: "stop-new", depPlace: undefined, depIsHome: false }));
  });
  it("fromStopId equal to the current Stop keeps the current point", () => {
    expect(mergeTransportPatch(at({ depPlace: "Gare du Nord" }), { fromStopId: "stop-a" })).toEqual(expect.objectContaining({ fromStopId: "stop-a", depPlace: "Gare du Nord", depIsHome: false }));
  });
  it("fromStopId to a different Stop clears a stale point", () => {
    expect(mergeTransportPatch(at({ depPlace: "Gare du Nord" }), { fromStopId: "stop-new" })).toEqual(expect.objectContaining({ fromStopId: "stop-new", depPlace: undefined, depIsHome: false }));
  });
  it("setting depIsHome true alone clears fromStopId/depPlace", () => {
    expect(mergeTransportPatch(row, { depIsHome: true })).toEqual(expect.objectContaining({ depIsHome: true, fromStopId: undefined, depPlace: undefined }));
  });
  it("depIsHome true together with fromStopId in the same patch is refused", () => {
    expect(mergeTransportPatch(row, { depIsHome: true, fromStopId: "stop-new" })).toMatchObject({ success: false, errors: { depIsHome: [expect.any(String)] } });
  });
  it("un-homing an endpoint with no stop/place to fall back on is refused", () => {
    expect(mergeTransportPatch(homeDep, { depIsHome: false })).toMatchObject({ success: false, errors: { fromStopId: [expect.any(String)] } });
  });

  it("the arrival end follows the same rules (toStopId \"\" alone with no point is refused on toStopId)", () => {
    expect(mergeTransportPatch(row, { toStopId: "" })).toMatchObject({ success: false, errors: { toStopId: ["Arrival needs a stop or a place."] } });
  });
  it("arrIsHome true together with a non-empty arrPlace is refused; with an empty one it is Home (deviation 5)", () => {
    expect(mergeTransportPatch(row, { arrIsHome: true, arrPlace: "Gare du Nord" })).toMatchObject({ success: false, errors: { arrIsHome: [expect.any(String)] } });
    expect(mergeTransportPatch(row, { arrIsHome: true, arrPlace: "", toStopId: "" })).toMatchObject({ arrIsHome: true, toStopId: undefined, arrPlace: undefined });
  });
  it("a patch's time replaces the row's instant; null clears it", () => {
    expect(mergeTransportPatch(row, { depAt: "2026-05-04T09:00", arrAt: null })).toMatchObject({ depAt: "2026-05-04T09:00", arrAt: undefined });
  });
});
