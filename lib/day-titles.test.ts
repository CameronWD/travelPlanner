import { describe, expect, it } from "vitest";
import { titlesByDate, dayIndexFor } from "./day-titles";

const lisbon = { id: "s1", arriveDate: "2026-12-10", departDate: "2026-12-13" };
const porto = { id: "s2", arriveDate: "2026-12-13", departDate: "2026-12-15" };

describe("titlesByDate", () => {
  it("places a title on arrive + dayIndex", () => {
    expect(
      titlesByDate([lisbon], [{ stopId: "s1", dayIndex: 1, title: "Sintra day trip" }]).get(
        "2026-12-11",
      ),
    ).toEqual({ title: "Sintra day trip", stopId: "s1" });
  });

  it("rides with the Stop when re-dated", () => {
    const moved = { ...lisbon, arriveDate: "2026-12-17", departDate: "2026-12-20" };
    expect(
      titlesByDate([moved], [{ stopId: "s1", dayIndex: 1, title: "X" }]).has("2026-12-18"),
    ).toBe(true);
  });

  it("hides a title beyond a shortened stay and shows it again when lengthened", () => {
    const short = { ...lisbon, departDate: "2026-12-11" };
    const t = [{ stopId: "s1", dayIndex: 3, title: "Last day" }];
    expect(titlesByDate([short], t).size).toBe(0);
    expect(titlesByDate([lisbon], t).get("2026-12-13")?.title).toBe("Last day");
  });

  it("a changeover day carries one title", () => {
    const m = titlesByDate(
      [lisbon, porto],
      [{ stopId: "s1", dayIndex: 3, title: "Train day" }],
    );
    expect(m.get("2026-12-13")).toEqual({ title: "Train day", stopId: "s1" });
  });
});

describe("dayIndexFor", () => {
  it("rough stops have no days", () =>
    expect(dayIndexFor({ id: "r", arriveDate: null, departDate: null }, "2026-12-10")).toBeNull());
});
