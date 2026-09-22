/**
 * Persister for the real "Christmas in Europe 2026" trip.
 *
 * A focused subset of prisma/demo/persist.ts: one trip, one owner member, no
 * forks or globe, and none of the demo's multi-user "partner" upsert/vote
 * machinery. `addExistingUserAsMember` below adds Cam's real partner as a
 * plain TripMember — her account already exists, so it's a lookup-and-upsert,
 * never a User creation. Reuses the demo storage + cover helpers and the
 * DemoTrip data types. Additive: assertNoExistingRealTrip() refuses to run a
 * second time rather than deleting and recreating (see wipeRealTrip's docs
 * for why that path is dangerous and must not be wired into the seed).
 *
 * `@/lib/db` throws at module-evaluation time if DATABASE_URL isn't set — and
 * this project's sandbox has no local Postgres, so the only DATABASE_URL ever
 * available here points at production. Every function below that needs `db`
 * loads it via a lazy dynamic import instead of a top-level static import, so
 * merely importing this module (e.g. for a dry run) opens no connection and
 * needs no credentials.
 *
 * Verified by `tsc --noEmit` and `eslint`; exercised by prisma/seed-real.ts.
 */

import { getStorage, generateKey } from "@/lib/storage";
import { gradientPng } from "@/lib/demo/cover-image";
import type { DemoTrip } from "@/lib/demo/types";
import type { User } from "@prisma/client";

export const REAL_TRIP_NAME = "Christmas in Europe 2026";
export const REAL_USER = { email: "cammark.williams@gmail.com", name: "Cam" };
/** Cam's partner. Her account already exists; she is added directly as a member. */
export const REAL_PARTNER_EMAIL = "xanni99.m@hotmail.com";

/** Lazily load the Prisma client. Never import `@/lib/db` at module scope here. */
async function loadDb() {
  const { db } = await import("@/lib/db");
  return db;
}

/**
 * The date a Cost's money actually left the account. A paid Cost must carry a
 * date (see CONTEXT.md "Paid"), so when the descriptor doesn't record one we
 * fall back to a caller-supplied instant rather than inventing `now` inside
 * the persister — that kept the seed non-deterministic and silently discarded
 * real payment dates.
 */
export function resolvePaidAt(
  cost: { paid?: boolean; paidAt?: string | null } | null | undefined,
  fallback: Date,
): Date | null {
  if (!cost?.paid) return null;
  return cost.paidAt ? new Date(cost.paidAt) : fallback;
}

/** Upsert the real trip owner by email. */
export async function ensureRealUser(): Promise<User> {
  const db = await loadDb();
  return db.user.upsert({
    where: { email: REAL_USER.email },
    update: { name: REAL_USER.name },
    create: { email: REAL_USER.email, name: REAL_USER.name },
  });
}

/**
 * Refuse to write if a trip of this name already exists. The additive seed
 * path never deletes, so a second run would silently create a duplicate;
 * failing loudly is the safe outcome. Deliberately NOT wipeRealTrip() — that
 * function deletes real data and must never be pointed at production.
 */
export async function assertNoExistingRealTrip(name: string = REAL_TRIP_NAME): Promise<void> {
  const db = await loadDb();
  const existing = await db.trip.findMany({ where: { name }, select: { id: true } });
  if (existing.length > 0) {
    throw new Error(
      `Refusing to write: ${existing.length} trip(s) already named "${name}" ` +
        `(${existing.map((t) => t.id).join(", ")}). This seed is additive and never deletes. ` +
        `Remove or rename the existing trip in the app first.`,
    );
  }
}

/**
 * Add an already-registered user to a trip as a member. Deliberately does NOT
 * upsert a User — inviting someone who has never signed in is the Invite
 * flow's job, and silently creating an empty account here would be worse than
 * failing to add them. Returns whether a membership was created.
 */
export async function addExistingUserAsMember(
  tripId: string,
  email: string,
  role: "owner" | "member" = "member",
): Promise<boolean> {
  const db = await loadDb();
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return false;
  await db.tripMember.upsert({
    where: { tripId_userId: { tripId, userId: user.id } },
    update: {},
    create: { tripId, userId: user.id, role },
  });
  return true;
}

