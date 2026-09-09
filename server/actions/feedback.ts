"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import type { FeedbackStatus } from "@/lib/enums";
import {
  createFeedbackNoteSchema,
  type CreateFeedbackNoteInput,
} from "@/lib/validations/feedback";
import { type ActionResult, fail, ok, validationResult } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A Feedback note as the Feedback panel sees it. Dates are ISO strings. */
export type FeedbackNoteView = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  authorId: string;
  authorName: string;
  status: FeedbackStatus;
  authoredAt: string;
};

type FeedbackNoteRow = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  authorId: string;
  status: string;
  authoredAt: Date;
  author: { name: string | null };
};

const VIEW_SELECT = {
  id: true,
  body: true,
  route: true,
  pageLabel: true,
  tripName: true,
  authorId: true,
  status: true,
  authoredAt: true,
  author: { select: { name: true } },
} as const;

function toView(row: FeedbackNoteRow): FeedbackNoteView {
  return {
    id: row.id,
    body: row.body,
    route: row.route,
    pageLabel: row.pageLabel,
    tripName: row.tripName,
    authorId: row.authorId,
    authorName: row.author.name ?? "Traveller",
    status: row.status as FeedbackStatus,
    authoredAt: row.authoredAt.toISOString(),
  };
}

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

  const row = await db.feedbackNote.upsert({
    where: { clientKey },
    update: {},
    create: {
      clientKey,
      authorId: user.id,
      authoredAt: new Date(authoredAt),
      ...rest,
    },
    select: VIEW_SELECT,
  });

  return ok({ note: toView(row as FeedbackNoteRow) });
}

/**
 * Every Feedback note, from every Traveller, oldest first — the panel reads as
 * a log. Signed-in access only; there is nothing per-user to scope.
 */
export async function listFeedbackNotes(): Promise<
  ActionResult<{ notes: FeedbackNoteView[] }>
> {
  await requireUser();

  const rows = await db.feedbackNote.findMany({
    orderBy: { authoredAt: "asc" },
    select: VIEW_SELECT,
  });

  return ok({ notes: (rows as FeedbackNoteRow[]).map(toView) });
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
