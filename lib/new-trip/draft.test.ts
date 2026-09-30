import { describe, it, expect } from "vitest";
import {
  emptyDraft, draftReducer, validateStep, clampStep, toCreateInput, errorStep, stepErrorsFrom,
  whenLine, isDirty, serializeDraft, parseDraft, initDraft, MAX_STOPS, type Draft,
} from "./draft";

const TODAY = "2026-09-30";
const PORTLAND = { name: "Portland", region: "Oregon, United States", lat: 45.52, lng: -122.68, countryCode: "us" };
const BALI = { name: "Denpasar", region: "Bali, Indonesia", lat: -8.65, lng: 115.22, countryCode: "id" };
const named = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(false), name: "Kyoto", ...over });

describe("draftReducer", () => {
  it("caps the name at 120", () => {
    expect(draftReducer(emptyDraft(false), { type: "set-name", name: "x".repeat(200) }).name).toHaveLength(120);
  });
  it("pick-home sets the home and the currency from its country", () => {
    const d = draftReducer(named(), { type: "pick-home", place: PORTLAND });
    expect(d).toMatchObject({ homeName: "Portland", homePlace: PORTLAND, homeCurrency: "USD" });
  });
  it("pick-home in an unmapped country keeps the current currency", () => {
    expect(draftReducer(named({ homeCurrency: "GBP" }), { type: "pick-home", place: BALI }).homeCurrency).toBe("GBP");
  });
  it("typing after a pick forgets the picked place", () => {
    const picked = draftReducer(named(), { type: "pick-home", place: PORTLAND });
    const d = draftReducer(picked, { type: "set-home-text", text: "Portlan" });
    expect(d.homePlace).toBeUndefined();
    expect(d.homeName).toBe("Portlan");
  });
  it("refuses an unknown currency", () => {
    expect(draftReducer(named(), { type: "set-currency", code: "ZZZ" }).homeCurrency).toBe("AUD");
  });
  it("adds trimmed stops up to the cap and removes by index", () => {
    let d = named({ past: true });
    d = draftReducer(d, { type: "add-stop", stop: { name: "  Kyoto " } });
    d = draftReducer(d, { type: "add-stop", stop: { name: "   " } });
    d = draftReducer(d, { type: "add-stop", stop: { name: "Nara" } });
    expect(d.stops.map((s) => s.name)).toEqual(["Kyoto", "Nara"]);
    expect(draftReducer(d, { type: "remove-stop", index: 0 }).stops.map((s) => s.name)).toEqual(["Nara"]);
    const full = named({ stops: Array.from({ length: MAX_STOPS }, (_, i) => ({ name: `P${i}` })) });
    expect(draftReducer(full, { type: "add-stop", stop: { name: "One more" } }).stops).toHaveLength(MAX_STOPS);
  });
  it("past mode ignores a date-mode switch", () => {
    expect(draftReducer(emptyDraft(true), { type: "set-mode", mode: "rough" }).dateMode).toBe("exact");
  });
});

describe("validateStep", () => {
  it("step 1 needs a name", () => {
    expect(validateStep(emptyDraft(false), 1)).toEqual({ name: "Give it a name to keep going" });
    expect(validateStep(named(), 1)).toEqual({});
  });
  it("past mode needs both dates", () => {
    expect(validateStep(named({ past: true }), 2)).toEqual({ dates: "Add the dates you went" });
    expect(validateStep(named({ past: true, startDate: "2026-07-01", endDate: "2026-07-10" }), 2)).toEqual({});
  });
  it("normal mode: a start with no end asks for the end; nothing picked is fine", () => {
    expect(validateStep(named({ startDate: "2026-12-04" }), 2)).toEqual({ dates: "Pick the day you get back" });
    expect(validateStep(named(), 2)).toEqual({});
    expect(validateStep(named({ dateMode: "none", startDate: "2026-12-04" }), 2)).toEqual({});
  });
});

describe("clampStep / initDraft", () => {
  it("clamps a deep link past an unanswered required step", () => {
    expect(clampStep(emptyDraft(false), 3)).toBe(1);
    expect(clampStep(named({ past: true }), 4)).toBe(2);
    expect(clampStep(named(), 4)).toBe(4);
  });
  it("an initial name starts a fresh draft at the asked step", () => {
    const stored = named({ name: "Old", step: 3, homeCurrency: "JPY" });
    const d = initDraft({ past: false, initialName: " Japan in spring ", initialStep: 2, stored });
    expect(d).toMatchObject({ name: "Japan in spring", step: 2, homeCurrency: "AUD" });
  });
  it("restores a stored draft of the same mode, and ignores one of the other mode", () => {
    expect(initDraft({ past: false, stored: named({ step: 3 }) })).toMatchObject({ name: "Kyoto", step: 3 });
    expect(initDraft({ past: true, stored: named({ step: 3 }) })).toMatchObject({ name: "", step: 1, past: true });
  });
  it("clamps a stored or linked step too", () => {
    expect(initDraft({ past: false, initialStep: 3 }).step).toBe(1);
    expect(initDraft({ past: false, initialStep: 9, stored: named() }).step).toBe(1);
  });
});

