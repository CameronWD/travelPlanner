import { describe, it, expect } from "vitest";
import { resolveTripDeadline, lastPlanStop, deadlineLabel, deadlineNoun, type DeadlineStop, type DeadlineLeg } from "./trip-deadline";

const stop = (over: Partial<DeadlineStop> & Pick<DeadlineStop, "id">): DeadlineStop => ({
  sortOrder: 0, arriveDate: null, departDate: null, timezone: "UTC", ...over,
});
const leg = (over: Partial<DeadlineLeg>): DeadlineLeg => ({
  mode: "FLIGHT", fromStopId: null, toStopId: null, depIsHome: false, arrIsHome: false, depAt: null, ...over,
});

const ROME = stop({ id: "rome", sortOrder: 0, arriveDate: "2027-01-01", departDate: "2027-01-05", timezone: "Europe/Rome" });
const PARIS = stop({ id: "paris", sortOrder: 1, arriveDate: "2027-01-05", departDate: "2027-01-08", timezone: "Europe/Paris" });

describe("resolveTripDeadline (ADR 0068)", () => {
  it("a dated return leg is the deadline, ahead of the Hard end date", () => {
    const transports = [leg({ fromStopId: "paris", arrIsHome: true, depAt: new Date("2027-01-08T09:00:00Z") })];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: "2027-01-20" }))
      .toEqual({ kind: "return-leg", date: "2027-01-08", mode: "FLIGHT", homeward: true });
  });

  it("reads the departure's date in the last Stop's timezone", () => {
    // 23:30Z on the 8th is 00:30 on the 9th in Paris.
    const transports = [leg({ fromStopId: "paris", depAt: "2027-01-08T23:30:00Z", mode: "TRAIN" })];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: null }))
      .toEqual({ kind: "return-leg", date: "2027-01-09", mode: "TRAIN", homeward: true });
  });

  it("a return leg with no date falls back to the Hard end date", () => {
    const transports = [leg({ fromStopId: "paris", arrIsHome: true, depAt: null })];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: "2027-01-20" }))
      .toEqual({ kind: "hard-end", date: "2027-01-20" });
  });

  it("no return leg (deleted) → the stored Hard end date resumes", () => {
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports: [], hardEndDate: "2027-01-20" }))
      .toEqual({ kind: "hard-end", date: "2027-01-20" });
  });

  it("no return leg and no Hard end date → null", () => {
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports: [], hardEndDate: null })).toBeNull();
    expect(resolveTripDeadline({ stops: [], transports: [], hardEndDate: null })).toBeNull();
  });

  it("a leg between Stops, or one leaving an earlier Stop, is not the return leg", () => {
    const transports = [
      leg({ fromStopId: "rome", toStopId: "paris", depAt: "2027-01-05T08:00:00Z" }),
      leg({ fromStopId: "rome", depAt: "2027-01-04T08:00:00Z" }),
    ];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: "2027-01-20" }))
      .toEqual({ kind: "hard-end", date: "2027-01-20" });
  });

  it("multi-leg journey home: the leg leaving the last Stop sets the deadline, not the onward leg that lands home", () => {
    const transports = [
      leg({ fromStopId: "paris", toStopId: null, arrIsHome: false, mode: "TRAIN", depAt: "2027-01-08T07:00:00Z" }),
      leg({ fromStopId: null, toStopId: null, depIsHome: false, arrIsHome: true, mode: "FLIGHT", depAt: "2027-01-09T10:00:00Z" }),
    ];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: null }))
      .toEqual({ kind: "return-leg", date: "2027-01-08", mode: "TRAIN", homeward: true });
  });

  it("R2: two dated legs both leaving the last Stop → the deadline is the EARLIEST departure, not findReturnLeg's arrIsHome pick", () => {
    // A train to the airport at 09:00, then a flight at 14:00 — both stored as
    // leaving Paris (the last Stop). findReturnLeg would prefer the arrIsHome
    // flight (the later one); the deadline is the moment you have to leave: the train.
    const transports = [
      leg({ fromStopId: "paris", toStopId: null, arrIsHome: false, mode: "TRAIN", depAt: "2027-01-08T09:00:00Z" }),
      leg({ fromStopId: "paris", toStopId: null, arrIsHome: true, mode: "FLIGHT", depAt: "2027-01-08T14:00:00Z" }),
    ];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: null }))
      .toEqual({ kind: "return-leg", date: "2027-01-08", mode: "TRAIN", homeward: true });
  });

  it("the last Stop is the last in plan order (ADR 0038), not the highest sortOrder", () => {
    // Paris has the lower sortOrder but the later dates, so it is last in plan order.
    const paris = { ...PARIS, sortOrder: 0 };
    const rome = { ...ROME, sortOrder: 1 };
    expect(lastPlanStop([paris, rome])?.id).toBe("paris");
    const transports = [leg({ fromStopId: "paris", depAt: "2027-01-08T09:00:00Z" })];
    expect(resolveTripDeadline({ stops: [paris, rome], transports, hardEndDate: null })?.kind).toBe("return-leg");
  });

  it("an unknown mode string reads as OTHER; an unparseable depAt falls back", () => {
    expect(resolveTripDeadline({ stops: [PARIS], transports: [leg({ fromStopId: "paris", mode: "ROCKET", depAt: "2027-01-08T09:00:00Z" })], hardEndDate: null }))
      .toEqual({ kind: "return-leg", date: "2027-01-08", mode: "OTHER", homeward: true });
    expect(resolveTripDeadline({ stops: [PARIS], transports: [leg({ fromStopId: "paris", depAt: "not a date" })], hardEndDate: "2027-01-20" }))
      .toEqual({ kind: "hard-end", date: "2027-01-20" });
  });

  it("each plan (Fork) resolves from its own legs", () => {
    const real = [leg({ fromStopId: "paris", depAt: "2027-01-08T09:00:00Z" })];
    const fork: DeadlineLeg[] = [];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports: real, hardEndDate: "2027-01-20" })?.date).toBe("2027-01-08");
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports: fork, hardEndDate: "2027-01-20" })?.date).toBe("2027-01-20");
  });

  // R8: one-way trips — Trip.roundTrip threads onto the result as `homeward`.
  describe("homeward (R8, one-way trips)", () => {
    it("defaults to homeward: true when roundTrip is omitted", () => {
      const transports = [leg({ fromStopId: "paris", depAt: "2027-01-08T09:00:00Z" })];
      const result = resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: null });
      expect(result?.kind === "return-leg" && result.homeward).toBe(true);
    });

    it("carries roundTrip: false onto the result as homeward: false", () => {
      const transports = [leg({ fromStopId: "paris", depAt: "2027-01-08T09:00:00Z" })];
      expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: null, roundTrip: false }))
        .toEqual({ kind: "return-leg", date: "2027-01-08", mode: "FLIGHT", homeward: false });
    });

    it("roundTrip: true is unaffected", () => {
      const transports = [leg({ fromStopId: "paris", depAt: "2027-01-08T09:00:00Z" })];
      const result = resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: null, roundTrip: true });
      expect(result?.kind === "return-leg" && result.homeward).toBe(true);
    });
  });
});

