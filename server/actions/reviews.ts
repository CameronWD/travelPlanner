"use server";

/**
 * Acting on a Review's Findings (spec 2026-10-17 R8, R10, R12): Dismiss,
 * Apply (R.12) and Undo. Open to everyone on the Trip (R12). Every write is
 * conditional on the state it read, so two Travellers clicking at once
 * can't both act. Apply and Dismiss only on the Trip's latest DONE Review
 * (decision 6); Undo on any.
 */
import { after } from "next/server";
import { isAiConfigured, reviewModel } from "@/lib/ai";
import { db } from "@/lib/db";
import { requireRowAccess, requireTripAccess } from "@/lib/guards";
import { requireFindingAccess } from "@/lib/review-reads";
import { parseSuggestedFix } from "@/lib/review/schema";
import {
  REVIEW_ACTION_COPY as COPY,
  appendedNote,
  fixFitsTarget,
  isStrandedApply,
  parseUndoPayload,
  fixTarget,
  sameSnapshot,
  snapshotFor,
  type FixRow,
  type FixSnapshot,
  type FixTarget,
  type UndoPayload,
} from "@/lib/review/fix";
import { REVIEW_MESSAGES } from "@/lib/review/messages";
import { runReview } from "@/lib/review/run";
import { beginReview } from "@/lib/review/start";
import { isChecklistFix, REVIEW_KINDS, type ReviewKind, type RowFix } from "@/lib/review/types";
import type { BookingState } from "@/lib/enum-values";
import { fail, FORM_ERROR_KEY, formFail, ok, type ActionResult } from "@/lib/action-result";
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
async function runFix(fix: RowFix, row: FixRow): Promise<ActionResult> {
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
async function restoreSnapshot(fix: RowFix, before: FixSnapshot, current: FixRow): Promise<ActionResult> {
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
  // A fix only ever changes the Finding's own row (lib/review/fix.ts fixFitsTarget), as the reads show it.
  if (!fix || !fixFitsTarget(fix, finding)) return formFail(COPY.noFix, "no-fix");
  // Task 5 replaces this: Apply doesn't yet add to a Checklist.
  if (isChecklistFix(fix)) return formFail(COPY.noFix, "no-fix");
  const target = fixTarget(fix);
  const row = await reachableRow(target, finding.tripId);
  if (!row) return formFail(COPY.gone, "gone");
  const before = snapshotFor(fix, row);

  const claimed = await db.finding.updateMany({
    where: { id: finding.id, state: "OPEN" },
    data: { state: "APPLIED", stateById: user.id, stateAt: new Date(), undoPayload: null },
  });
  if (claimed.count === 0) return formFail(COPY.handled, "handled");

  // Our claim, not yet completed by a saved payload: back to OPEN.
  const release = () =>
    db.finding.updateMany({
      where: { id: finding.id, state: "APPLIED", stateById: user.id, undoPayload: null },
      data: { state: "OPEN", stateById: null, stateAt: null },
    });
  // A half-landed two-step fix (the move went through, then a refusal or a
  // throw) puts the day back, the times as they are now. Never throws.
  const undoLandedMove = async () => {
    const now = await loadFixRow(target);
    const rollback = now ? landedStep(fix, before, fix.kind === "item.times" ? fix.date : undefined, now) : null;
    if (rollback && now) await guarded(() => restoreSnapshot(fix, rollback, now), COPY.gone);
  };
  try {
    const result = await guarded(() => runFix(fix, row), COPY.gone);
    if (!result.success) {
      await undoLandedMove();
      await release();
      return result;
    }
    const now = await loadFixRow(target);
    const payload: UndoPayload = { fix, before, after: now ? snapshotFor(fix, now) : before };
    // Only onto our own claim, still waiting for its payload. A claim older
    // than the 5-minute stranded cutoff (lib/review/fix.ts isStrandedApply)
    // may have been released by an Undo meanwhile: the request that made it
    // is killed at the page's maxDuration (300 s), so that is only ever a
    // dead Apply's claim. Should a late one still get here, the condition
    // refuses to write a payload onto a Finding that is no longer ours (Open
    // again, or applied by someone else); the fix itself has landed, as the
    // plan shows.
    await db.finding.updateMany({
      where: { id: finding.id, state: "APPLIED", stateById: user.id, undoPayload: null },
      data: { undoPayload: JSON.stringify(payload) },
    });
  } catch (err) {
    // Never strand the Finding as APPLIED with nothing to undo (a Prisma
    // error, an unexpected throw), and never leave a moved day behind it.
    await undoLandedMove().catch(() => undefined);
    await release().catch(() => undefined);
    throw err;
  }
  revalidateTrip(finding.tripId, "reviews");
  return ok();
}

/**
 * After a refused (or thrown) change from `from` towards the day `toDate`,
 * the snapshot to restore when a step of OUR change landed, or null. Only a
 * two-step times change can half-land: the move went through, the times were
 * refused. Then only the day goes back, the times as they are now. A refused
 * single-step change wrote nothing, so a difference from `from` is someone
 * else's edit, left alone. Apply passes (before, the fix's date); Undo passes
 * (after, before's date).
 */
function landedStep(fix: RowFix, from: FixSnapshot, toDate: string | null | undefined, now: FixRow): FixSnapshot | null {
  if (fix.kind !== "item.times" || from.kind !== "times" || toDate === undefined || from.date === toDate) return null;
  const current = snapshotFor(fix, now);
  if (current.kind !== "times" || current.date !== toDate) return null;
  return { ...current, date: from.date };
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

/**
 * Undo: a Dismiss reopens (latest Review only, as Dismiss); an Apply restores
 * the fields it changed (unless they changed since) and reopens, on any
 * Review. An Apply that never finished (no payload, claimed long ago) is
 * released back to OPEN.
 */
export async function undoFinding(findingId: string): Promise<ActionResult> {
  const { finding, isLatest } = await requireFindingAccess(findingId);
  if (finding.state === "DISMISSED") {
    if (!isLatest) return formFail(COPY.replaced, "replaced");
    const { count } = await db.finding.updateMany({
      where: { id: finding.id, state: "DISMISSED" },
      data: { state: "OPEN", stateById: null, stateAt: null },
    });
    if (count === 0) return formFail(COPY.handled, "handled");
    revalidateTrip(finding.tripId, "reviews");
    return ok();
  }
  if (finding.state !== "APPLIED") return formFail(COPY.nothing, "nothing");
  const payload = parseUndoPayload(finding.undoPayload);
  if (!payload) {
    if (!isStrandedApply(finding, new Date())) return formFail(COPY.applying, "applying");
    // A timeout stranded the claim: nothing was saved to undo, so just reopen it.
    const { count } = await db.finding.updateMany({
      where: { id: finding.id, state: "APPLIED", undoPayload: null, stateAt: finding.stateAt },
      data: { state: "OPEN", stateById: null, stateAt: null },
    });
    if (count === 0) return formFail(COPY.handled, "handled");
    revalidateTrip(finding.tripId, "reviews");
    return ok();
  }
  // No Apply has ever saved a checklist.add payload (applyFinding refuses it, above), so this is always a RowFix. Task 5 widens it.
  const fix = payload.fix as RowFix;
  const target = fixTarget(fix);
  const row = await reachableRow(target, finding.tripId);
  if (!row) return formFail(COPY.goneUndo, "gone");
  // Decision 7: never overwrite an edit made since Apply.
  if (!sameSnapshot(snapshotFor(fix, row), payload.after)) return formFail(COPY.changed, "changed");

  const claimed = await db.finding.updateMany({
    where: { id: finding.id, state: "APPLIED", undoPayload: finding.undoPayload },
    data: { state: "OPEN", stateById: null, stateAt: null, undoPayload: null },
  });
  if (claimed.count === 0) return formFail(COPY.handled, "handled");

  const result = await guarded(() => restoreSnapshot(fix, payload.before, row), COPY.goneUndo);
  if (!result.success) {
    // A two-step restore (a move back, then times) can fail half way: put the
    // day back, by Apply's own rule (landedStep). A refused single step wrote
    // nothing, so any difference now is someone else's edit, left alone.
    const current = await loadFixRow(target);
    const rollback = current
      ? landedStep(fix, payload.after, payload.before.kind === "times" ? payload.before.date : undefined, current)
      : null;
    if (rollback && current) await guarded(() => restoreSnapshot(fix, rollback, current), COPY.goneUndo);
    await db.finding.updateMany({
      where: { id: finding.id, state: "OPEN", stateById: null },
      data: { state: "APPLIED", stateById: finding.stateById, stateAt: finding.stateAt, undoPayload: finding.undoPayload },
    });
    return result;
  }
  revalidateTrip(finding.tripId, "reviews");
  return ok();
}

type StartReviewResult = ActionResult<{ reviewId: string; status: "RUNNING" }, { nextAvailableAt?: string | null }>;

/**
 * Start a Review of this Trip (spec 2026-10-17 R11, R12): anyone on the
 * Trip whose Review permission isn't Off, within a Limited account's
 * limits, while no other Review runs here. beginReview checks all three and
 * writes the RUNNING row in one locked transaction. Only once that has
 * committed does the job run, in next/server after(): after the response,
 * for as long as the calling page's or route's maxDuration allows (300 s on
 * the Reviews page and /api/mcp; the job stops itself at
 * REVIEW_RUN_BUDGET_MS). The job is a system job (lib/review/run.ts): it
 * reads no session and writes no Activity. The tab polls while the row is
 * RUNNING. Claude's review_trip calls this too (MCP tools call the app's
 * actions).
 */
export async function startReview(tripId: string, kind: ReviewKind): Promise<StartReviewResult> {
  const { user } = await requireTripAccess(tripId);
  if (!isAiConfigured()) return formFail(REVIEW_MESSAGES.notSetUp, "disabled");
  if (!(REVIEW_KINDS as readonly string[]).includes(kind)) return formFail(REVIEW_MESSAGES.badKind, "invalid");

  const begun = await beginReview(user.id, tripId, kind, reviewModel(kind));
  if (begun.kind === "off") return formFail(REVIEW_MESSAGES.off, "off");
  if (begun.kind === "running") return formFail(REVIEW_MESSAGES.running, "running");
  if (begun.kind === "limit") {
    return fail({ [FORM_ERROR_KEY]: [REVIEW_MESSAGES.limit] }, { code: "limit", nextAvailableAt: begun.nextAvailableAt?.toISOString() ?? null });
  }

  const { reviewId } = begun;
  after(() => runReview(reviewId));
  revalidateTrip(tripId, "reviews");
  return ok({ reviewId, status: "RUNNING" as const });
}
