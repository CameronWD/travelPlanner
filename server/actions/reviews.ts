"use server";

/**
 * Acting on a Review's Findings (spec 2026-10-17 R8, R10, R12): Dismiss,
 * Apply (R.12) and Undo. Open to everyone on the Trip (R12). Every write is
 * conditional on the state it read, so two Travellers clicking at once
 * can't both act. Apply and Dismiss only on the Trip's latest DONE Review
 * (decision 6); Undo on any.
 */
import { db } from "@/lib/db";
import { requireRowAccess } from "@/lib/guards";
import { requireFindingAccess } from "@/lib/review-reads";
import { parseSuggestedFix } from "@/lib/review/schema";
import {
  REVIEW_ACTION_COPY as COPY,
  appendedNote,
  fixTarget,
  sameSnapshot,
  snapshotFor,
  type FixRow,
  type FixSnapshot,
  type FixTarget,
  type UndoPayload,
} from "@/lib/review/fix";
import type { SuggestedFix } from "@/lib/review/types";
import type { BookingState } from "@/lib/enum-values";
import { formFail, ok, type ActionResult } from "@/lib/action-result";
import { isNextControlFlow } from "@/lib/next-control-flow";
import { revalidateTrip } from "@/lib/revalidate";
import { parseOpeningHours } from "@/lib/validations/opening-hours";
import { rescheduleItem, setOpeningHours, updateItem } from "@/server/actions/items";
import { updateTransport } from "@/server/actions/transport";
import { updateAccommodation } from "@/server/actions/accommodation";

type FixRowWithPlan = FixRow & { tripId: string; forkId: string | null };

const BOOKING_COLUMNS = { tripId: true, forkId: true, bookingState: true, bookingStateSet: true, bookBy: true } as const;

/** The columns a fix touches, read fresh. */
async function loadFixRow(target: FixTarget): Promise<FixRowWithPlan | null> {
  switch (target.kind) {
    case "item":
      return db.item.findUnique({
        where: { id: target.id },
        select: { ...BOOKING_COLUMNS, date: true, startTime: true, endTime: true, notes: true, openingHours: true },
      });
    case "transport":
      return db.transport.findUnique({ where: { id: target.id }, select: BOOKING_COLUMNS });
    case "accommodation":
      return db.accommodation.findUnique({ where: { id: target.id }, select: BOOKING_COLUMNS });
  }
}

/**
 * The fix's row, if the clicking Traveller may still change it: it exists,
 * on this Trip's real plan, outside any Surprise hidden from them
 * (requireRowAccess, the actions' own guard). Null otherwise, never a throw.
 */
async function reachableRow(target: FixTarget, tripId: string): Promise<FixRowWithPlan | null> {
  try {
    await requireRowAccess(target.kind, target.id, { realPlanOnly: true });
  } catch (err) {
    if (isNextControlFlow(err)) return null;
    throw err;
  }
  const row = await loadFixRow(target);
  return row && row.tripId === tripId && row.forkId === null ? row : null;
}

/** An action's own notFound() (its guard) is a clean "gone" failure, not a 404 page. */
async function guarded(run: () => Promise<ActionResult>, gone: string): Promise<ActionResult> {
  try {
    return await run();
  } catch (err) {
    if (isNextControlFlow(err)) return formFail(gone, "gone");
    throw err;
  }
}

function bookingPatch(fix: { bookingState: BookingState; bookBy?: string | null }) {
  return { bookingState: fix.bookingState, ...(fix.bookBy !== undefined ? { bookBy: fix.bookBy } : {}) };
}

/** R8: each fix kind is one existing action, run as the clicking Traveller. */
async function runFix(fix: SuggestedFix, row: FixRow): Promise<ActionResult> {
  switch (fix.kind) {
    case "item.times": {
      // A new day goes through rescheduleItem, which re-files the owning Stop (ADR 0049 rule 4).
      if (fix.date !== undefined && fix.date !== (row.date ?? null)) {
        const moved = await rescheduleItem(fix.itemId, fix.date);
        if (!moved.success) return moved;
      }
      const times = {
        ...(fix.startTime !== undefined ? { startTime: fix.startTime } : {}),
        ...(fix.endTime !== undefined ? { endTime: fix.endTime } : {}),
      };
      return Object.keys(times).length > 0 ? updateItem(fix.itemId, times) : ok();
    }
    case "item.bookingState":
      return updateItem(fix.id, bookingPatch(fix));
    case "transport.bookingState":
      return updateTransport(fix.id, bookingPatch(fix));
    case "accommodation.bookingState":
      return updateAccommodation(fix.id, bookingPatch(fix));
    case "item.openingHours":
      return setOpeningHours(fix.itemId, fix.hours);
    case "item.note":
      return updateItem(fix.itemId, { notes: appendedNote(row.notes ?? null, fix.append) });
  }
}

