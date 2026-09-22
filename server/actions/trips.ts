"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";
import { scheduleBlobDeletion } from "@/lib/blob-retention";
import { requireUser, requireTripAccess, isTripOwnerOrAdmin } from "@/lib/guards";
import { buildDuplicatePlan } from "@/lib/duplicate-trip";
import { geocodePlaceDetailed } from "@/lib/geocode";
import { INVITE_EXPIRY_MS } from "@/lib/invite-expiry";
import { recordActivity } from "@/server/actions/activity";
import { recomputeChapterSpans } from "@/server/actions/stop-flow";
import {
  createTripSchema,
  tripSchema,
  type CreateTripInput,
  type TripInput,
} from "@/lib/validations/trip";
import { type ActionResult, validationResult } from "@/lib/action-result";

export type CreateTripResult = ActionResult<{ tripId: string }>;

/**
 * Server action: validate input, create a Trip and an owner TripMember for the
 * current user in a transaction, then redirect to the new trip overview.
 *
 * Returns a typed error result on validation failure so the form can show
 * errors inline. On success it redirects (Next.js redirect throws, so it never
 * actually returns the success object in production — but it's typed for test
 * purposes).
 */
export async function createTrip(
  input: CreateTripInput,
  coverFile?: File | null,
): Promise<CreateTripResult> {
  const user = await requireUser();

  const parsed = createTripSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { name, startDate, endDate, homeCurrency, homeName: rawHomeName, roundTrip } = parsed.data;

  let homeFields: { homeName: string; homeLat: number | null; homeLng: number | null; homeCountryCode: string | null } | null = null;
  const trimmedHome = rawHomeName?.trim();
  if (trimmedHome) {
    const geo = await geocodePlaceDetailed(trimmedHome);
    homeFields = {
      homeName: trimmedHome,
      homeLat: geo?.lat ?? null,
      homeLng: geo?.lng ?? null,
      homeCountryCode: geo?.countryCode ?? null,
    };
  }

  const trip = await db.$transaction(async (tx) => {
    const newTrip = await tx.trip.create({
      data: {
        name,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        homeCurrency,
        createdById: user.id,
        ...(homeFields ?? {}),
        ...(roundTrip !== undefined ? { roundTrip } : {}),
      },
    });

    await tx.tripMember.create({
      data: {
        tripId: newTrip.id,
        userId: user.id,
        role: "owner",
      },
    });

    return newTrip;
  });

  // Optional cover uploaded at creation time. A bad/oversized cover must never
  // fail trip creation — validate and skip silently on any problem.
  if (coverFile instanceof File && coverFile.size > 0) {
    const v = validateUpload({ mime: coverFile.type, size: coverFile.size });
    if (v.ok && coverFile.type.startsWith("image/")) {
      try {
        const bytes = Buffer.from(await coverFile.arrayBuffer());
        const ext = coverFile.type === "image/png" ? "png" : coverFile.type === "image/webp" ? "webp" : coverFile.type === "image/gif" ? "gif" : "jpg";
        const key = generateKey({ trip: trip.id }, crypto.randomUUID(), `cover.${ext}`);
        await getStorage().save(key, bytes, coverFile.type);
        await db.trip.update({ where: { id: trip.id }, data: { coverImageKey: key } });
      } catch {
        // Swallow — trip is already created; a missing cover is acceptable.
      }
    }
  }

  redirect(`/trips/${trip.id}`);

  // TypeScript: redirect() throws, but the return type still needs to match.
  // This line is unreachable in practice.
  return { success: true, tripId: trip.id };
}

// ---------------------------------------------------------------------------
// updateTrip
// ---------------------------------------------------------------------------

export type UpdateTripResult = ActionResult;

/**
 * Update a trip's name, dates, and home currency.
 *
 * Note: changing homeCurrency doesn't retro-convert already-snapshotted cost
 * rates (rateToHome on Cost rows). That's intentional — the budget page can
 * refresh rates explicitly when needed.
 */
