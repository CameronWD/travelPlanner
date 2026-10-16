import { describe, expect, it } from "vitest";
import {
  aboutCount, aboutFromPick, aboutPickValue, replaceAbout,
  reminderAboutLabel, reminderTransportLabel, toReminderItem,
} from "./reminder-about";

const leg = (o: Partial<Parameters<typeof reminderTransportLabel>[0]> = {}) => ({
  mode: "TRAIN", depPlace: null, arrPlace: null, depIsHome: false, arrIsHome: false,
  fromStop: null, toStop: null, trip: { homeName: null }, ...o,
});

describe("aboutCount", () => {
  it("counts only the set about ids", () => {
    expect(aboutCount({})).toBe(0);
    expect(aboutCount({ stopId: "s", itemId: null, transportId: undefined })).toBe(1);
    expect(aboutCount({ stopId: "s", itemId: "i" })).toBe(2);
    expect(aboutCount({ stopId: "" })).toBe(0);
  });
});

describe("replaceAbout", () => {
  it("a patch naming no about key is returned unchanged", () => {
    const p = { title: "x" };
    expect(replaceAbout(p)).toBe(p);
  });
  it("naming one about key clears the other two", () => {
    expect(replaceAbout({ title: "x", itemId: "i1" })).toEqual({ title: "x", itemId: "i1", stopId: null, transportId: null });
  });
  it("a null on one key clears all three (about the Trip as a whole)", () => {
    expect(replaceAbout({ stopId: null })).toEqual({ stopId: null, itemId: null, transportId: null });
  });
});

describe("aboutFromPick / aboutPickValue", () => {
  it("round-trips each kind", () => {
    expect(aboutFromPick(aboutPickValue({ stopId: "s1" }))).toEqual({ stopId: "s1" });
    expect(aboutFromPick(aboutPickValue({ itemId: "i1" }))).toEqual({ itemId: "i1" });
    expect(aboutFromPick(aboutPickValue({ transportId: "t1" }))).toEqual({ transportId: "t1" });
  });
  it("the empty pick and anything unknown mean about the Trip as a whole", () => {
    expect(aboutFromPick("")).toEqual({});
    expect(aboutFromPick("chapter:c1")).toEqual({});
    expect(aboutFromPick("stop:")).toEqual({});
  });
});

describe("reminderTransportLabel", () => {
  it("names the mode and both ends, Stops before typed places", () => {
    expect(reminderTransportLabel(leg({ fromStop: { name: "Paris" }, depPlace: "Paris Gare de Lyon", arrPlace: "Lyon Part-Dieu" }))).toBe("Train Paris → Lyon Part-Dieu");
  });
  it("a Home end is the Home base's name, or 'home'", () => {
    expect(reminderTransportLabel(leg({ mode: "FLIGHT", depIsHome: true, trip: { homeName: "Brisbane" }, toStop: { name: "Rome" } }))).toBe("Flight Brisbane → Rome");
    expect(reminderTransportLabel(leg({ mode: "FLIGHT", arrIsHome: true, fromStop: { name: "Rome" } }))).toBe("Flight Rome → home");
  });
  it("with an end missing it is the mode alone; an unknown mode reads Transport", () => {
    expect(reminderTransportLabel(leg({ fromStop: { name: "Paris" } }))).toBe("Train");
    expect(reminderTransportLabel(leg({ mode: "HOVERCRAFT" }))).toBe("Transport");
  });
});

describe("toReminderItem / reminderAboutLabel", () => {
  const base = { id: "r1", title: "T", date: "2027-01-01", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: null, transport: null };
  it("a Reminder about the Trip as a whole has every about field null and no label", () => {
    const r = toReminderItem(base);
    expect(r).toEqual({ id: "r1", title: "T", date: "2027-01-01", notes: null, stopId: null, stopName: null, itemId: null, itemTitle: null, transportId: null, transportLabel: null });
    expect(reminderAboutLabel(r)).toBeNull();
  });
  it("maps a Stop, an Item and a leg to their names", () => {
    expect(reminderAboutLabel(toReminderItem({ ...base, stopId: "s", stop: { name: "Lyon" } }))).toBe("Lyon");
    expect(toReminderItem({ ...base, itemId: "i", item: { title: "Bouchon" }, notes: "8pm" })).toMatchObject({ itemTitle: "Bouchon", notes: "8pm" });
    expect(toReminderItem({ ...base, transportId: "t", transport: leg({ depPlace: "Paris", arrPlace: "Lyon" }) }).transportLabel).toBe("Train Paris → Lyon");
  });
});
