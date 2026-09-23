import { describe, expect, it } from "vitest";
import { asTestDigest, buildDigest, type DigestInput, type DigestPayload } from "@/lib/digest";

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
      "06:15 flight Sydney → Vienna",
      "Checklist: check in online due today",
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

  it("orders the schedule, then reminders, then payments, then checklist — costliest to lose first", () => {
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
      "09:40 flight Sydney → Vienna",
      "Check out of Hotel Sacher by 10:00",
      "18:00 Christmas market",
      "Print the insurance docs",
      "£240 Airbnb comes out today",
      "Checklist: visa application due in 3 days",
    ]);
  });

  const OVERDUE = (text: string) => ({ id: text, text, daysUntil: -3 });

  it("keeps tomorrow's flight above a wall of overdue checklist items", () => {
    const out = buildDigest(
      input({
        phase: "travelling",
        checklist: [OVERDUE("a"), OVERDUE("b"), OVERDUE("c"), OVERDUE("d"), OVERDUE("e"), OVERDUE("f")],
        schedule: {
          transports: [{ id: "t1", mode: "FLIGHT", route: "Munich → Strasbourg", localTime: "06:00" }],
          stays: [],
          items: [],
        },
      }),
    );
    expect(out!.body.split("\n")[0]).toContain("Munich → Strasbourg");
  });

  it("caps the checklist block at two lines so it cannot crowd out a payment", () => {
    const out = buildDigest(
      input({
        payments: [{ id: "c1", amountLabel: "£240", label: "Airbnb", daysUntil: 0 }],
        checklist: [OVERDUE("a"), OVERDUE("b"), OVERDUE("c"), OVERDUE("d")],
      }),
    );
    const lines = out!.body.split("\n");
    expect(lines.filter((l) => l.startsWith("Checklist:"))).toHaveLength(2);
    expect(out!.body).toContain("Airbnb");
  });

  it("counts checklist lines dropped by the per-section cap in the tail", () => {
    const payload = buildDigest(
      input({
        slot: "EVENING",
        checklist: [
          { id: "k1", text: "Passport", daysUntil: 1 },
          { id: "k2", text: "Adapters", daysUntil: 1 },
          { id: "k3", text: "Insurance", daysUntil: 1 },
          { id: "k4", text: "Currency", daysUntil: 1 },
          { id: "k5", text: "Sunscreen", daysUntil: 1 },
        ],
      }),
    );

    expect(payload?.body).toContain("+3 more");
  });

  it("puts a reminder above a payment — a reminder is said once and never repeats", () => {
    const out = buildDigest(
      input({
        payments: [{ id: "c1", amountLabel: "£240", label: "Airbnb", daysUntil: 2 }],
        reminders: [{ id: "r1", title: "Print the insurance docs" }],
      }),
    );
    const lines = out!.body.split("\n");
    expect(lines.indexOf("Print the insurance docs")).toBeLessThan(
      lines.findIndex((l) => l.includes("Airbnb")),
    );
  });

  it("still links a payments-only digest to the budget after checklist truncation", () => {
    const out = buildDigest(
      input({
        payments: [{ id: "c1", amountLabel: "£240", label: "Airbnb", daysUntil: 0 }],
      }),
    );
    expect(out!.url).toBe("/trips/trip-1/budget");
  });

  it("says an overdue checklist item is overdue, not 'due in -3 days'", () => {
    // A Checklist item persists until done and keeps reappearing while overdue
    // (CONTEXT.md **Checklist**), so daysUntil is genuinely negative here.
    const d = buildDigest(
      input({
        checklist: [
          { id: "k1", text: "visa application", daysUntil: -3 },
          { id: "k2", text: "order euros", daysUntil: -1 },
        ],
      }),
    );
    expect(d?.body.split("\n")).toEqual([
      "Checklist: visa application — 3 days overdue",
      "Checklist: order euros — 1 day overdue",
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

describe("asTestDigest", () => {
  it("marks a real digest as a test without touching its body or url", () => {
    const real = buildDigest(
      input({ payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 3 }] }),
    );

    const test = asTestDigest(real, "trip-1");

    expect(test.title).toBe("Test · Coming up");
    expect(test.body).toBe(real!.body);
    expect(test.url).toBe(real!.url);
  });

  it("marks a 'Tomorrow' digest too, so no test push impersonates the 8pm one", () => {
    const real = buildDigest(
      input({
        phase: "travelling",
        schedule: {
          transports: [{ id: "t1", mode: "TRAIN", route: "Vienna → Prague", localTime: "09:40" }],
          stays: [],
          items: [],
        },
      }),
    );

    expect(asTestDigest(real, "trip-1").title).toBe("Test · Tomorrow");
  });

  it("returns the placeholder when there is no digest to send", () => {
    // The whole point of the button: on a quiet day it must still prove the
    // pipe works rather than refusing (ADR 0047 calls it the push-half probe).
    const test = asTestDigest(null, "trip-1");

    expect(test).toEqual({
      title: "Test · Teepee",
      body: "Push is working. Your digest arrives in the evening when there's something to say.",
      url: "/trips/trip-1/settings",
    });
  });

  it("points the placeholder at the settings page the button lives on", () => {
    expect(asTestDigest(null, "trip-abc").url).toBe("/trips/trip-abc/settings");
  });

  it("does not mutate the digest it was given", () => {
    const real: DigestPayload = { title: "Tomorrow", body: "line", url: "/trips/trip-1" };

    asTestDigest(real, "trip-1");

    expect(real.title).toBe("Tomorrow");
  });
});
