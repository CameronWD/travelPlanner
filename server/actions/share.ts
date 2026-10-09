"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { type ActionResult, ok, fail } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Share link actions (ADR 0051)
//
// A trip holds many share links — one per audience, each labelled and scoped
// by three dials. Every mutation is scoped to { id, tripId } so a linkId from
// another trip can never be reached through this trip's access check.
// Money, notes, confirmations and booking refs are never shared on any link;
// that floor is enforced where the public page queries, not here.
// ---------------------------------------------------------------------------

export interface ShareLinkView {
  id: string;
  token: string;
  label: string;
  includeAccommodation: boolean;
  includeTransport: boolean;
  includeDailyPlans: boolean;
  includeJournal: boolean;
  showTravellers: boolean;
  includeContacts: boolean;
  createdAt: string; // ISO
}

export interface ShareScopeInput {
  includeAccommodation?: boolean;
  includeTransport?: boolean;
  includeDailyPlans?: boolean;
  /** "How it's going" Journal section (ADR 0051 amendment) — off by default, unlike the other three dials. */
  includeJournal?: boolean;
  /** "Show who's going" (ADR 0051 amendment 2026-09-30) — off by default. */
  showTravellers?: boolean;
  /** "Contact details" (spec 2026-10-02 §E) — phone numbers under each Traveller; off by default and only honoured with showTravellers. */
  includeContacts?: boolean;
}

const LABEL_MAX = 60;

const LINK_SELECT = {
  id: true,
  token: true,
  label: true,
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  includeJournal: true,
  showTravellers: true,
  includeContacts: true,
  createdAt: true,
} as const;

type LinkRow = {
  id: string;
  token: string;
  label: string;
  includeAccommodation: boolean;
  includeTransport: boolean;
  includeDailyPlans: boolean;
  includeJournal: boolean;
  showTravellers: boolean;
  includeContacts: boolean;
  createdAt: Date;
};

function toView(row: LinkRow): ShareLinkView {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** Trimmed label, or null when blank/too long — the caller turns null into a field error. */
function cleanLabel(raw: string): string | null {
  const label = raw.trim();
  if (!label || label.length > LABEL_MAX) return null;
  return label;
}

function labelError() {
  return fail({
    label: [`Give this link a label (1–${LABEL_MAX} characters): who is it for?`],
  });
}

function scopeData(input: ShareScopeInput) {
  const data: Record<string, boolean> = {};
  if (input.includeAccommodation !== undefined) data.includeAccommodation = input.includeAccommodation;
  if (input.includeTransport !== undefined) data.includeTransport = input.includeTransport;
  if (input.includeDailyPlans !== undefined) data.includeDailyPlans = input.includeDailyPlans;
  if (input.includeJournal !== undefined) data.includeJournal = input.includeJournal;
  if (input.showTravellers !== undefined) data.showTravellers = input.showTravellers;
  if (input.includeContacts !== undefined) data.includeContacts = input.includeContacts;
  return data;
}

/** All of a trip's share links, oldest first. Access-checked. */
export async function listShareLinks(tripId: string): Promise<ShareLinkView[]> {
  await requireTripAccess(tripId);
  const rows = await db.shareLink.findMany({
    where: { tripId },
    orderBy: { createdAt: "asc" },
    select: LINK_SELECT,
  });
  return rows.map(toView);
}

/** Create a labelled, scoped link. Dials default on. Access-checked. */
export async function createShareLink(
  tripId: string,
  input: { label: string } & ShareScopeInput,
): Promise<ActionResult<{ link: ShareLinkView }>> {
  await requireTripAccess(tripId);
  const label = cleanLabel(input.label);
  if (!label) return labelError();

  const row = await db.shareLink.create({
    data: {
      tripId,
      token: crypto.randomUUID(),
      label,
      includeAccommodation: input.includeAccommodation ?? true,
      includeTransport: input.includeTransport ?? true,
      includeDailyPlans: input.includeDailyPlans ?? true,
      // Off by default (ADR 0051 amendment) — unlike the other three dials,
      // a new link does not get the Journal unless asked for.
      includeJournal: input.includeJournal ?? false,
      // Off by default (ADR 0051 amendment 2026-09-30), like includeJournal.
      showTravellers: input.showTravellers ?? false,
      includeContacts: input.includeContacts ?? false,
    },
    select: LINK_SELECT,
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return ok({ link: toView(row) });
}

/** Rename a link and/or move its dials. Access-checked; scoped to the trip. */
export async function updateShareLink(
  tripId: string,
  linkId: string,
  input: { label?: string } & ShareScopeInput,
): Promise<ActionResult<{ link: ShareLinkView }>> {
  await requireTripAccess(tripId);

  const data: Record<string, string | boolean> = scopeData(input);
  if (input.label !== undefined) {
    const label = cleanLabel(input.label);
    if (!label) return labelError();
    data.label = label;
  }

  if (Object.keys(data).length === 0) {
    const row = await db.shareLink.findFirst({
      where: { id: linkId, tripId },
      select: LINK_SELECT,
    });
    if (!row) return fail({ form: ["Share link not found."] });
    return ok({ link: toView(row) });
  }

  const { count } = await db.shareLink.updateMany({
    where: { id: linkId, tripId },
    data,
  });
  if (count === 0) return fail({ form: ["Share link not found."] });

  const row = await db.shareLink.findFirst({
    where: { id: linkId, tripId },
    select: LINK_SELECT,
  });
  if (!row) return fail({ form: ["Share link not found."] });

  revalidatePath(`/trips/${tripId}/settings`);
  return ok({ link: toView(row) });
}

/** Replace one link's token. The old URL dies immediately; siblings are untouched. */
export async function rotateShareLink(
  tripId: string,
  linkId: string,
): Promise<ActionResult<{ link: ShareLinkView }>> {
  await requireTripAccess(tripId);

  const { count } = await db.shareLink.updateMany({
    where: { id: linkId, tripId },
    data: { token: crypto.randomUUID() },
  });
  if (count === 0) return fail({ form: ["Share link not found."] });

  const row = await db.shareLink.findFirst({
    where: { id: linkId, tripId },
    select: LINK_SELECT,
  });
  if (!row) return fail({ form: ["Share link not found."] });

  revalidatePath(`/trips/${tripId}/settings`);
  return ok({ link: toView(row) });
}

/** Delete one link. No-op-safe: revoking an already-gone link still returns ok(). */
export async function revokeShareLink(
  tripId: string,
  linkId: string,
): Promise<ActionResult> {
  await requireTripAccess(tripId);

  await db.shareLink.deleteMany({ where: { id: linkId, tripId } });

  revalidatePath(`/trips/${tripId}/settings`);
  return ok();
}
