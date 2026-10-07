"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";
import { requireUser, requireTripAccess, isTripOwnerOrAdmin } from "@/lib/guards";
import { buildDuplicatePlan } from "@/lib/duplicate-trip";
import { geocodePlaceDetailed, paceNominatim } from "@/lib/geocode";
import { assignTripSlug } from "@/lib/trip-slug-store";
import { tripPath } from "@/lib/trip-path";
import { INVITE_EXPIRY_MS } from "@/lib/invite-expiry";
import { todayISO } from "@/lib/dates";
import { roughStopRows, type RoughStopSeed } from "@/lib/new-trip/rough-stops";
import { routeStopsFromShare } from "@/server/actions/copy-route-from-share";
import { recordActivity } from "@/server/actions/activity";
import { recomputeChapterSpans } from "@/server/actions/stop-flow";
import {
  createTripSchema,
  tripSchema,
  MAX_NEW_TRIP_STOPS,
  type CreateTripInput,
  type TripInput,
} from "@/lib/validations/trip";
import { type ActionResult, fail, validationResult } from "@/lib/action-result";

export type CreateTripResult = ActionResult<{ tripId: string; href: Route }>;

/**
 * Server action: validate input, create a Trip, an owner TripMember and any
 * rough Stops for the current user in a transaction, and return the trip id
 * plus where the caller should navigate. Never calls redirect() itself — the
 * New trip flow navigates once its promise resolves, so it can play its
 * create motion first.
 *
 * Returns a typed error result on validation failure so the form can show
 * errors inline.
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

  const {
    name,
    startDate,
    endDate,
    homeCurrency,
    homeName: rawHomeName,
    roundTrip,
    roughMonth,
    homeLat,
    homeLng,
    homeCountryCode,
    fromShareToken,
  } = parsed.data;

  let sharedRoute: Awaited<ReturnType<typeof routeStopsFromShare>> = null;
  if (fromShareToken) {
    sharedRoute = await routeStopsFromShare(fromShareToken);
    if (!sharedRoute) {
      return fail({ form: ["That share link isn't available any more — start from scratch instead."] });
    }
  }
  // Never trust client-sent stops for a Route copy: rebuild them from the
  // public projection (spec §E.3), capped like typed places are.
  const stops: RoughStopSeed[] | undefined = sharedRoute
    ? sharedRoute.stops.slice(0, MAX_NEW_TRIP_STOPS).map((s) => ({
        name: s.name,
        country: s.country,
        lat: s.lat ?? undefined,
        lng: s.lng ?? undefined,
        nights: s.nights,
      }))
    : parsed.data.stops;

  let homeFields: { homeName: string; homeLat: number | null; homeLng: number | null; homeCountryCode: string | null } | null = null;
  const trimmedHome = rawHomeName?.trim();
  if (trimmedHome && homeLat !== undefined && homeLng !== undefined) {
    homeFields = {
      homeName: trimmedHome,
      homeLat,
      homeLng,
      homeCountryCode: homeCountryCode ?? null,
    };
  } else if (trimmedHome) {
    const geo = await geocodePlaceDetailed(trimmedHome);
    homeFields = {
      homeName: trimmedHome,
      homeLat: geo?.lat ?? null,
      homeLng: geo?.lng ?? null,
      homeCountryCode: geo?.countryCode ?? null,
    };
  }

  // Never geocode while holding a transaction (ADR 0007) — locate every rough
  // Stop up front, before the trip is created.
  const located = stops?.length ? await locateRoughStops(stops) : [];
  const stopRows = roughStopRows(located, { startDate, endDate });

  const { trip, slug } = await db.$transaction(async (tx) => {
    const newTrip = await tx.trip.create({
      data: {
        name,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        homeCurrency,
        createdById: user.id,
        roughMonth: startDate ? null : (roughMonth ?? null),
        ...(homeFields ?? {}),
        ...(roundTrip !== undefined ? { roundTrip } : {}),
        ...(sharedRoute ? { sourceShareLinkId: sharedRoute.linkId } : {}),
      },
    });

    await tx.tripMember.create({
      data: {
        tripId: newTrip.id,
        userId: user.id,
        role: "owner",
      },
    });

    for (const row of stopRows) {
      await tx.stop.create({ data: { tripId: newTrip.id, ...row } });
    }

    const slug = await assignTripSlug(tx, newTrip.id, name);
    return { trip: newTrip, slug };
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

  // A Route copy lands on the Plan to shape the copied Stops. Otherwise a
  // past trip with Stops goes to the Globe to see them land (Task 15).
  const isPast = !!endDate && endDate < todayISO();
  const href: Route = sharedRoute
    ? tripPath(slug, "/plan")
    : stopRows.length > 0 && isPast
      ? `/globe?added=${trip.id}`
      : tripPath(slug);
  return { success: true, tripId: trip.id, href };
}

async function locateRoughStops(stops: RoughStopSeed[]) {
  const out: RoughStopSeed[] = [];
  for (const s of stops) {
    if (s.lat !== undefined && s.lng !== undefined) {
      out.push(s);
      continue;
    }
    // A Route copy carries the country; a bare name ("Paris") can land anywhere.
    // ADR 0069: consecutive Nominatim calls are spaced ≥1 s.
    await paceNominatim();
    const geo = await geocodePlaceDetailed([s.name, s.country].filter(Boolean).join(", "));
    out.push({ ...s, lat: geo?.lat, lng: geo?.lng, countryCode: s.countryCode ?? geo?.countryCode ?? undefined });
  }
  return out;
}

// ---------------------------------------------------------------------------
// updateTrip
// ---------------------------------------------------------------------------

export type UpdateTripResult = ActionResult<{ slug?: string }>;

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
      // A Rough month falls away once the Trip has a start date (CONTEXT.md).
      ...(startDate ? { roughMonth: null } : {}),
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

  // Renaming re-derives the slug (ADR 0064). Re-deriving on every save is safe
  // and needs no extra read: an unchanged name maps to the slug this Trip
  // already owns (the store reuses own slugs), and a Trip created without one
  // during a deploy window gets one on its next save.
  const slug = await db.$transaction((tx) => assignTripSlug(tx, tripId, name));

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);

  return { success: true, slug };
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
 * Soft-delete a trip (ADR 0067). Owner-only, plus any operator listed in
 * ADMIN_EMAILS who is already a member of the trip (ADR 0045) — membership
 * is still required.
 *
 * Stamps `Trip.deletedAt` rather than deleting the row: every list and
 * token-gated read already filters `deletedAt: null`, so the Trip
 * disappears everywhere except the owner's Recently deleted section, where
 * it can be restored for 30 days. Blob retention is NOT scheduled here —
 * scheduling it now would let the 35-day sweep destroy a restorable Trip's
 * files; the daily `/api/cron/purge-trips` workflow (lib/trip-purge.ts)
 * schedules blobs only when the row is actually hard-deleted, 30 days after
 * `deletedAt`. After stamping, redirects to /trips.
 */
