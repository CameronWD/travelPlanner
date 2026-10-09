import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { backfillCoverSmall, type BackfillCoverSmallDeps } from "./backfill-cover-small-run";
import { coverSmallKeyFor } from "../lib/cover";

/** Casts the fake db/storage to the deps type — same pattern as lib/blob-retention.test.ts's
 * `as unknown as Parameters<...>` for a Prisma delegate narrower than the real client. */
function run(deps: { db: unknown; storage: unknown; dryRun: boolean; log: (s: string) => void }) {
  return backfillCoverSmall(deps as unknown as BackfillCoverSmallDeps);
}

const jpeg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c33" } }).jpeg().toBuffer();

type Row = { id: string; coverImageKey: string; coverAspect: number | null };

/** In-memory fake db.trip — only the two methods backfillCoverSmall uses.
 * `updateManyRejectsFor` lets a single row's update throw, like a dropped
 * connection, while the rest of the batch still processes normally.
 * `noMatchFor` simulates the guarded `updateMany`'s where clause matching no
 * row (the cover changed mid-run) by returning `{ count: 0 }` instead of
 * `{ count: 1 }`, without throwing. */
function fakeDb(
  rows: Row[],
  calls: string[],
  opts?: { updateManyRejectsFor?: Set<string>; noMatchFor?: Set<string> },
) {
  return {
    trip: {
      findMany: vi.fn(async (args: unknown) => {
        calls.push(`findMany:${JSON.stringify(args)}`);
        return rows;
      }),
      updateMany: vi.fn(
        async (args: { where: { id: string; coverImageKey: string; coverSmallKey: null }; data: Record<string, unknown> }) => {
          if (opts?.updateManyRejectsFor?.has(args.where.id)) {
            calls.push(`updateMany-reject:${JSON.stringify(args)}`);
            throw new Error("update failed");
          }
          if (opts?.noMatchFor?.has(args.where.id)) {
            calls.push(`updateMany-nomatch:${JSON.stringify(args)}`);
            return { count: 0 };
          }
          calls.push(`updateMany:${JSON.stringify(args)}`);
          return { count: 1 };
        },
      ),
    },
  };
}

/** In-memory fake storage — read from a Map, save recording, optionally rejecting.
 * `readRejectsFor` lets a single key's read throw (a real driver's non-ENOENT
 * failure — network error, permission, etc. — rather than the "missing key"
 * null case), while other keys in the same batch still read normally. */
function fakeStorage(
  blobs: Map<string, Buffer>,
  calls: string[],
  opts?: { saveRejects?: boolean; readRejectsFor?: Set<string> },
) {
  return {
    read: vi.fn(async (key: string) => {
      if (opts?.readRejectsFor?.has(key)) {
        calls.push(`read-reject:${key}`);
        throw new Error("read failed");
      }
      calls.push(`read:${key}`);
      return blobs.get(key) ?? null;
    }),
    save: vi.fn(async (key: string, data: Buffer, mime: string) => {
      if (opts?.saveRejects) {
        calls.push(`save-reject:${key}`);
        throw new Error("save failed");
      }
      calls.push(`save:${key}:${mime}`);
      blobs.set(key, data);
    }),
  };
}