describe("deadline copy", () => {
  it("labels the return leg by mode, the Hard end date as Home by", () => {
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "FLIGHT", homeward: true })).toBe("Flying home Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "CAR", homeward: true })).toBe("Driving home Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "TRAIN", homeward: true })).toBe("Train home Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "BUS", homeward: true })).toBe("Bus home Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "FERRY", homeward: true })).toBe("Ferry home Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "OTHER", homeward: true })).toBe("Heading home Fri 8 Jan");
    expect(deadlineLabel({ kind: "hard-end", date: "2027-01-08" })).toBe("Home by Fri 8 Jan");
  });
  it("names what the plan runs past", () => {
    expect(deadlineNoun({ kind: "return-leg", date: "2027-01-08", mode: "FLIGHT", homeward: true })).toBe("flight home");
    expect(deadlineNoun({ kind: "return-leg", date: "2027-01-08", mode: "CAR", homeward: true })).toBe("drive home");
    expect(deadlineNoun({ kind: "return-leg", date: "2027-01-08", mode: "OTHER", homeward: true })).toBe("trip home");
    expect(deadlineNoun({ kind: "hard-end", date: "2027-01-08" })).toBe("hard end date");
  });

  // R8: one-way trips read "out", not "home".
  it("a one-way trip's onward leg reads 'out', not 'home'", () => {
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "FLIGHT", homeward: false })).toBe("Flying out Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "CAR", homeward: false })).toBe("Driving out Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "TRAIN", homeward: false })).toBe("Train out Fri 8 Jan");
    expect(deadlineNoun({ kind: "return-leg", date: "2027-01-08", mode: "FLIGHT", homeward: false })).toBe("flight out");
    expect(deadlineNoun({ kind: "return-leg", date: "2027-01-08", mode: "CAR", homeward: false })).toBe("drive out");
    expect(deadlineNoun({ kind: "return-leg", date: "2027-01-08", mode: "OTHER", homeward: false })).toBe("trip out");
  });
});
