import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueue,
  flushQueue,
  newClientKey,
  readQueue,
  removeFromQueue,
  type QueuedFeedbackNote,
} from "@/lib/feedback-queue";

const STORAGE_KEY = "teepee.feedback.queue.v1";

function note(overrides: Partial<QueuedFeedbackNote> = {}): QueuedFeedbackNote {
  return {
    clientKey: "fk_1",
    body: "Something is off",
    route: "/trips/t1/plan",
    pageLabel: "Plan editor",
    tripId: "t1",
    tripName: "Europe Summer 2026",
    viewport: "390x844",
    userAgent: "iPhone",
    authoredAt: "2026-09-08T04:05:06.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("readQueue", () => {
  it("is empty when nothing has been queued", () => {
    expect(readQueue()).toEqual([]);
  });

  it("recovers from corrupt storage instead of throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readQueue()).toEqual([]);
  });

  it("discards a stored value that is not an array of notes", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ nope: true }));
    expect(readQueue()).toEqual([]);
  });

  // A record the guard waves through but the server schema rejects can never
  // be sent, so it must not be readable as a note in the first place.
  it.each([
    "clientKey",
    "body",
    "route",
    "pageLabel",
    "tripId",
    "tripName",
    "viewport",
    "userAgent",
    "authoredAt",
  ])("rejects a stored record missing %s", (field) => {
    const broken: Record<string, unknown> = { ...note() };
    delete broken[field];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([broken]));
    expect(readQueue()).toEqual([]);
  });

  it("accepts null for the nullable fields but not for the required ones", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        note({ tripId: null, tripName: null, viewport: null, userAgent: null }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { ...note({ clientKey: "fk_bad" }), pageLabel: null as any },
      ]),
    );
    expect(readQueue().map((n) => n.clientKey)).toEqual(["fk_1"]);
  });

  it("rejects a stored record whose field is the wrong type", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ ...note(), viewport: 390 }]),
    );
    expect(readQueue()).toEqual([]);
  });
});

describe("enqueue", () => {
  it("appends notes in the order they were written", () => {
    enqueue(note({ clientKey: "fk_1" }));
    const queue = enqueue(note({ clientKey: "fk_2" }));
    expect(queue.map((n) => n.clientKey)).toEqual(["fk_1", "fk_2"]);
    expect(readQueue()).toHaveLength(2);
  });

  it("does not queue the same clientKey twice", () => {
    enqueue(note({ clientKey: "fk_1" }));
    const queue = enqueue(note({ clientKey: "fk_1" }));
    expect(queue).toHaveLength(1);
  });

  it("keeps only the newest 50 notes", () => {
    for (let i = 0; i < 55; i++) enqueue(note({ clientKey: `fk_${i}` }));
    const queue = readQueue();
    expect(queue).toHaveLength(50);
    expect(queue[0].clientKey).toBe("fk_5");
  });

  it("returns a queue without the new note when setItem throws", () => {
    enqueue(note({ clientKey: "fk_1" }));
    const spy = vi
      .spyOn(window.localStorage.__proto__, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });

    const queue = enqueue(note({ clientKey: "fk_2" }));

    expect(queue.map((n) => n.clientKey)).toEqual(["fk_1"]);
    expect(queue.some((n) => n.clientKey === "fk_2")).toBe(false);
    spy.mockRestore();
  });

  it("preserves the existing queue when setItem throws", () => {
    enqueue(note({ clientKey: "fk_1" }));
    const spy = vi
      .spyOn(window.localStorage.__proto__, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });

    const queue = enqueue(note({ clientKey: "fk_2" }));

    expect(queue).toHaveLength(1);
    expect(queue[0].clientKey).toBe("fk_1");
    spy.mockRestore();
  });
});

describe("removeFromQueue", () => {
  it("drops the matching note and leaves the rest", () => {
    enqueue(note({ clientKey: "fk_1" }));
    enqueue(note({ clientKey: "fk_2" }));
    const queue = removeFromQueue("fk_1");
    expect(queue.map((n) => n.clientKey)).toEqual(["fk_2"]);
  });
});

describe("flushQueue", () => {
  it("sends oldest first and clears what landed", async () => {
    enqueue(note({ clientKey: "fk_1" }));
    enqueue(note({ clientKey: "fk_2" }));
    const sender = vi.fn().mockResolvedValue("sent");

    const result = await flushQueue(sender);

    expect(sender.mock.calls.map((c) => c[0].clientKey)).toEqual(["fk_1", "fk_2"]);
    expect(result).toEqual({ sent: 2, discarded: [], remaining: 0 });
    expect(readQueue()).toEqual([]);
  });

  it("stops at the first transient failure and keeps the rest queued in order", async () => {
    enqueue(note({ clientKey: "fk_1" }));
    enqueue(note({ clientKey: "fk_2" }));
    enqueue(note({ clientKey: "fk_3" }));
    const sender = vi
      .fn()
      .mockResolvedValueOnce("sent")
      .mockResolvedValueOnce("transient");

    const result = await flushQueue(sender);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 1, discarded: [], remaining: 2 });
    expect(readQueue().map((n) => n.clientKey)).toEqual(["fk_2", "fk_3"]);
  });

  it("treats a thrown sender as transient rather than losing the note", async () => {
    enqueue(note({ clientKey: "fk_1" }));
    const sender = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await flushQueue(sender);

    expect(result).toEqual({ sent: 0, discarded: [], remaining: 1 });
    expect(readQueue()).toHaveLength(1);
  });

  // The whole point of the outcome union: a note the server will never accept
  // used to be retried forever, stranding every note written after it.
  it("discards a permanently rejected Feedback note and sends the one behind it", async () => {
    enqueue(note({ clientKey: "fk_bad", body: "Rejected forever" }));
    enqueue(note({ clientKey: "fk_good" }));
    const sender = vi
      .fn()
      .mockResolvedValueOnce("rejected")
      .mockResolvedValueOnce("sent");

    const result = await flushQueue(sender);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(1);
    expect(result.remaining).toBe(0);
    expect(readQueue()).toEqual([]);
  });

  it("hands back the discarded Feedback notes so the user can be told", async () => {
    enqueue(note({ clientKey: "fk_bad", body: "Rejected forever" }));
    const sender = vi.fn().mockResolvedValue("rejected");

    const result = await flushQueue(sender);

    expect(result.discarded.map((n) => n.clientKey)).toEqual(["fk_bad"]);
    expect(result.discarded[0].body).toBe("Rejected forever");
    expect(result.sent).toBe(0);
  });
});

describe("newClientKey", () => {
  it("produces distinct keys", () => {
    expect(newClientKey()).not.toBe(newClientKey());
  });
});
