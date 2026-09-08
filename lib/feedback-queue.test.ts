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
    const sender = vi.fn().mockResolvedValue(true);

    const result = await flushQueue(sender);

    expect(sender.mock.calls.map((c) => c[0].clientKey)).toEqual(["fk_1", "fk_2"]);
    expect(result).toEqual({ sent: 2, remaining: 0 });
    expect(readQueue()).toEqual([]);
  });

  it("stops at the first failure and keeps the rest queued in order", async () => {
    enqueue(note({ clientKey: "fk_1" }));
    enqueue(note({ clientKey: "fk_2" }));
    enqueue(note({ clientKey: "fk_3" }));
    const sender = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await flushQueue(sender);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 1, remaining: 2 });
    expect(readQueue().map((n) => n.clientKey)).toEqual(["fk_2", "fk_3"]);
  });

  it("treats a thrown sender as a failure rather than losing the note", async () => {
    enqueue(note({ clientKey: "fk_1" }));
    const sender = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await flushQueue(sender);

    expect(result).toEqual({ sent: 0, remaining: 1 });
    expect(readQueue()).toHaveLength(1);
  });
});

describe("newClientKey", () => {
  it("produces distinct keys", () => {
    expect(newClientKey()).not.toBe(newClientKey());
  });
});