export async function deleteTrip(tripId: string): Promise<DeleteTripResult> {
  const { user, membership } = await requireTripAccess(tripId);

  // Owner, or an operator listed in ADMIN_EMAILS. Membership is still
  // required — requireTripAccess above already notFound()s for non-members,
  // and an admin gets no bypass of it (ADR 0045).
  if (!isTripOwnerOrAdmin(membership, user.email)) {
    return { success: false, error: "Only the trip owner can delete the trip." };
  }

  await db.trip.update({ where: { id: tripId }, data: { deletedAt: new Date() } });

  redirect("/trips");

  // Unreachable — redirect() throws, return satisfies the type.
  return { success: true };
}

// ---------------------------------------------------------------------------
// restoreTrip
// ---------------------------------------------------------------------------

export type RestoreTripResult =
  | { success: true; slug: string }
  | { success: false; error: string };

/**
 * Restore a Trip out of Recently deleted (ADR 0067). Clears `deletedAt` and
 * nothing else — Share links, Calendar feeds, membership and files come back
 * exactly as they were.
 *
 * Deliberately does NOT call `requireTripAccess`: that helper notFound()s for
 * a deleted Trip, which would make a deleted Trip impossible to restore.
 * Instead it looks up the caller's membership directly.
 */
export async function restoreTrip(tripId: string): Promise<RestoreTripResult> {
  const user = await requireUser();

  const membership = await db.tripMember.findFirst({
    where: { tripId, userId: user.id },
    select: { role: true },
  });

  if (!membership || !isTripOwnerOrAdmin(membership, user.email)) {
    return { success: false, error: "Only the trip owner can restore the trip." };
  }

  const trip = await db.trip.update({
    where: { id: tripId },
    data: { deletedAt: null },
    select: { slug: true },
  });

  revalidatePath("/trips");

  return { success: true, slug: trip.slug ?? tripId };
}

// ---------------------------------------------------------------------------
// duplicateTrip
// ---------------------------------------------------------------------------

export type DuplicateTripResult =
  | { success: true; tripId: string; slug: string }
  | { success: false; error: string };