/**
 * Idempotent teardown: delete every trip named REAL_TRIP_NAME, scheduling its
 * attachment blobs for retention/sweep (ARCH-DAT-3, scripts/sweep-deleted-blobs.ts)
 * rather than destroying them synchronously. Safe on a fresh DB — the lookup
 * returns [] so nothing is deleted.
 *
 * DANGER: deletes real data. Not referenced by the additive seed path
 * (prisma/seed-real.ts) — kept only as a manual escape hatch, never wired in.
 *
 * ARCH-DAT-3 (fix round 1, C1): this used to hard-delete blobs directly —
 * the exact regression this task exists to close, and the most dangerous
 * instance of it, since this file's own docs (above) call it out as a path
 * meant to run against production. `scheduleBlobDeletion` is loaded lazily,
 * same as `db` (loadDb()) — this module must stay importable with no
 * DATABASE_URL set, and lib/blob-retention.ts imports @/lib/db at its own
 * top level, so a static import here would defeat that.
 */
export async function wipeRealTrip(): Promise<void> {
  const db = await loadDb();
  const { scheduleBlobDeletion } = await import("@/lib/blob-retention");
  const trips = await db.trip.findMany({ where: { name: REAL_TRIP_NAME }, select: { id: true } });
  for (const t of trips) {
    const atts = await db.attachment.findMany({
      where: { tripId: t.id, storageKey: { not: null } },
      select: { storageKey: true },
    });
    await scheduleBlobDeletion(atts.map((a) => a.storageKey));
    await db.trip.delete({ where: { id: t.id } });
  }
}

/**
 * Persist a DemoTrip under a single owner member. Handles the full DemoPlan
 * shape (chapters, stops, transports+costs, accommodations+costs, items+votes+
 * costs, standalone costs) plus exchange rates, cover gradient and the pre-trip
 * checklist. No forks. Votes and checklist assignments resolve to the single owner.
 */