export async function updateTrip(
  tripId: string,
  input: TripInput,
): Promise<UpdateTripResult> {
  await requireTripAccess(tripId);

  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { name, startDate, endDate, hardEndDate, homeCurrency, homeName: rawHomeName, roundTrip } = parsed.data;

  // Home base update logic:
  //   - key absent (undefined)  → leave homeName + coords completely unchanged
  //   - explicit ""             → clear homeName + coords to null
  //   - non-empty, same as before → only update homeName, leave coords untouched
  //   - non-empty, changed      → geocode + set coords

  // homeNameUpdate is the value we'll write to the DB, or the sentinel
  // SKIP_HOME_UPDATE when the key was absent.
  const SKIP_HOME_UPDATE = Symbol("SKIP_HOME_UPDATE");

  let homeUpdate: typeof SKIP_HOME_UPDATE | {
    homeName: string | null;
    coordFields: { homeLat: number | null; homeLng: number | null; homeCountryCode: string | null } | null;
  };

  if (rawHomeName === undefined) {
    // Key absent — do not touch the home base at all.
    homeUpdate = SKIP_HOME_UPDATE;
  } else {
    const nextHomeName = rawHomeName.trim() !== "" ? rawHomeName.trim() : null;

    const before = await db.trip.findUnique({ where: { id: tripId }, select: { homeName: true } });

    const nameChanged = nextHomeName !== null && nextHomeName !== before?.homeName;
    const nameCleared = nextHomeName === null;

    let coordFields: { homeLat: number | null; homeLng: number | null; homeCountryCode: string | null } | null = null;

    if (nameCleared) {
      // Explicitly clear the coords.
      coordFields = { homeLat: null, homeLng: null, homeCountryCode: null };
    } else if (nameChanged) {
      // Geocode the new name.
      const geo = await geocodePlaceDetailed(nextHomeName!);
      coordFields = geo
        ? { homeLat: geo.lat, homeLng: geo.lng, homeCountryCode: geo.countryCode }
        : { homeLat: null, homeLng: null, homeCountryCode: null };
    }
    // If name unchanged, coordFields stays null → coord fields omitted from update.

    homeUpdate = { homeName: nextHomeName, coordFields };
  }

  await db.trip.update({
    where: { id: tripId },
    data: {
      name,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      hardEndDate: hardEndDate ?? null,
      homeCurrency,
      ...(homeUpdate !== SKIP_HOME_UPDATE
        ? {
            homeName: homeUpdate.homeName,
            ...(homeUpdate.coordFields !== null ? homeUpdate.coordFields : {}),
          }
        : {}),
      ...(roundTrip !== undefined ? { roundTrip } : {}),
    },
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// setTripHardEndDate — focused write for the Plan overview's inline control
// ---------------------------------------------------------------------------

export type SetHardEndDateResult = { success: true } | { success: false; error: string };

/**
 * Set or clear a trip's hard end date. Pass null/"" to clear. Validates the
 * date is on or after the start date. Advisory only — never changes scheduling.
 */
export async function setTripHardEndDate(
  tripId: string,
  hardEndDate: string | null,
): Promise<SetHardEndDateResult> {
  await requireTripAccess(tripId);

  const value = hardEndDate && hardEndDate.trim() !== "" ? hardEndDate.trim() : null;
  if (value !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { success: false, error: "Date must be in YYYY-MM-DD format." };
    }
    const trip = await db.trip.findUnique({ where: { id: tripId }, select: { startDate: true } });
    if (!trip) {
      return { success: false, error: "Trip not found." };
    }
    if (trip.startDate && value < trip.startDate) {
      return { success: false, error: "Hard end date must be on or after the start date." };
    }
  }

  await db.trip.update({ where: { id: tripId }, data: { hardEndDate: value } });

  revalidatePath(`/trips/${tripId}/plan`);
  revalidatePath(`/trips/${tripId}/settings`);
  revalidatePath(`/trips/${tripId}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// deleteTrip
// ---------------------------------------------------------------------------

export type DeleteTripResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Delete a trip. Owner-only, plus any operator listed in ADMIN_EMAILS who is
 * already a member of the trip (ADR 0045) — membership is still required.
 *
 * Cascade-deletes all stops, items, costs, members, invites, etc. via Prisma's
 * onDelete: Cascade relations. After deletion, redirects to /trips.
 */
export async function deleteTrip(tripId: string): Promise<DeleteTripResult> {
  const { user, membership } = await requireTripAccess(tripId);

  // Owner, or an operator listed in ADMIN_EMAILS. Membership is still
  // required — requireTripAccess above already notFound()s for non-members,
  // and an admin gets no bypass of it (ADR 0045).
  if (!isTripOwnerOrAdmin(membership, user.email)) {
    return { success: false, error: "Only the trip owner can delete the trip." };
  }

  // Schedule attachment + cover blobs for retention/sweep (ARCH-DAT-3) before
  // the rows cascade away, rather than destroying them synchronously.
  // scheduleBlobDeletion never throws, so it never blocks the delete.
  const [tripRow, attachments] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { coverImageKey: true } }),
    db.attachment.findMany({
      where: { tripId, storageKey: { not: null } },
      select: { storageKey: true },
    }),
  ]);

  await scheduleBlobDeletion([
    tripRow?.coverImageKey,
    ...attachments.map((a) => a.storageKey),
  ]);

  await db.trip.delete({ where: { id: tripId } });

  redirect("/trips");

  // Unreachable — redirect() throws, return satisfies the type.
  return { success: true };
}

// ---------------------------------------------------------------------------
// duplicateTrip
// ---------------------------------------------------------------------------

export type DuplicateTripResult =
  | { success: true; tripId: string }
  | { success: false; error: string };

/**
 * Duplicate a trip. Creates a new trip with the same structure but with all
 * dates reset to null (rough skeleton). The duplicator alone becomes the
 * owner; every other source member gets a pending Invite on the copy rather
 * than automatic membership (ARCH-ADR-1) — carrying the Traveller list over
 * as live membership bypassed the consent ADR 0017 requires. A source member
 * whose email can't be resolved is skipped outright: neither Invite nor
 * membership. (ADR 0018's "co-traveller memberships are copied as-is" claim
 * is now stale and needs amending — tracked separately.)
 *
 * Accommodations, costs, FX rates and all history are dropped per ADR-0018.
 */
export async function duplicateTrip(
  sourceTripId: string,
  newName: string,
): Promise<DuplicateTripResult> {
  const { user, membership } = await requireTripAccess(sourceTripId);

  // Owner, or an operator listed in ADMIN_EMAILS. Same shape as deleteTrip
  // above, and for the same reason (ADR 0045): the Danger zone card carries
  // Duplicate as well as Delete, and a *rendering* gate on the settings page
  // is not an authorization check — the server action is directly callable by
  // any member. Without this, a Traveller could mint a fully-owned copy of
  // someone else's trip, members and all.
  if (!isTripOwnerOrAdmin(membership, user.email)) {
    return { success: false, error: "Only the trip owner can duplicate the trip." };
  }

  const source = await db.trip.findUnique({
    where: { id: sourceTripId },
    include: {
      members: { select: { userId: true, role: true } },
      chapters: true,
      stops: true,
      items: true,
      transports: true,
      checklistItems: true,
    },
  });
  if (!source) return { success: false, error: "Trip not found" };

  // Resolve emails for every OTHER source member up front — the source of
  // truth for who gets invited to the copy. A member id that doesn't resolve
  // to a User (e.g. a deleted account) is skipped below rather than silently
  // granted membership.
  const otherMemberIds = source.members.map((m) => m.userId).filter((id) => id !== user.id);
  const otherUsers =
    otherMemberIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: otherMemberIds } },
          select: { id: true, email: true },
        })
      : [];
  const emailByUserId = new Map(otherUsers.map((u) => [u.id, u.email]));

  const name = newName.trim() || `Copy of ${source.name}`;
  const plan = buildDuplicatePlan(
    {
      name: source.name,
      homeCurrency: source.homeCurrency,
      drivingWindingFactor: source.drivingWindingFactor,
      drivingAvgSpeedKph: source.drivingAvgSpeedKph,
      chapters: source.chapters,
      stops: source.stops,
      items: source.items.map((i) => ({ ...i })),
      transports: source.transports,
      checklistItems: source.checklistItems,
    },
    name,
  );

  const newTrip = await db.$transaction(async (tx) => {
    const trip = await tx.trip.create({ data: { ...plan.trip, createdById: user.id } });

    // Owner = duplicator. Every OTHER source member gets a pending Invite on
    // the copy instead of an automatic TripMember row (ARCH-ADR-1) — this is
    // what restores the consent ADR 0017 already requires for membership.
    await tx.tripMember.create({ data: { tripId: trip.id, userId: user.id, role: "owner" } });
    for (const m of source.members) {
      if (m.userId === user.id) continue;
      const email = emailByUserId.get(m.userId);
      // No resolvable email: skip entirely rather than silently falling back
      // to membership.
      if (!email) continue;
      try {
        await tx.invite.create({
          data: {
            tripId: trip.id,
            // User.email itself is never normalised (it's whatever the OAuth
            // provider reported), so lowercase here — matching inviteToTrip
            // (server/actions/invites.ts) and the deleteMany lookups in
            // removeTripMember/leaveTrip below, which key on
            // email.toLowerCase(). A mixed-case Invite.email would never
            // auto-accept (lib/invites.ts lowercases too) and would never get
            // cleaned up by those deleteMany calls.
            email: email.toLowerCase(),
            token: crypto.randomUUID(),
            role: m.role,
            expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
          },
        });
      } catch (err) {
        // (tripId, email) is unique, and a freshly-minted trip.id makes a
        // collision impossible in practice — but treat a P2002 as idempotent
        // success anyway, matching how inviteToGlobe handles the same race.
        if (!isUniqueConstraintError(err)) throw err;
      }
    }

    const chapterIdMap = new Map<string, string>();
    for (const c of plan.chapters) {
      const created = await tx.chapter.create({ data: { tripId: trip.id, ...c.data } });
      chapterIdMap.set(c.sourceId, created.id);
    }

    const stopIdMap = new Map<string, string>();
    for (const s of plan.stops) {
      const created = await tx.stop.create({
        data: { tripId: trip.id, chapterId: s.sourceChapterId ? chapterIdMap.get(s.sourceChapterId) ?? null : null, ...s.data },
      });
      stopIdMap.set(s.sourceId, created.id);
    }

    for (const it of plan.items) {
      await tx.item.create({
        data: { tripId: trip.id, stopId: it.sourceStopId ? stopIdMap.get(it.sourceStopId) ?? null : null, ...it.data },
      });
    }

    for (const t of plan.transports) {
      await tx.transport.create({
        data: {
          tripId: trip.id,
          fromStopId: t.sourceFromStopId ? stopIdMap.get(t.sourceFromStopId) ?? null : null,
          toStopId: t.sourceToStopId ? stopIdMap.get(t.sourceToStopId) ?? null : null,
          ...t.data,
        },
      });
    }

    for (const c of plan.checklistItems) {
      await tx.checklistItem.create({ data: { tripId: trip.id, ...c.data } });
    }

    return trip;
  });

  // Note: "TRIP" is not a valid ActivityEntityType (valid: STOP, ITEM, TRANSPORT,
  // ACCOMMODATION, CHAPTER, COST, NOTE), so recordActivity is omitted here.
  // This is a best-effort concern that must never break the mutation.
  revalidatePath("/trips");
  return { success: true, tripId: newTrip.id };
}

// ---------------------------------------------------------------------------
// setChaptersEnabled
// ---------------------------------------------------------------------------

export type SetChaptersEnabledResult = UpdateTripResult;

/**
 * Turn chapters on/off for a trip. Chapters are opt-in (spec 2026-08-24): off
 * by default for new trips, backfilled true for trips that already had
 * chapters (see the 20260824000000_chapters_enabled migration).
 *
 * Turning chapters back ON self-heals stale date bands (ADR 0021 §4) by
 * recomputing chapter spans for the real plan and every fork — chapters may
 * have kept changing underneath a hidden band while the toggle was off.
 * Turning chapters OFF only flips the flag; no data is touched.
 */
export async function setChaptersEnabled(tripId: string, enabled: boolean): Promise<SetChaptersEnabledResult> {
  await requireTripAccess(tripId);

  await db.$transaction(async (tx) => {
    await tx.trip.update({ where: { id: tripId }, data: { chaptersEnabled: enabled } });

    if (enabled) {
      // Bands may have gone stale while hidden — self-heal every plan (ADR 0021 §4).
      await recomputeChapterSpans(tx, tripId, null);
      const forks = await tx.fork.findMany({ where: { tripId }, select: { id: true } });
      for (const fork of forks) {
        await recomputeChapterSpans(tx, tripId, fork.id);
      }
    }
  });

  // "TRIP" isn't a valid ActivityEntityType (see the note in duplicateTrip
  // above); CHAPTER is the closest fit for this chapter-domain trip setting,
  // mirroring the bulk-summary pattern chapters.ts uses for trip-wide changes.
  await recordActivity({
    tripId,
    verb: "UPDATED",
    entityType: "CHAPTER",
    entityId: null,
    entityLabel: "",
    changes: { summary: enabled ? "Turned chapters on" : "Turned chapters off" },
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/plan`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// removeTripMember / leaveTrip
// ---------------------------------------------------------------------------
//
// CAVEAT (ARCH-DAT-1a): these are the first two actions in the codebase that
// mutate Trip membership. `requireTripAccess` is `cache()`-memoised per
// `tripId` for the lifetime of the request (see its doc comment in
// lib/guards.ts) — calling it again after the membership row is gone would
// silently return yesterday's (still-a-member) answer. So each action calls
// requireTripAccess exactly once, before the mutation, and never again.
// Anything that needs a post-mutation membership answer must query
// db.tripMember directly rather than go back through the guard.

export type RemoveTripMemberResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Remove a Traveller from a trip. Owner-only (plus an ADMIN_EMAILS operator
 * who is already a member, ADR 0045) — same predicate as deleteTrip/
 * duplicateTrip/inviteToTrip. The owner cannot remove themselves; there is no
 * ownership-transfer feature yet, so that would strand the trip with no owner.
 *
 * Drops only the TripMember row — authored Journal entries, notes and
 * attachments keep their authorId FKs, so nothing orphans (ADR: content
 * survives the author leaving).
 *
 * Also deletes any still-pending Invite for the removed Traveller's email on
 * this trip. Without this, a stale Invite would silently re-admit them the
 * next time they sign in with that email (this matters more once a pending
 * Invite is sufficient to create an account on the deployment — Task 13).
 * An already-accepted Invite (the historical record of how they joined) is
 * left alone, same as cancelInvite's convention.
 */
export async function removeTripMember(
  tripId: string,
  userId: string,
): Promise<RemoveTripMemberResult> {
  const { user, membership } = await requireTripAccess(tripId);

  if (!isTripOwnerOrAdmin(membership, user.email)) {
    return { success: false, error: "Only the trip owner can remove a Traveller." };
  }

  if (userId === user.id && membership.role === "owner") {
    return {
      success: false,
      error: "You can't remove yourself as the owner — transfer ownership to another Traveller first.",
    };
  }

  // Uncached, direct lookup — deliberately not routed back through
  // requireTripAccess (see the CAVEAT above).
  const target = await db.user.findUnique({ where: { id: userId }, select: { email: true } });

  await db.tripMember.deleteMany({ where: { tripId, userId } });

  if (target?.email) {
    await db.invite.deleteMany({
      where: { tripId, email: target.email.toLowerCase(), acceptedAt: null },
    });
  }

  revalidatePath(`/trips/${tripId}/settings`);
  revalidatePath(`/trips/${tripId}`);

  return { success: true };
}

export type LeaveTripResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Leave a trip the current user is a member of. The owner cannot leave
 * without transferring ownership first (not built yet) — otherwise the trip
 * is left with no owner. Any other Traveller can leave freely.
 *
 * Deletes only the caller's own TripMember row (their authored content stays,
 * same as removeTripMember) and any still-pending Invite for their own email
 * on this trip, for the same re-admission reason removeTripMember does.
 *
 * Does NOT redirect server-side — it returns a typed result like the rest of
 * this file's non-redirecting actions, so the caller (client UI) can navigate
 * after a successful leave.
 */
export async function leaveTrip(tripId: string): Promise<LeaveTripResult> {
  const { user, membership } = await requireTripAccess(tripId);

  if (membership.role === "owner") {
    return {
      success: false,
      error: "As the owner, you can't leave this trip — transfer ownership to another Traveller first.",
    };
  }

  await db.tripMember.deleteMany({ where: { tripId, userId: user.id } });

  if (user.email) {
    await db.invite.deleteMany({
      where: { tripId, email: user.email.toLowerCase(), acceptedAt: null },
    });
  }

  revalidatePath(`/trips/${tripId}/settings`);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");

  return { success: true };
}

/**
 * True for a Prisma unique-constraint violation (P2002). Checked structurally
 * (by `code`) rather than via `instanceof` so it stays driver-adapter-agnostic
 * and trivially mockable in tests.
 *
 * NOTE: this helper is intentionally inlined here (and in lib/invites.ts,
 * lib/globe-invites.ts, server/actions/globe.ts) — consolidation into a
 * shared util is tracked separately.
 */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