/**
 * Duplicate a trip. Creates a new trip with the same structure but with all
 * dates reset to null (rough skeleton). The duplicator alone becomes the
 * owner; every other source member gets a pending Invite on the copy rather
 * than automatic membership (ARCH-ADR-1) — carrying the Traveller list over
 * as live membership bypassed the consent ADR 0017 requires. A source member
 * whose email can't be resolved is skipped outright: neither Invite nor
 * membership. (ADR 0018's "co-traveller memberships are copied as-is" claim
 * was superseded by its 2026-09-23 amendment on this branch.)
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

  const { trip: newTrip, slug } = await db.$transaction(async (tx) => {
    const trip = await tx.trip.create({ data: { ...plan.trip, createdById: user.id } });
    const slug = await assignTripSlug(tx, trip.id, name);

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
          // The leg's slot on the copy, on the copy's own Stop (spec 2026-10-04 §D).
          anchorStopId: t.sourceAnchorStopId ? stopIdMap.get(t.sourceAnchorStopId) ?? null : null,
          ...t.data,
        },
      });
    }

    for (const c of plan.checklistItems) {
      await tx.checklistItem.create({ data: { tripId: trip.id, ...c.data } });
    }

    return { trip, slug };
  });

  // Note: "TRIP" is not a valid ActivityEntityType (valid: STOP, ITEM, TRANSPORT,
  // ACCOMMODATION, CHAPTER, COST, NOTE), so recordActivity is omitted here.
  // This is a best-effort concern that must never break the mutation.
  revalidatePath("/trips");
  return { success: true, tripId: newTrip.id, slug };
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
// setForksEnabled
// ---------------------------------------------------------------------------

export type SetForksEnabledResult = UpdateTripResult;

/**
 * Turn plan variants (Forks) on/off for a trip. Opt-in (spec 2026-09-26 B3):
 * off by default for new trips, backfilled true for trips that already had a
 * Fork (see the 20260927000004_trip_forks_enabled migration).
 *
 * Only the flag flips — no data is touched. Turning it off leaves every Fork
 * dormant (hidden, and `?plan=` ignored); turning it back on brings them back.
 */
export async function setForksEnabled(tripId: string, enabled: boolean): Promise<SetForksEnabledResult> {
  await requireTripAccess(tripId);

  await db.trip.update({ where: { id: tripId }, data: { forksEnabled: enabled } });

  // "TRIP" isn't a valid ActivityEntityType (see duplicateTrip above); FORK is
  // the closest fit for this Fork-domain trip setting, as CHAPTER is for
  // setChaptersEnabled.
  await recordActivity({
    tripId,
    verb: "UPDATED",
    entityType: "FORK",
    entityId: null,
    entityLabel: "",
    changes: { summary: enabled ? "Turned plan variants on" : "Turned plan variants off" },
  });

  // The Fork switcher lives in the trip layout and every fork-aware page reads
  // the flag, so revalidate the whole trip subtree.
  revalidatePath(`/trips/${tripId}`, "layout");

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
 * duplicateTrip/inviteToTrip. The trip's owner can never be removed — not by
 * themselves, and not by an admin operator either (I1) — because there is no
 * ownership-transfer feature, so an ownerless trip is stranded for good.
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
      error: "You can't remove yourself as the owner — the Owner role can't be transferred to another Traveller yet.",
    };
  }

  // The TARGET's role, not the caller's (final fix wave, I1). The gate above
  // admits an ADMIN_EMAILS operator, and the self-check just above protects
  // only the caller — so an admin who is not the owner could remove the
  // Trip's owner and strand the Trip permanently: with members but no owner,
  // nothing can ever delete it, duplicate it, invite to it, delete a Stop or
  // promote a fork again, and there is no ownership transfer to recover with.
  // The settings UI hides the control, but this repo's own principle
  // (server/actions/access-requests.ts) is that hiding a control is not
  // access control. Uncached, direct lookup for the same reason as the
  // email lookup below — see the CAVEAT above.
  const targetMembership = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
    select: { role: true },
  });

  if (targetMembership?.role === "owner") {
    return {
      success: false,
      error:
        "You can't remove the trip's owner — a trip with no owner could never be deleted, duplicated or invited to again.",
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
 * Leave a trip the current user is a member of. The owner cannot leave at
 * all: the Owner role does not transfer (CONTEXT.md), so a trip they left
 * would have no owner and no way back. Any other Traveller can leave freely.
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
      error: "As the owner, you can't leave this trip — the Owner role can't be transferred to another Traveller yet.",
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
