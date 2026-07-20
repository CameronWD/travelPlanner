/**
 * Demo data persister — wipe, globe, storage/attachment helpers.
 *
 * Maps pure demo data (from @/lib/demo/) to Prisma writes.
 * Verified by `tsc --noEmit` and `eslint`; exercised by the full seed (Task 11).
 *
 * Key design decisions:
 *   - `wipeDemo` is fully idempotent: safe on a fresh DB (all lookups guard for
 *     missing rows) and on a re-seed (blobs are deleted before rows so no
 *     orphaned storage objects remain).
 *   - `GlobeMember.userId` has a UNIQUE constraint (one globe per user, ADR 0023).
 *     `wipeDemo` deletes the Globe (cascades members) before re-persisting, so
 *     `persistGlobe` never hits a duplicate.
 *   - Attachment rows are created with `url: ""`, then the storage key and final
 *     URL are written back after the blob is saved — mirrors seed-ai-trip.ts exactly.
 */

import { db } from "@/lib/db";
import { getStorage, generateKey } from "@/lib/storage";
import { DEMO_TRIP_NAMES } from "@/lib/demo";
import type { DemoGlobe, DemoTrip, DemoPlan, Who } from "@/lib/demo/types";
import { gradientPng } from "@/lib/demo/cover-image";
import { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const USER_EMAILS: Record<Who, string> = {
  you: "you@example.com",
  partner: "partner@example.com",
};

// ---------------------------------------------------------------------------
// ensureUsers
// ---------------------------------------------------------------------------

/**
 * Upsert the two demo users by email address.
 * Returns them as `{ you, partner }` for use in subsequent persist calls.
 */
export async function ensureUsers(): Promise<{ you: User; partner: User }> {
  const you = await db.user.upsert({
    where: { email: USER_EMAILS.you },
    update: { name: "You" },
    create: { email: USER_EMAILS.you, name: "You" },
  });
  const partner = await db.user.upsert({
    where: { email: USER_EMAILS.partner },
    update: { name: "Partner" },
    create: { email: USER_EMAILS.partner, name: "Partner" },
  });
  return { you, partner };
}

// ---------------------------------------------------------------------------
// wipeDemo
// ---------------------------------------------------------------------------

/**
 * Idempotent teardown of all demo-seeded data.
 *
 * Order:
 *  1. Delete every Trip whose name is in DEMO_TRIP_NAMES:
 *     - Delete attachment blobs from storage first (non-null storageKey rows).
 *     - Then db.trip.delete (cascades all children).
 *  2. Delete the demo users' Globe (if it exists):
 *     - Find GlobeMember rows for the two demo user ids.
 *     - For each referenced globe, delete attachment blobs, then db.globe.delete.
 *
 * Safe on a fresh DB — all lookups return empty arrays / null so nothing throws.
 */
export async function wipeDemo(): Promise<void> {
  const storage = getStorage();

  // --- 1. Trips ------------------------------------------------------------
  const trips = await db.trip.findMany({
    where: { name: { in: DEMO_TRIP_NAMES } },
    select: { id: true },
  });

  for (const t of trips) {
    const atts = await db.attachment.findMany({
      where: { tripId: t.id, storageKey: { not: null } },
      select: { storageKey: true },
    });
    for (const a of atts) {
      if (a.storageKey) await storage.delete(a.storageKey);
    }
    await db.trip.delete({ where: { id: t.id } });
  }

  // --- 2. Globe ------------------------------------------------------------
  // Look up the demo users (may not exist on a fresh DB).
  const demoUsers = await db.user.findMany({
    where: { email: { in: Object.values(USER_EMAILS) } },
    select: { id: true },
  });

  if (demoUsers.length === 0) return; // nothing to wipe

  const memberRows = await db.globeMember.findMany({
    where: { userId: { in: demoUsers.map((u) => u.id) } },
    select: { globeId: true },
  });

  // Deduplicate globe ids (both users may belong to the same globe).
  const globeIds = [...new Set(memberRows.map((m) => m.globeId))];

  for (const globeId of globeIds) {
    const atts = await db.attachment.findMany({
      where: { globeId, storageKey: { not: null } },
      select: { storageKey: true },
    });
    for (const a of atts) {
      if (a.storageKey) await storage.delete(a.storageKey);
    }
    await db.globe.delete({ where: { id: globeId } });
  }
}

// ---------------------------------------------------------------------------
// saveAttachment
// ---------------------------------------------------------------------------

/**
 * Create an Attachment row, save the blob to storage, then update the row
 * with the final storageKey and URL. Mirrors the pattern in seed-ai-trip.ts.
 *
 * @param scope        `{ trip: id }` or `{ globe: id }` — sets tripId/globeId.
 * @param targetType   E.g. "MARKER", "TRIP", "STOP", …
 * @param targetId     The id of the target entity, or null if not applicable.
 * @param att          The attachment data from the demo spec.
 * @param uploadedById The user id of the uploader.
 */
export async function saveAttachment(
  scope: { trip: string } | { globe: string },
  targetType: string,
  targetId: string | null,
  att: { filename: string; mime: string; body: string },
  uploadedById: string,
): Promise<void> {
  const storage = getStorage();

  const created = await db.attachment.create({
    data: {
      tripId: "trip" in scope ? scope.trip : null,
      globeId: "globe" in scope ? scope.globe : null,
      targetType,
      targetId,
      filename: att.filename,
      mime: att.mime,
      size: Buffer.byteLength(att.body),
      url: "", // filled in below once we have the id
      uploadedById,
    },
  });

  const key = generateKey(scope, created.id, att.filename);
  await storage.save(key, Buffer.from(att.body), att.mime);

  await db.attachment.update({
    where: { id: created.id },
    data: { storageKey: key, url: `/api/attachments/${created.id}` },
  });
}

// ---------------------------------------------------------------------------
// persistGlobe
// ---------------------------------------------------------------------------

/**
 * Persist a DemoGlobe to the database.
 *
 * Creates:
 *  - Globe (createdById = users[globe.createdBy].id)
 *  - GlobeMember per member
 *  - Marker per marker (maps createdBy → user id)
 *  - GlobeInvite per invite (fresh UUID token, acceptedAt: null)
 *  - Attachments per marker via saveAttachment
 *
 * Returns a Map of demo marker key → created marker id.
 * This map is consumed by subsequent trip-persist tasks that resolve
 * `sourceMarkerKey` references.
 *
 * @param globe  The pure DemoGlobe descriptor.
 * @param users  The result of ensureUsers().
 */
export async function persistGlobe(
  globe: DemoGlobe,
  users: { you: User; partner: User },
): Promise<Map<string, string>> {
  const userFor = (who: Who): User => (who === "you" ? users.you : users.partner);

  // --- Globe ---------------------------------------------------------------
  const created = await db.globe.create({
    data: { createdById: userFor(globe.createdBy).id },
  });
  const globeId = created.id;

  // --- Members -------------------------------------------------------------
  for (const m of globe.members) {
    await db.globeMember.create({
      data: {
        globeId,
        userId: userFor(m.user).id,
        role: m.role,
      },
    });
  }

  // --- Markers -------------------------------------------------------------
  const markerKeyMap = new Map<string, string>();

  for (const m of globe.markers) {
    const marker = await db.marker.create({
      data: {
        globeId,
        title: m.title,
        category: m.category,
        note: m.note ?? null,
        link: m.link ?? null,
        timing: m.timing ?? null,
        lat: m.lat ?? null,
        lng: m.lng ?? null,
        city: m.city ?? null,
        country: m.country ?? null,
        countryCode: m.countryCode ?? null,
        createdById: userFor(m.createdBy).id,
      },
    });

    markerKeyMap.set(m.key, marker.id);

    // Marker attachments
    if (m.attachments && m.attachments.length > 0) {
      for (const att of m.attachments) {
        await saveAttachment(
          { globe: globeId },
          "MARKER",
          marker.id,
          att,
          userFor(m.createdBy).id,
        );
      }
    }
  }

  // --- Invites -------------------------------------------------------------
  if (globe.invites && globe.invites.length > 0) {
    for (const inv of globe.invites) {
      await db.globeInvite.create({
        data: {
          globeId,
          email: inv.email,
          token: crypto.randomUUID(),
          role: inv.role,
          acceptedAt: null,
        },
      });
    }
  }

  return markerKeyMap;
}

// ---------------------------------------------------------------------------
// persistTrip
// ---------------------------------------------------------------------------

/**
 * Persist a DemoTrip to the database.
 *
 * Creates the Trip and all plan entities (chapters, stops, transports,
 * accommodations, items, costs, votes), plus trip-scoped extras (notes,
 * checklist, packing templates, reminders, journal entries, attachments,
 * share link, calendar feed, invites), and forks via a reusable persistPlan
 * inner function.
 *
 * Key resolution: all entity keys (stops, chapters, transports, accommodations,
 * items, forks) are globally unique across the real plan and all forks — a
 * single trip-wide Map<Key,string> resolves them.  markerIds is seeded into
 * this map so sourceMarkerKey references resolve to globe marker ids.
 *
 * @param trip       The pure DemoTrip descriptor.
 * @param users      The result of ensureUsers().
 * @param markerIds  Globe marker key → db id (from persistGlobe).
 */
export async function persistTrip(
  trip: DemoTrip,
  users: { you: User; partner: User },
  markerIds: Map<string, string>,
): Promise<void> {
  const storage = getStorage();

  // Helper: resolve Who → user id.
  function who(w: Who): string {
    return w === "you" ? users.you.id : users.partner.id;
  }

  // Trip-wide key → created entity id map.  Seeded with globe marker ids so
  // sourceMarkerKey references resolve without a separate lookup.
  const id = new Map<string, string>(markerIds);

  // -------------------------------------------------------------------------
  // Step 1: Create Trip
  // -------------------------------------------------------------------------

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
      ...(trip.drivingWindingFactor !== undefined ? { drivingWindingFactor: trip.drivingWindingFactor } : {}),
      ...(trip.drivingAvgSpeedKph !== undefined ? { drivingAvgSpeedKph: trip.drivingAvgSpeedKph } : {}),
      createdById: who(trip.createdBy),
      members: {
        create: [
          { userId: who(trip.createdBy), role: "owner" },
          {
            userId: who(trip.createdBy === "you" ? "partner" : "you"),
            role: "member",
          },
        ],
      },
    },
  });
  const tripId = dbTrip.id;

  // Cover gradient image (if specified).
  if (trip.coverGradient) {
    const [top, bottom] = trip.coverGradient;
    const png = gradientPng(top, bottom);
    const coverKey = generateKey({ trip: tripId }, crypto.randomUUID(), "cover.png");
    await storage.save(coverKey, png, "image/png");
    await db.trip.update({ where: { id: tripId }, data: { coverImageKey: coverKey } });
  }

  // -------------------------------------------------------------------------
  // Step 2: Exchange rates
  // -------------------------------------------------------------------------

  // Build a local currency → rateToHome lookup for Cost rows.
  const rateMap = new Map<string, number>();
  for (const er of trip.exchangeRates ?? []) {
    await db.exchangeRate.create({
      data: {
        tripId,
        base: er.base,
        quote: er.quote,
        rate: er.rate,
        manual: er.manual,
        fetchedAt: new Date(er.fetchedAt),
      },
    });
    rateMap.set(er.base, er.rate);
  }

  function rateToHome(currency: string): number | null {
    if (currency === trip.homeCurrency) return null;
    return rateMap.get(currency) ?? null;
  }

  // -------------------------------------------------------------------------
  // Step 3: persistPlan — reusable inner function
  // -------------------------------------------------------------------------

  async function persistPlan(plan: DemoPlan, forkId?: string): Promise<void> {
    // --- Chapters ---
    for (const ch of plan.chapters) {
      const dbCh = await db.chapter.create({
        data: {
          tripId,
          forkId: forkId ?? null,
          name: ch.name,
          colour: ch.colour,
          startDate: ch.startDate ?? null,
          endDate: ch.endDate ?? null,
          sortOrder: ch.sortOrder,
        },
      });
      id.set(ch.key, dbCh.id);
    }

    // --- Stops ---
    for (const s of plan.stops) {
      const chapterId = s.chapterKey ? (id.get(s.chapterKey) ?? null) : null;
      const dbStop = await db.stop.create({
        data: {
          tripId,
          forkId: forkId ?? null,
          name: s.name,
          country: s.country ?? null,
          countryCode: s.countryCode ?? null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
          timezone: s.timezone ?? null,
          arriveDate: s.arriveDate ?? null,
          departDate: s.departDate ?? null,
          nights: s.nights ?? null,
          sortOrder: s.sortOrder,
          pinned: s.pinned ?? false,
          chapterId,
          chapterSortOrder: s.chapterSortOrder ?? 0,
          notes: s.notes ?? null,
        },
      });
      id.set(s.key, dbStop.id);
    }

    // --- Transports ---
    for (const t of plan.transports) {
      const dbT = await db.transport.create({
        data: {
          tripId,
          forkId: forkId ?? null,
          fromStopId: t.fromStopKey ? (id.get(t.fromStopKey) ?? null) : null,
          toStopId: t.toStopKey ? (id.get(t.toStopKey) ?? null) : null,
          depIsHome: t.depIsHome ?? false,
          arrIsHome: t.arrIsHome ?? false,
          mode: t.mode,
          depPlace: t.depPlace ?? null,
          depAt: t.depAt ? new Date(t.depAt) : null,
          arrPlace: t.arrPlace ?? null,
          arrAt: t.arrAt ? new Date(t.arrAt) : null,
          depLat: t.depLat ?? null,
          depLng: t.depLng ?? null,
          arrLat: t.arrLat ?? null,
          arrLng: t.arrLng ?? null,
          reference: t.reference ?? null,
          notes: t.notes ?? null,
          sortOrder: t.sortOrder,
        },
      });
      id.set(t.key, dbT.id);

      if (t.cost) {
        await db.cost.create({
          data: {
            tripId,
            forkId: forkId ?? null,
            ownerType: "TRANSPORT",
            ownerId: dbT.id,
            estimatedMinor: t.cost.estimatedMinor,
            actualMinor: t.cost.actualMinor ?? null,
            currency: t.cost.currency,
            rateToHome: rateToHome(t.cost.currency),
            paidAt: t.cost.paid ? new Date(Date.now() - 7 * 86400000) : null,
            category: t.cost.category ?? null,
          },
        });
      }
    }

    // --- Accommodations ---
    for (const a of plan.accommodations) {
      const stopId = id.get(a.stopKey);
      if (!stopId) continue; // should never happen if keys are valid
      const dbA = await db.accommodation.create({
        data: {
          tripId,
          forkId: forkId ?? null,
          stopId,
          name: a.name,
          address: a.address ?? null,
          checkIn: a.checkIn,
          checkOut: a.checkOut,
          confirmation: a.confirmation ?? null,
          notes: a.notes ?? null,
          lat: a.lat ?? null,
          lng: a.lng ?? null,
        },
      });
      id.set(a.key, dbA.id);

      if (a.cost) {
        await db.cost.create({
          data: {
            tripId,
            forkId: forkId ?? null,
            ownerType: "ACCOMMODATION",
            ownerId: dbA.id,
            estimatedMinor: a.cost.estimatedMinor,
            actualMinor: a.cost.actualMinor ?? null,
            currency: a.cost.currency,
            rateToHome: rateToHome(a.cost.currency),
            paidAt: a.cost.paid ? new Date(Date.now() - 7 * 86400000) : null,
            category: a.cost.category ?? null,
          },
        });
      }
    }

    // --- Items ---
    // Two-pass approach: first pass creates items without sourceItemKey so their
    // ids are registered; second pass updates sourceItemId for placed copies.
    // In practice we just create in order and resolve sourceItemKey from the map
    // after the item is inserted — if the source item was created before the
    // placed copy (guaranteed by dataset ordering), it's already in id map.
    // For safety we do a deferred update for any item whose sourceItemKey target
    // was not yet created when we processed the placed copy.
    const deferredSourceItem: { dbItemId: string; sourceKey: string }[] = [];

    for (const it of plan.items) {
      const stopId = it.stopKey ? (id.get(it.stopKey) ?? null) : null;
      const sourceMarkerId = it.sourceMarkerKey ? (id.get(it.sourceMarkerKey) ?? null) : null;
      // Resolve sourceItemId now if the source is already in the map.
      const sourceItemId = it.sourceItemKey ? (id.get(it.sourceItemKey) ?? null) : null;
      const needsDeferred = it.sourceItemKey && !sourceItemId;

      const dbItem = await db.item.create({
        data: {
          tripId,
          forkId: forkId ?? null,
          stopId,
          title: it.title,
          category: it.category,
          date: it.date ?? null,
          startTime: it.startTime ?? null,
          endTime: it.endTime ?? null,
          lat: it.lat ?? null,
          lng: it.lng ?? null,
          address: it.address ?? null,
          link: it.link ?? null,
          booking: it.booking ?? null,
          notes: it.notes ?? null,
          sortOrder: it.sortOrder ?? 0,
          sourceItemId: sourceItemId,
          sourceMarkerId,
        },
      });
      id.set(it.key, dbItem.id);

      if (needsDeferred) {
        deferredSourceItem.push({ dbItemId: dbItem.id, sourceKey: it.sourceItemKey! });
      }

      if (it.cost) {
        await db.cost.create({
          data: {
            tripId,
            forkId: forkId ?? null,
            ownerType: "ITEM",
            ownerId: dbItem.id,
            estimatedMinor: it.cost.estimatedMinor,
            actualMinor: it.cost.actualMinor ?? null,
            currency: it.cost.currency,
            rateToHome: rateToHome(it.cost.currency),
            paidAt: it.cost.paid ? new Date(Date.now() - 7 * 86400000) : null,
            category: it.cost.category ?? null,
          },
        });
      }

      for (const v of it.votes ?? []) {
        await db.vote.create({
          data: {
            tripId,
            itemId: dbItem.id,
            userId: who(v.user),
            level: v.level,
          },
        });
      }
    }

    // Deferred sourceItemId updates for placed copies whose source came later.
    for (const deferred of deferredSourceItem) {
      const resolvedSourceId = id.get(deferred.sourceKey) ?? null;
      if (resolvedSourceId) {
        await db.item.update({
          where: { id: deferred.dbItemId },
          data: { sourceItemId: resolvedSourceId },
        });
      }
    }

    // --- Plan-level costs ---
    for (const c of plan.costs) {
      const ownerId =
        c.ownerType === "OTHER"
          ? null
          : c.ownerKey
          ? (id.get(c.ownerKey) ?? null)
          : null;
      await db.cost.create({
        data: {
          tripId,
          forkId: forkId ?? null,
          ownerType: c.ownerType,
          ownerId,
          estimatedMinor: c.estimatedMinor,
          actualMinor: c.actualMinor ?? null,
          currency: c.currency,
          rateToHome: rateToHome(c.currency),
          paidAt: c.paid ? new Date(Date.now() - 7 * 86400000) : null,
          label: c.label ?? null,
          category: c.category ?? null,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Persist the real plan
  // -------------------------------------------------------------------------

  await persistPlan(trip);

  // -------------------------------------------------------------------------
  // Step 5: Trip-scoped extras (real plan only)
  // -------------------------------------------------------------------------

  // Notes
  for (const n of trip.notes ?? []) {
    const targetId =
      n.targetKey === "TRIP"
        ? tripId
        : (id.get(n.targetKey) ?? tripId);
    await db.note.create({
      data: {
        tripId,
        authorId: who(n.author),
        targetType: n.targetType,
        targetId,
        body: n.body,
      },
    });
  }

  // Checklist items
  let clSort = 0;
  for (const c of trip.checklist ?? []) {
    await db.checklistItem.create({
      data: {
        tripId,
        kind: c.kind,
        text: c.text,
        done: c.done,
        dueDate: c.dueDate ?? null,
        assignedToId: c.assignedTo ? who(c.assignedTo) : null,
        sortOrder: clSort++,
      },
    });
  }

  // Packing templates
  for (const pt of trip.packingTemplates ?? []) {
    await db.packingTemplate.create({
      data: {
        ownerId: who(pt.owner),
        name: pt.name,
        itemsJson: JSON.stringify(pt.items),
      },
    });
  }

  // Reminders
  for (const r of trip.reminders ?? []) {
    const targetId =
      r.targetKey && r.targetKey !== "TRIP"
        ? (id.get(r.targetKey) ?? null)
        : null;
    await db.reminder.create({
      data: {
        tripId,
        title: r.title,
        fireAt: new Date(r.fireAt),
        sent: r.sent ?? false,
        targetType: r.targetType ?? null,
        targetId,
      },
    });
  }

  // Journal entries
  for (const j of trip.journal ?? []) {
    await db.journalEntry.create({
      data: {
        tripId,
        date: j.date,
        body: j.body,
        authorId: who(j.author),
      },
    });
  }

  // Attachments
  for (const att of trip.attachments ?? []) {
    const targetId =
      att.targetKey === "TRIP" || !att.targetKey
        ? null
        : (id.get(att.targetKey) ?? null);
    const uploaderId =
      att.targetType === "TRIP" || !att.targetKey
        ? who(trip.createdBy)
        : who(trip.createdBy); // default uploader = trip creator; adjust if spec adds per-att owner
    await saveAttachment(
      { trip: tripId },
      att.targetType,
      targetId,
      att,
      uploaderId,
    );
  }

  // Share link
  if (trip.shareLink) {
    await db.shareLink.create({
      data: { tripId, token: crypto.randomUUID() },
    });
  }

  // Calendar feed
  if (trip.calendarFeed) {
    const cf = trip.calendarFeed;
    await db.calendarFeed.create({
      data: {
        tripId,
        token: crypto.randomUUID(),
        includeTransport: cf.includeTransport ?? true,
        includeAccommodation: cf.includeAccommodation ?? true,
        includeActivities: cf.includeActivities ?? true,
      },
    });
  }

  // Invites
  for (const inv of trip.invites ?? []) {
    await db.invite.create({
      data: {
        tripId,
        email: inv.email,
        role: inv.role,
        token: crypto.randomUUID(),
        acceptedAt: null,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Step 6: Forks
  // -------------------------------------------------------------------------

  for (const fork of trip.forks ?? []) {
    const dbFork = await db.fork.create({
      data: {
        tripId,
        name: fork.name,
        sortOrder: fork.sortOrder,
        createdById: who(fork.createdBy),
      },
    });
    const forkId = dbFork.id;
    id.set(fork.key, forkId);
    await persistPlan(fork, forkId);
  }

  // -------------------------------------------------------------------------
  // Step 7: Activities
  // -------------------------------------------------------------------------

  const createdActivities: { id: string; createdAt: Date }[] = [];

  for (const act of trip.activities ?? []) {
    const entityId = act.entityKey ? (id.get(act.entityKey) ?? null) : null;
    const actCreatedAt = act.at
      ? new Date(act.at)
      : new Date(Date.now() - (act.daysAgo ?? 0) * 86400000);

    const dbAct = await db.activity.create({
      data: {
        tripId,
        actorId: who(act.actor),
        verb: act.verb,
        entityType: act.entityType,
        entityId,
        entityLabel: act.entityLabel,
        changes: act.changes !== undefined
          ? (act.changes as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        createdAt: actCreatedAt,
      },
    });
    createdActivities.push({ id: dbAct.id, createdAt: actCreatedAt });
  }

  // Set unread cursor: lastReadActivityAt = createdAt of the 3rd-newest activity
  // so the two newest are unread for trip.unreadFor member.
  if (trip.unreadFor && createdActivities.length >= 3) {
    const sorted = [...createdActivities].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const cursor = sorted[2].createdAt; // 3rd-newest = index 2
    await db.tripMember.update({
      where: { tripId_userId: { tripId, userId: who(trip.unreadFor) } },
      data: { lastReadActivityAt: cursor },
    });
  }
}