export async function persistRealTrip(trip: DemoTrip, user: User, now: Date = new Date()): Promise<string> {
  const db = await loadDb();
  const id = new Map<string, string>();

  // --- Trip + owner member ---
  const dbTrip = await db.trip.create({
    data: {
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      hardEndDate: trip.hardEndDate ?? null,
      homeCurrency: trip.homeCurrency,
      homeName: trip.home?.name ?? null,
      homeLat: trip.home?.lat ?? null,
      homeLng: trip.home?.lng ?? null,
      homeCountryCode: trip.home?.countryCode ?? null,
      roundTrip: trip.roundTrip ?? true,
      createdById: user.id,
      members: { create: [{ userId: user.id, role: "owner" }] },
    },
  });
  const tripId = dbTrip.id;
  id.set(trip.key, tripId);

  // --- Cover gradient ---
  if (trip.coverGradient) {
    const storage = getStorage();
    const [top, bottom] = trip.coverGradient;
    const png = gradientPng(top, bottom);
    const coverKey = generateKey({ trip: tripId }, crypto.randomUUID(), "cover.png");
    await storage.save(coverKey, png, "image/png");
    await db.trip.update({ where: { id: tripId }, data: { coverImageKey: coverKey } });
  }

  // --- Exchange rates + rate lookup ---
  const rateMap = new Map<string, number>();
  for (const er of trip.exchangeRates ?? []) {
    await db.exchangeRate.create({
      data: { tripId, base: er.base, quote: er.quote, rate: er.rate, manual: er.manual, fetchedAt: new Date(er.fetchedAt) },
    });
    rateMap.set(er.base, er.rate);
  }
  const rateToHome = (currency: string): number | null => {
    if (currency === trip.homeCurrency) return null;
    const r = rateMap.get(currency);
    if (r === undefined) {
      console.warn(`persistRealTrip: no exchange rate for ${currency} — cost will not convert`);
      return null;
    }
    return r;
  };

  // --- Chapters ---
  for (const ch of trip.chapters) {
    const dbCh = await db.chapter.create({
      data: { tripId, name: ch.name, colour: ch.colour, startDate: ch.startDate ?? null, endDate: ch.endDate ?? null, sortOrder: ch.sortOrder },
    });
    id.set(ch.key, dbCh.id);
  }

  // --- Stops ---
  for (const s of trip.stops) {
    const chapterId = s.chapterKey ? (id.get(s.chapterKey) ?? null) : null;
    const dbStop = await db.stop.create({
      data: {
        tripId, name: s.name, country: s.country ?? null, countryCode: s.countryCode ?? null,
        lat: s.lat ?? null, lng: s.lng ?? null, timezone: s.timezone ?? null,
        arriveDate: s.arriveDate ?? null, departDate: s.departDate ?? null, nights: s.nights ?? null,
        sortOrder: s.sortOrder, pinned: s.pinned ?? false, chapterId,
        chapterSortOrder: s.chapterSortOrder ?? 0, notes: s.notes ?? null,
      },
    });
    id.set(s.key, dbStop.id);
  }

  // --- Transports (+ costs) ---
  for (const t of trip.transports) {
    const dbT = await db.transport.create({
      data: {
        tripId,
        fromStopId: t.fromStopKey ? (id.get(t.fromStopKey) ?? null) : null,
        toStopId: t.toStopKey ? (id.get(t.toStopKey) ?? null) : null,
        depIsHome: t.depIsHome ?? false, arrIsHome: t.arrIsHome ?? false,
        mode: t.mode, depPlace: t.depPlace ?? null, depAt: t.depAt ? new Date(t.depAt) : null,
        arrPlace: t.arrPlace ?? null, arrAt: t.arrAt ? new Date(t.arrAt) : null,
        depLat: t.depLat ?? null, depLng: t.depLng ?? null, arrLat: t.arrLat ?? null, arrLng: t.arrLng ?? null,
        reference: t.reference ?? null, notes: t.notes ?? null, sortOrder: t.sortOrder,
      },
    });
    id.set(t.key, dbT.id);
    if (t.cost) {
      await db.cost.create({
        data: {
          tripId, ownerType: "TRANSPORT", ownerId: dbT.id,
          costMinor: t.cost.costMinor, paidMinor: t.cost.paidMinor ?? null,
          currency: t.cost.currency, rateToHome: rateToHome(t.cost.currency),
          paidAt: resolvePaidAt(t.cost, now), category: t.cost.category ?? null,
        },
      });
    }
  }

  // --- Accommodations (+ costs) ---
  for (const a of trip.accommodations) {
    const stopId = id.get(a.stopKey);
    if (!stopId) continue;
    const dbA = await db.accommodation.create({
      data: {
        tripId, stopId, name: a.name, address: a.address ?? null,
        checkIn: a.checkIn, checkOut: a.checkOut, confirmation: a.confirmation ?? null,
        notes: a.notes ?? null, lat: a.lat ?? null, lng: a.lng ?? null,
      },
    });
    id.set(a.key, dbA.id);
    if (a.cost) {
      await db.cost.create({
        data: {
          tripId, ownerType: "ACCOMMODATION", ownerId: dbA.id,
          costMinor: a.cost.costMinor, paidMinor: a.cost.paidMinor ?? null,
          currency: a.cost.currency, rateToHome: rateToHome(a.cost.currency),
          paidAt: resolvePaidAt(a.cost, now), category: a.cost.category ?? null,
        },
      });
    }
  }

  // --- Items (+ costs + votes) ---
  for (const it of trip.items) {
    const stopId = it.stopKey ? (id.get(it.stopKey) ?? null) : null;
    const dbItem = await db.item.create({
      data: {
        tripId, stopId, title: it.title, category: it.category, date: it.date ?? null,
        startTime: it.startTime ?? null, endTime: it.endTime ?? null,
        lat: it.lat ?? null, lng: it.lng ?? null, address: it.address ?? null,
        link: it.link ?? null, booking: it.booking ?? null, notes: it.notes ?? null,
        sortOrder: it.sortOrder ?? 0,
      },
    });
    id.set(it.key, dbItem.id);
    if (it.cost) {
      await db.cost.create({
        data: {
          tripId, ownerType: "ITEM", ownerId: dbItem.id,
          costMinor: it.cost.costMinor, paidMinor: it.cost.paidMinor ?? null,
          currency: it.cost.currency, rateToHome: rateToHome(it.cost.currency),
          paidAt: resolvePaidAt(it.cost, now), category: it.cost.category ?? null,
        },
      });
    }
    for (const v of it.votes ?? []) {
      await db.vote.create({ data: { tripId, itemId: dbItem.id, userId: user.id, level: v.level } });
    }
  }

  // --- Standalone (OTHER) costs ---
  for (const c of trip.costs) {
    const ownerId = c.ownerType === "OTHER" ? null : c.ownerKey ? (id.get(c.ownerKey) ?? null) : null;
    await db.cost.create({
      data: {
        tripId, ownerType: c.ownerType, ownerId,
        costMinor: c.costMinor, paidMinor: c.paidMinor ?? null,
        currency: c.currency, rateToHome: rateToHome(c.currency),
        paidAt: resolvePaidAt(c, now), label: c.label ?? null, category: c.category ?? null,
      },
    });
  }

  // --- Pre-trip checklist ---
  let clSort = 0;
  for (const c of trip.checklist ?? []) {
    await db.checklistItem.create({
      data: {
        tripId, kind: c.kind, text: c.text, done: c.done,
        dueDate: c.dueDate ?? null, assignedToId: c.assignedTo ? user.id : null,
        sortOrder: clSort++,
      },
    });
  }

  return tripId;
}
