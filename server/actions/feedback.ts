"use server";

import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/guards";
import { isAdminEmail } from "@/lib/admin";
import { feedbackSite } from "@/lib/feedback-site";
import {
  createFeedbackNoteSchema,
  type CreateFeedbackNoteInput,
} from "@/lib/validations/feedback";
import { type ActionResult, fail, ok, validationResult } from "@/lib/action-result";
// The view shape, its Prisma selection and the mapper live in lib/ and not
// here: this module is `"use server"`, so every *value* it exports has to be
// an async function (Next publishes them as endpoints). `toView` is a pure
// mapper and has no business being callable over the network — see
// lib/feedback-view.ts.
import {
  REVIEW_SELECT,
  toReviewView,
  toView,
  VIEW_SELECT,
  type FeedbackNoteQueryRow,
  type FeedbackNoteView,
  type FeedbackReviewQueryRow,
  type FeedbackReviewView,
} from "@/lib/feedback-view";

// A type-only re-export, so the Feedback panel can keep importing the view
// shape alongside the actions it calls. Types are erased, which is why this
// does not trip the async-export rule above.
export type { FeedbackNoteView, FeedbackReviewView };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Write a Feedback note (ADR 0040).
 *
 * Deliberately does NOT record an Activity or revalidate any path: a Feedback
 * note is about the software, not the Trip, and no rendered view reads one.
 *
 * Upserts on `clientKey` so an offline flush replayed after a partial failure
 * lands once (ADR 0041).
 */
export async function createFeedbackNote(
  input: CreateFeedbackNoteInput,
): Promise<ActionResult<{ note: FeedbackNoteView }>> {
  const user = await requireUser();

  const parsed = createFeedbackNoteSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }
  const { clientKey, authoredAt, ...rest } = parsed.data;
  const site = feedbackSite();

  const row = await db.feedbackNote.upsert({
    where: { clientKey },
    update: {},
    create: {
      clientKey,
      authorId: user.id,
      authorName: user.name ?? null,
      authoredAt: new Date(authoredAt),
      ...rest,
      // After `...rest`, not before: `rest` comes from a schema that strips
      // unknown keys today, so the client can't smuggle a `site` through it —
      // but that's the schema's property, not this call's. Ordering `site`
      // last means the server's value wins even if the schema ever changes
      // (`.passthrough()`, or a real `site` field) and starts letting one
      // through.
      site,
      // Vetting (ADR 0040, amended 2026-09-29): an Admin's remark joins the
      // backlog at once; anyone else's waits for the operator to accept it
      // (`npm run feedback:accept`) or decline it (`feedback:resolve --wontfix`).
      // By author, never by site — a tester on beta is still a tester.
      status: isAdminEmail(user.email) ? "OPEN" : "NEEDS_REVIEW",
    },
    select: VIEW_SELECT,
  });

  return ok({ note: toView(row as FeedbackNoteQueryRow, user.id, site) });
}

/**
 * The caller's own Feedback notes, oldest first — the panel reads as a private
 * log to the operator, not a shared forum. An Admin (ADMIN_EMAILS) sees every
 * author's notes; `feedback:pull` reads the database directly and is
 * unaffected by this scoping.
 */
export async function listFeedbackNotes(): Promise<
  ActionResult<{ notes: FeedbackNoteView[] }>
> {
  const user = await requireUser();
  const site = feedbackSite();

  const rows = await db.feedbackNote.findMany({
    ...(isAdminEmail(user.email) ? {} : { where: { authorId: user.id } }),
    orderBy: { authoredAt: "asc" },
    select: VIEW_SELECT,
  });

  return ok({
    notes: (rows as FeedbackNoteQueryRow[]).map((row) => toView(row, user.id, site)),
  });
}

/**
 * Delete a Feedback note. Author-only: closing a note is a by-product of the
 * work being done (`npm run feedback:resolve`), never a tidy-up in the app —
 * so the only in-app removal is retracting something you wrote yourself.
 */
export async function deleteFeedbackNote(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const note = await db.feedbackNote.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });
  if (!note) {
    return fail({ _form: ["That feedback has already been removed."] });
  }
  if (note.authorId !== user.id) {
    return fail({ _form: ["You can only delete feedback you wrote."] });
  }

  await db.feedbackNote.delete({ where: { id } });
  return ok();
}

/**
 * Every Feedback note still at Needs review, oldest first, from every site —
 * the /admin list (spec 2026-10-02 §D; CONTEXT.md "Admin queue"). Admin-only
 * and read-only: accepting and declining stay with `npm run feedback:accept`
 * and `feedback:resolve`, the only writers of Feedback status (ADR 0040).
 */
export async function listFeedbackNeedingReview(): Promise<FeedbackReviewView[]> {
  await requireAdmin();
  const site = feedbackSite();

  const rows = await db.feedbackNote.findMany({
    where: { status: "NEEDS_REVIEW" },
    orderBy: { authoredAt: "asc" },
    select: REVIEW_SELECT,
  });

  return (rows as FeedbackReviewQueryRow[]).map((row) => toReviewView(row, site));
}
