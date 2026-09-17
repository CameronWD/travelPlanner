import { describe, expect, it } from "vitest";
import { buildDigest, type DigestInput } from "@/lib/digest";

function input(over: Partial<DigestInput> = {}): DigestInput {
  return {
    tripId: "trip-1",
    slot: "EVENING",
    phase: "planning",
    payments: [],
    checklist: [],
    reminders: [],
    schedule: { transports: [], stays: [], items: [] },
    ...over,
  };
}

describe("buildDigest", () => {
  it("returns null when there is nothing to say", () => {
    expect(buildDigest(input())).toBeNull();
  });

  it("titles a pre-trip evening digest 'Coming up'", () => {
    const d = buildDigest(
      input({ payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 3 }] }),
    );
    expect(d?.title).toBe("Coming up");
    expect(d?.body).toBe("£240 Airbnb comes out in 3 days");
  });

  it("titles a travelling evening digest 'Tomorrow'", () => {
    const d = buildDigest(
      input({
        phase: "travelling",
        schedule: {
          transports: [{ id: "t1", mode: "TRAIN", route: "Vienna → Prague", localTime: "09:40" }],
          stays: [],
          items: [],
        },
      }),
    );
    expect(d?.title).toBe("Tomorrow");
    expect(d?.body).toBe("09:40 train Vienna → Prague");
  });

  it("titles the evening-before-departure digest 'Tomorrow'", () => {
    // The night before the outbound flight the trip is still in final-prep,
    // but the digest is carrying tomorrow's itinerary — the title follows the
    // schedule, not the phase.
    const d = buildDigest(
      input({
        phase: "final-prep",
        checklist: [{ id: "k1", text: "check in online", daysUntil: 0 }],
        schedule: {
          transports: [{ id: "t1", mode: "FLIGHT", route: "Sydney → Vienna", localTime: "06:15" }],
          stays: [],
          items: [],
        },
      }),
    );
    expect(d?.title).toBe("Tomorrow");
    expect(d?.body.split("\n")).toEqual([
      "Checklist: check in online due today",
      "06:15 flight Sydney → Vienna",
    ]);
  });

  it("titles a travelling evening digest with no schedule 'Coming up'", () => {
    // Nothing planned tomorrow, so there is no "tomorrow" to promise — even
    // mid-trip. This is what stops the title rule regressing to the phase.
    const d = buildDigest(
      input({
        phase: "travelling",
        payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 2 }],
      }),
    );
    expect(d?.title).toBe("Coming up");
  });

  it("says 'comes out today' at zero days", () => {
    const d = buildDigest(
      input({ payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }] }),
    );
    expect(d?.body).toBe("£240 Airbnb comes out today");
  });

  it("points a payments-only digest at the budget", () => {
    const d = buildDigest(
      input({ payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }] }),
    );
    expect(d?.url).toBe("/trips/trip-1/budget");
  });

  it("points a mixed digest at the trip home", () => {
    const d = buildDigest(
      input({
        payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }],
        reminders: [{ id: "r1", title: "Print the insurance docs" }],
      }),
    );
    expect(d?.url).toBe("/trips/trip-1");
  });

  it("orders payments, then checklist, then reminders, then the schedule", () => {
    const d = buildDigest(
      input({
        phase: "travelling",
        payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }],
        checklist: [{ id: "k1", text: "visa application", daysUntil: 3 }],
        reminders: [{ id: "r1", title: "Print the insurance docs" }],
        schedule: {
          transports: [{ id: "t1", mode: "FLIGHT", route: "Sydney → Vienna", localTime: "09:40" }],
          stays: [{ id: "a1", name: "Hotel Sacher", kind: "CHECK_OUT", localTime: "10:00" }],
          items: [{ id: "i1", title: "Christmas market", localTime: "18:00" }],
        },
      }),
    );
    expect(d?.body.split("\n")).toEqual([
      "£240 Airbnb comes out today",
      "Checklist: visa application due in 3 days",
      "Print the insurance docs",
      "09:40 flight Sydney → Vienna",
      "Check out of Hotel Sacher by 10:00",
      "18:00 Christmas market",
    ]);
  });

  it("caps the body at six lines and counts the rest", () => {
    const d = buildDigest(
      input({
        reminders: Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, title: `Note ${i}` })),
      }),
    );
    const lines = d!.body.split("\n");
    expect(lines).toHaveLength(7);
    expect(lines[6]).toBe("+3 more");
  });

  it("drops the time when an item or stay has none", () => {
    const d = buildDigest(
      input({
        phase: "travelling",
        schedule: {
          transports: [],
          stays: [{ id: "a1", name: "Hostel", kind: "CHECK_IN", localTime: null }],
          items: [{ id: "i1", title: "Wander", localTime: null }],
        },
      }),
    );
    expect(d?.body).toBe("Check in at Hostel\nWander");
  });

  describe("MORNING slot", () => {
    it("is silent when the day holds no transport and no check-out", () => {
      const d = buildDigest(
        input({
          slot: "MORNING",
          phase: "travelling",
          payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }],
          reminders: [{ id: "r1", title: "Print the insurance docs" }],
          schedule: {
            transports: [],
            stays: [{ id: "a1", name: "Hotel", kind: "CHECK_IN", localTime: "15:00" }],
            items: [{ id: "i1", title: "Museum", localTime: "11:00" }],
          },
        }),
      );
      expect(d).toBeNull();
    });

    it("fires for a departure and titles itself 'Today'", () => {
      const d = buildDigest(
        input({
          slot: "MORNING",
          phase: "travelling",
          payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }],
          schedule: {
            transports: [{ id: "t1", mode: "TRAIN", route: "Vienna → Prague", localTime: "09:40" }],
            stays: [],
            items: [],
          },
        }),
      );
      expect(d?.title).toBe("Today");
      // The evening slot already carried the payment; the morning is travel only.
      expect(d?.body).toBe("09:40 train Vienna → Prague");
    });

    it("fires for a check-out", () => {
      const d = buildDigest(
        input({
          slot: "MORNING",
          phase: "travelling",
          schedule: {
            transports: [],
            stays: [{ id: "a1", name: "Hotel Sacher", kind: "CHECK_OUT", localTime: "10:00" }],
            items: [],
          },
        }),
      );
      expect(d?.body).toBe("Check out of Hotel Sacher by 10:00");
    });
  });
});