/** Put the touched fields back as `before` holds them, through the same actions. */
async function restoreSnapshot(fix: SuggestedFix, before: FixSnapshot, current: FixRow): Promise<ActionResult> {
  const target = fixTarget(fix);
  switch (before.kind) {
    case "times": {
      if (before.date !== (current.date ?? null)) {
        const moved = before.date ? await rescheduleItem(target.id, before.date) : await updateItem(target.id, { date: null });
        if (!moved.success) return moved;
      }
      if (before.startTime !== (current.startTime ?? null) || before.endTime !== (current.endTime ?? null)) {
        return updateItem(target.id, { startTime: before.startTime, endTime: before.endTime });
      }
      return ok();
    }
    case "booking": {
      // A derived state goes back to derived (null clears the choice, lib/booking-state-patch.ts).
      const patch = { bookingState: before.bookingStateSet ? (before.bookingState as BookingState) : null, bookBy: before.bookBy };
      if (target.kind === "transport") return updateTransport(target.id, patch);
      if (target.kind === "accommodation") return updateAccommodation(target.id, patch);
      return updateItem(target.id, patch);
    }
    case "openingHours":
      return setOpeningHours(target.id, parseOpeningHours(before.openingHours));
    case "note":
      return updateItem(target.id, { notes: before.notes });
  }
}

/**
 * R8 Apply: run the Finding's fix through the action it maps to, as the
 * clicking Traveller, with that action's own permission and Surprise guards.
 * The Finding is claimed first (OPEN → APPLIED), so it runs at most once.
 * A refusal releases the claim and comes back as the action's own failure.
 * On success the touched fields, before and after, are saved for Undo.
 */
export async function applyFinding(findingId: string): Promise<ActionResult> {
  const { user, finding, isLatest } = await requireFindingAccess(findingId);
  if (finding.state !== "OPEN") return formFail(COPY.handled, "handled");
  if (!isLatest) return formFail(COPY.replaced, "replaced");
  const fix = parseSuggestedFix(finding.suggestedFix);
  if (!fix) return formFail(COPY.noFix, "no-fix");
  const target = fixTarget(fix);
  const row = await reachableRow(target, finding.tripId);
  if (!row) return formFail(COPY.gone, "gone");
  const before = snapshotFor(fix, row);

  const claimed = await db.finding.updateMany({
    where: { id: finding.id, state: "OPEN" },
    data: { state: "APPLIED", stateById: user.id, stateAt: new Date(), undoPayload: null },
  });
  if (claimed.count === 0) return formFail(COPY.handled, "handled");

  const result = await guarded(() => runFix(fix, row), COPY.gone);
  const now = await loadFixRow(target);
  if (!result.success) {
    // A two-step fix (a move, then times) can fail half way: put back what landed.
    if (now && !sameSnapshot(snapshotFor(fix, now), before)) await guarded(() => restoreSnapshot(fix, before, now), COPY.gone);
    await db.finding.updateMany({
      where: { id: finding.id, state: "APPLIED", stateById: user.id },
      data: { state: "OPEN", stateById: null, stateAt: null },
    });
    return result;
  }
  const payload: UndoPayload = { fix, before, after: now ? snapshotFor(fix, now) : before };
  await db.finding.update({ where: { id: finding.id }, data: { undoPayload: JSON.stringify(payload) } });
  revalidateTrip(finding.tripId, "reviews");
  return ok();
}

export async function dismissFinding(findingId: string): Promise<ActionResult> {
  const { user, finding, isLatest } = await requireFindingAccess(findingId);
  if (finding.state !== "OPEN") return formFail(COPY.handled, "handled");
  if (!isLatest) return formFail(COPY.replaced, "replaced");
  const { count } = await db.finding.updateMany({
    where: { id: finding.id, state: "OPEN" },
    data: { state: "DISMISSED", stateById: user.id, stateAt: new Date() },
  });
  if (count === 0) return formFail(COPY.handled, "handled");
  revalidateTrip(finding.tripId, "reviews");
  return ok();
}

export async function undoFinding(findingId: string): Promise<ActionResult> {
  const { finding } = await requireFindingAccess(findingId);
  if (finding.state === "DISMISSED") {
    const { count } = await db.finding.updateMany({
      where: { id: finding.id, state: "DISMISSED" },
      data: { state: "OPEN", stateById: null, stateAt: null },
    });
    if (count === 0) return formFail(COPY.handled, "handled");
    revalidateTrip(finding.tripId, "reviews");
    return ok();
  }
  return formFail(COPY.nothing, "nothing");
}
