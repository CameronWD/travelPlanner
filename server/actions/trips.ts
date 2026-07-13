"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";
import { requireUser, requireTripAccess } from "@/lib/guards";
import { buildDuplicatePlan } from "@/lib/duplicate-trip";
import { geocodePlaceDetailed } from "@/lib/geocode";
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

  const { name, startDate, endDate, homeCurrency } = parsed.data;

  const trip = await db.$transaction(async (tx) => {
    const newTrip = await tx.trip.create({
      data: {
        name,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        homeCurrency,
        createdById: user.id,
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
        const key = generateKey(trip.id, crypto.randomUUID(), `cover.${ext}`);
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
 * Delete a trip. Owner-only.
 *
 * Cascade-deletes all stops, items, costs, members, invites, etc. via Prisma's
 * onDelete: Cascade relations. After deletion, redirects to /trips.
 */
export async function deleteTrip(tripId: string): Promise<DeleteTripResult> {
  const { membership } = await requireTripAccess(tripId);

  if (membership.role !== "owner") {
    return { success: false, error: "Only the trip owner can delete the trip." };
  }

  // Best-effort: remove attachment blobs before the rows cascade away, so we
  // don't orphan files in storage. Failures here must not block the delete.
  const [tripRow, attachments] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { coverImageKey: true } }),
    db.attachment.findMany({
      where: { tripId, storageKey: { not: null } },
      select: { storageKey: true },
    }),
  ]);

  const storage = getStorage();

  const blobDeletes: Promise<void>[] = [];
  if (tripRow?.coverImageKey) {
    blobDeletes.push(storage.delete(tripRow.coverImageKey).catch(() => {}));
  }
  if (attachments.length > 0) {
    for (const a of attachments) {
      if (a.storageKey) blobDeletes.push(storage.delete(a.storageKey).catch(() => {}));
    }
  }
  if (blobDeletes.length > 0) {
    await Promise.all(blobDeletes);
  }

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
 * dates reset to null (rough skeleton). The duplicator becomes the owner;
 * co-traveller memberships are copied as-is.
 *
 * Accommodations, costs, FX rates and all history are dropped per ADR-0018.
 */
export async function duplicateTrip(
  sourceTripId: string,
  newName: string,
): Promise<DuplicateTripResult> {
  const { user } = await requireTripAccess(sourceTripId);

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

    // Owner = duplicator; copy every co-traveller membership too (ADR-0018).
    await tx.tripMember.create({ data: { tripId: trip.id, userId: user.id, role: "owner" } });
    for (const m of source.members) {
      if (m.userId === user.id) continue;
      await tx.tripMember.create({ data: { tripId: trip.id, userId: m.userId, role: m.role } });
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