describe("backfillCoverSmall", () => {
  it("(a) JPEG row with coverAspect null: saves at <key>-sm as image/webp BEFORE updating coverSmallKey + coverAspect", async () => {
    const bytes = await jpeg(2000, 1000);
    const calls: string[] = [];
    const key = "trips/t1/cover.jpg";
    const rows: Row[] = [{ id: "t1", coverImageKey: key, coverAspect: null }];
    const db = fakeDb(rows, calls);
    const blobs = new Map([[key, bytes]]);
    const storage = fakeStorage(blobs, calls);

    const result = await run({ db, storage, dryRun: false, log: () => {} });

    expect(result).toEqual({ scanned: 1, made: 1, skipped: 0, failed: 0 });
    const saveIdx = calls.findIndex((c) => c.startsWith("save:"));
    const updateIdx = calls.findIndex((c) => c.startsWith("updateMany:"));
    expect(saveIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThan(saveIdx);
    expect(calls[saveIdx]).toBe(`save:${coverSmallKeyFor(key)}:image/webp`);

    const updateCall = db.trip.updateMany.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "t1", coverImageKey: key, coverSmallKey: null });
    expect(updateCall.data.coverSmallKey).toBe(coverSmallKeyFor(key));
    expect(updateCall.data.coverAspect).toBeCloseTo(2);
  });

  it("(b) row with existing aspect: update data has no coverAspect key", async () => {
    const bytes = await jpeg(2000, 1000);
    const key = "trips/t2/cover.jpg";
    const rows: Row[] = [{ id: "t2", coverImageKey: key, coverAspect: 1.5 }];
    const calls: string[] = [];
    const db = fakeDb(rows, calls);
    const storage = fakeStorage(new Map([[key, bytes]]), calls);

    const result = await run({ db, storage, dryRun: false, log: () => {} });

    expect(result).toEqual({ scanned: 1, made: 1, skipped: 0, failed: 0 });
    const updateCall = db.trip.updateMany.mock.calls[0][0];
    expect(updateCall.data.coverSmallKey).toBe(coverSmallKeyFor(key));
    expect("coverAspect" in updateCall.data).toBe(false);
  });

  it("(c) GIF: skipped, no save or update", async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    const key = "trips/t3/cover.gif";
    const rows: Row[] = [{ id: "t3", coverImageKey: key, coverAspect: null }];
    const calls: string[] = [];
    const db = fakeDb(rows, calls);
    const storage = fakeStorage(new Map([[key, gif]]), calls);

    const result = await run({ db, storage, dryRun: false, log: () => {} });

    expect(result).toEqual({ scanned: 1, made: 0, skipped: 1, failed: 0 });
    expect(calls.some((c) => c.startsWith("save"))).toBe(false);
    expect(db.trip.updateMany).not.toHaveBeenCalled();
  });

  it("(d) missing blob: failed", async () => {
    const key = "trips/t4/cover.jpg";
    const rows: Row[] = [{ id: "t4", coverImageKey: key, coverAspect: null }];
    const calls: string[] = [];
    const db = fakeDb(rows, calls);
    const storage = fakeStorage(new Map(), calls);

    const result = await run({ db, storage, dryRun: false, log: () => {} });

    expect(result).toEqual({ scanned: 1, made: 0, skipped: 0, failed: 1 });
    expect(db.trip.updateMany).not.toHaveBeenCalled();
  });

  it("(e) garbage bytes: failed", async () => {
    const key = "trips/t5/cover.jpg";
    const rows: Row[] = [{ id: "t5", coverImageKey: key, coverAspect: null }];
    const calls: string[] = [];
    const db = fakeDb(rows, calls);
    const storage = fakeStorage(new Map([[key, Buffer.from("not an image")]]), calls);

    const result = await run({ db, storage, dryRun: false, log: () => {} });

    expect(result).toEqual({ scanned: 1, made: 0, skipped: 0, failed: 1 });
    expect(db.trip.updateMany).not.toHaveBeenCalled();
  });

  it("(f) save rejects: failed, no update", async () => {
    const bytes = await jpeg(2000, 1000);
    const key = "trips/t6/cover.jpg";
    const rows: Row[] = [{ id: "t6", coverImageKey: key, coverAspect: null }];
    const calls: string[] = [];
    const db = fakeDb(rows, calls);
    const storage = fakeStorage(new Map([[key, bytes]]), calls, { saveRejects: true });

    const result = await run({ db, storage, dryRun: false, log: () => {} });

    expect(result).toEqual({ scanned: 1, made: 0, skipped: 0, failed: 1 });
    expect(db.trip.updateMany).not.toHaveBeenCalled();
  });

  it("(j) storage.read rejects (a real driver's non-ENOENT failure): failed, remaining rows still processed", async () => {
    const good = await jpeg(2000, 1000);
    const rows: Row[] = [
      { id: "bad-read", coverImageKey: "k-bad-read", coverAspect: null },
      { id: "ok", coverImageKey: "k-ok", coverAspect: null },
    ];
    const calls: string[] = [];
    const db = fakeDb(rows, calls);
    const storage = fakeStorage(new Map([["k-ok", good]]), calls, { readRejectsFor: new Set(["k-bad-read"]) });

    const result = await run({ db, storage, dryRun: false, log: () => {} });

    expect(result).toEqual({ scanned: 2, made: 1, skipped: 0, failed: 1 });
    expect(db.trip.updateMany).toHaveBeenCalledTimes(1);
    expect(db.trip.updateMany.mock.calls[0][0].where).toEqual({
      id: "ok",
      coverImageKey: "k-ok",
      coverSmallKey: null,
    });
  });

  it("(k) db.trip.updateMany rejects: failed, blob already saved, remaining rows still processed", async () => {
    const bytesA = await jpeg(2000, 1000);
    const bytesB = await jpeg(2000, 1000);
    const rows: Row[] = [
      { id: "bad-update", coverImageKey: "k-bad-update", coverAspect: null },
      { id: "ok", coverImageKey: "k-ok2", coverAspect: null },
    ];
    const calls: string[] = [];
    const db = fakeDb(rows, calls, { updateManyRejectsFor: new Set(["bad-update"]) });
    const storage = fakeStorage(
      new Map([
        ["k-bad-update", bytesA],
        ["k-ok2", bytesB],
      ]),
      calls,
    );

    const result = await run({ db, storage, dryRun: false, log: () => {} });

    expect(result).toEqual({ scanned: 2, made: 1, skipped: 0, failed: 1 });
    // The small blob for the failed row was still saved (idempotent re-run
    // overwrites the same key) — only the Trip row's update was lost.
    expect(calls).toContain(`save:${coverSmallKeyFor("k-bad-update")}:image/webp`);
    expect(db.trip.updateMany).toHaveBeenCalledTimes(2);
    expect(db.trip.updateMany.mock.calls[1][0].where).toEqual({
      id: "ok",
      coverImageKey: "k-ok2",
      coverSmallKey: null,
    });
  });

  it("(l) updateMany matches no row (cover changed mid-run): skipped, not failed, blob already saved", async () => {
    const bytes = await jpeg(2000, 1000);
    const key = "trips/t8/cover.jpg";
    const rows: Row[] = [{ id: "t8", coverImageKey: key, coverAspect: null }];
    const calls: string[] = [];
    const db = fakeDb(rows, calls, { noMatchFor: new Set(["t8"]) });
    const storage = fakeStorage(new Map([[key, bytes]]), calls);

    const result = await run({ db, storage, dryRun: false, log: () => {} });

    expect(result).toEqual({ scanned: 1, made: 0, skipped: 1, failed: 0 });
    // The orphaned small blob was still saved — harmless, per the guard's
    // own doc comment.
    expect(calls).toContain(`save:${coverSmallKeyFor(key)}:image/webp`);
    expect(db.trip.updateMany).toHaveBeenCalledTimes(1);
    expect(db.trip.updateMany.mock.calls[0][0].where).toEqual({
      id: "t8",
      coverImageKey: key,
      coverSmallKey: null,
    });
  });

  it("(g) dryRun: no save, no update, counted as made", async () => {
    const bytes = await jpeg(2000, 1000);
    const key = "trips/t7/cover.jpg";
    const rows: Row[] = [{ id: "t7", coverImageKey: key, coverAspect: null }];
    const calls: string[] = [];
    const db = fakeDb(rows, calls);
    const storage = fakeStorage(new Map([[key, bytes]]), calls);

    const result = await run({ db, storage, dryRun: true, log: () => {} });

    expect(result).toEqual({ scanned: 1, made: 1, skipped: 0, failed: 0 });
    expect(storage.save).not.toHaveBeenCalled();
    expect(db.trip.updateMany).not.toHaveBeenCalled();
  });

  it("(h) findMany is called with the right where clause", async () => {
    const calls: string[] = [];
    const db = fakeDb([], calls);
    const storage = fakeStorage(new Map(), calls);

    await run({ db, storage, dryRun: false, log: () => {} });

    expect(db.trip.findMany).toHaveBeenCalledWith({
      where: { coverImageKey: { not: null }, coverSmallKey: null },
      select: { id: true, coverImageKey: true, coverAspect: true },
    });
  });

  it("(i) returned counts match a mixed batch", async () => {
    const good = await jpeg(2000, 1000);
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    const rows: Row[] = [
      { id: "ok", coverImageKey: "k-ok", coverAspect: null },
      { id: "gif", coverImageKey: "k-gif", coverAspect: null },
      { id: "missing", coverImageKey: "k-missing", coverAspect: null },
    ];
    const calls: string[] = [];
    const db = fakeDb(rows, calls);
    const storage = fakeStorage(
      new Map([
        ["k-ok", good],
        ["k-gif", gif],
      ]),
      calls,
    );

    const result = await run({ db, storage, dryRun: false, log: () => {} });

    expect(result).toEqual({ scanned: 3, made: 1, skipped: 1, failed: 1 });
  });
});