describe("toCreateInput", () => {
  it("a name alone is the whole input", () => {
    expect(toCreateInput(named())).toEqual({ name: "Kyoto", homeCurrency: "AUD" });
  });
  it("exact dates are sent only when both are set", () => {
    expect(toCreateInput(named({ startDate: "2026-12-04", endDate: "2027-01-08" }))).toMatchObject({ startDate: "2026-12-04", endDate: "2027-01-08" });
    expect(toCreateInput(named({ startDate: "2026-12-04" }))).not.toHaveProperty("startDate");
  });
  it("roughly sends the month and never dates", () => {
    const d = named({ dateMode: "rough", roughMonth: "2027-04", startDate: "2026-12-04", endDate: "2026-12-08" });
    const input = toCreateInput(d);
    expect(input).toMatchObject({ roughMonth: "2027-04" });
    expect(input).not.toHaveProperty("startDate");
  });
  it("not sure sends neither", () => {
    const input = toCreateInput(named({ dateMode: "none", roughMonth: "2027-04", startDate: "2026-12-04", endDate: "2026-12-08" }));
    expect(input).not.toHaveProperty("roughMonth");
    expect(input).not.toHaveProperty("startDate");
  });
  it("a picked home sends its coordinates; a typed one only its name", () => {
    expect(toCreateInput(draftReducer(named(), { type: "pick-home", place: PORTLAND }))).toMatchObject({ homeName: "Portland", homeLat: 45.52, homeLng: -122.68, homeCountryCode: "us", homeCurrency: "USD" });
    const typed = toCreateInput(named({ homeName: "Somewhere" }));
    expect(typed).toMatchObject({ homeName: "Somewhere" });
    expect(typed).not.toHaveProperty("homeLat");
  });
  it("past mode sends stops and no home", () => {
    const d = named({ past: true, startDate: "2026-07-01", endDate: "2026-07-10", homeName: "Sydney", stops: [{ name: "Kyoto", lat: 35, lng: 135.7, countryCode: "jp" }, { name: "Nara" }] });
    const input = toCreateInput(d);
    expect(input.stops).toEqual([{ name: "Kyoto", lat: 35, lng: 135.7, countryCode: "jp" }, { name: "Nara" }]);
    expect(input).not.toHaveProperty("homeName");
  });
  it("threads fromShareToken", () => {
    expect(toCreateInput(named(), { fromShareToken: "tok" })).toMatchObject({ fromShareToken: "tok" });
  });
});

describe("server errors", () => {
  it("errorStep jumps to the earliest step with an error", () => {
    expect(errorStep({ homeName: ["x"], name: ["y"] })).toBe(1);
    expect(errorStep({ endDate: ["x"] })).toBe(2);
    expect(errorStep({ stops: ["x"] })).toBe(3);
    expect(errorStep({ _: ["x"] })).toBe(4);
  });
  it("stepErrorsFrom maps fields to the step's slot", () => {
    expect(stepErrorsFrom({ name: ["Trip name is required"], endDate: ["End date must be on or after the start date"], _: ["Oops"] }))
      .toEqual({ name: "Trip name is required", dates: "End date must be on or after the start date", form: "Oops" });
  });
});

describe("whenLine / isDirty", () => {
  it("reads exact dates like the review row", () => {
    expect(whenLine(named({ startDate: "2026-12-04", endDate: "2027-01-08" }), TODAY)).toBe("Fri 4 Dec – Fri 8 Jan · 35 nights");
  });
  it("reads a rough month", () => {
    expect(whenLine(named({ dateMode: "rough", roughMonth: "2027-04" }), TODAY)).toBe("Sometime in April");
  });
  it("is null with nothing to say", () => {
    expect(whenLine(named({ dateMode: "none" }), TODAY)).toBeNull();
  });
  it("any answer or a cover makes the draft dirty", () => {
    expect(isDirty(emptyDraft(false), false)).toBe(false);
    expect(isDirty(emptyDraft(false), true)).toBe(true);
    expect(isDirty(named(), false)).toBe(true);
  });
});

describe("persistence", () => {
  it("round-trips", () => {
    const d = draftReducer(named({ step: 3 }), { type: "pick-home", place: PORTLAND });
    expect(parseDraft(serializeDraft(d), false)).toEqual(d);
  });
  it("rejects junk", () => {
    expect(parseDraft("{nope", false)).toBeNull();
    expect(parseDraft(JSON.stringify({ name: 3 }), false)).toBeNull();
    expect(parseDraft(JSON.stringify({ ...named(), homeCurrency: "ZZZ" }), false)).toBeNull();
    expect(parseDraft(null, false)).toBeNull();
  });
});
