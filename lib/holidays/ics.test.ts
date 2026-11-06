import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHolidayIcs } from "./ics";

function load(name: string) {
  return parseHolidayIcs(readFileSync(join(__dirname, "__fixtures__", `${name}.ics`), "utf8"));
}

describe("parseHolidayIcs", () => {
  it("reads a regional public holiday with its unescaped Regions", () => {
    expect(load("german").find((h) => h.name.startsWith("Epiphany"))).toEqual({
      date: "2026-01-06",
      name: "Epiphany (regional holiday)",
      kind: "public",
      regions: ["Baden-Württemberg", "Bavaria", "Saxony-Anhalt"],
      halfDay: false,
    });
  });

  it("flags the half-day holiday and keeps it public", () => {
    const eve = load("german").find((h) => h.date === "2026-12-24");
    expect(eve).toMatchObject({ kind: "public", halfDay: true, regions: null });
    expect(load("german").find((h) => h.date === "2026-12-25")?.halfDay).toBe(false);
  });

  it("reads national holidays with no Regions", () => {
    const nyepi = load("indonesian").filter((h) => h.name.includes("Nyepi"));
    expect(nyepi.map((h) => h.date).sort()).toEqual(["2026-03-18", "2026-03-19"]);
    expect(nyepi.find((h) => h.date === "2026-03-19")).toMatchObject({ kind: "public", regions: null });
    expect(load("indonesian").find((h) => h.name === "Idul Fitri")?.date).toBe("2026-03-21");
  });

  it("reads the UK bank holidays", () => {
    expect(load("uk").map((h) => [h.date, h.name]).sort()).toEqual([
      ["2026-12-26", "Boxing Day"],
      ["2026-12-28", "Substitute Bank Holiday for Boxing Day"],
    ]);
  });

  it("splits a multi-Region event across a folded line, with no stray backslashes", () => {
    const [holy] = load("australian");
    expect(holy.regions).toEqual([
      "Australian Capital Territory",
      "New South Wales",
      "Northern Territory",
      "Queensland",
      "South Australia",
      "Victoria",
      "Heard and McDonald Islands",
    ]);
    expect(holy.regions!.join("")).not.toContain("\\");
  });

  it("reads observances as observances", () => {
    expect(load("german").find((h) => h.name === "Carnival Tuesday")).toMatchObject({
      date: "2026-02-17",
      kind: "observance",
      regions: null,
    });
  });

  it("keeps the Berlin Region of International Women's Day", () => {
    expect(load("german").find((h) => h.date === "2026-03-08")?.regions).toContain("Berlin");
  });

  it("drops events that are neither public holidays nor observances", () => {
    const ics = [
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260101",
      "DESCRIPTION:Something else",
      "SUMMARY:Odd",
      "END:VEVENT",
    ].join("\r\n");
    expect(parseHolidayIcs(ics)).toEqual([]);
  });
});
