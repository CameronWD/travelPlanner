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
import type { DemoGlobe, Who } from "@/lib/demo/types";
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
