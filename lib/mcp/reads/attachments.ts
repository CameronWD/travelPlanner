/**
 * `list_attachments`'s loader, and the shared loader behind the `files` lists
 * on `get_trip_plan` (spec 2026-10-11 Task 3): every Attachment the real plan
 * owns — title (falling back to filename), type, size, who uploaded it, and
 * what it's attached to (`loadOwners`, Task 2). Real plan only: an Attachment
 * whose owner is on a What-if plan (Fork) is excluded entirely (Review Focus
 * 4, not merely relabelled); one whose owner was deleted is kept, named
 * "(removed)" (Review Focus 3). Globe-owned files are never returned — a
 * Globe-owned Attachment carries `globeId`, not `tripId` (mutually exclusive,
 * `server/actions/attachments.ts#uploadAttachment`), and this queries by
 * `tripId` alone, so no extra filter is needed to keep them out.
 *
 * `targetType` values beyond the five real-plan owner kinds (e.g. `JOURNAL`,
 * a Journal-day photo) have no plan entity to attach files to: they're still
 * listed (in `attachments`), with a sensible label, but never appear in
 * `byOwner` — nothing in `trip-plan.ts` looks them up there.
 */
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { travellerName, TRAVELLER_SELECT } from "@/lib/traveller";
import type { TargetType } from "@/lib/enum-values";
import { loadOwners, ownerKey, REMOVED_LABEL, type OwnerKind } from "./owners";

export interface McpFileRef {
  id: string;
  /** title ?? filename */
  title: string;
}

export interface McpAttachment {
  id: string;
  title: string;
  filename: string;
  mime: string;
  size: number;
  uploadedBy: string;
  owner: { kind: OwnerKind; label: string };
}

export interface TripAttachmentsResult {
  attachments: McpAttachment[];
  /** key: ownerKey(kind, id); "TRIP" files live under ownerKey("TRIP", tripId). */
  byOwner: Map<string, McpFileRef[]>;
}

/** `targetType` values with a matching `OwnerKind`, resolved through `loadOwners`. */
export const OWNER_KIND_BY_TARGET_TYPE: Partial<Record<TargetType, OwnerKind>> = {
  STOP: "STOP",
  ACCOMMODATION: "ACCOMMODATION",
  TRANSPORT: "TRANSPORT",
  ITEM: "ITEM",
};

/** Every other targetType (not TRIP, not one of the four above): a sensible label, shown as a Trip-level file. */
const OTHER_TARGET_LABELS: Partial<Record<TargetType, string>> = {
  JOURNAL: "Journal",
  MARKER: "Marker",
};

/** Real-plan, trip-scoped attachments. Excludes Globe files and fork-owned owners; keeps removed owners as "(removed)". */
export async function loadTripAttachments(tripId: string): Promise<TripAttachmentsResult> {
  const rows = await db.attachment.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      title: true,
      mime: true,
      size: true,
      targetType: true,
      targetId: true,
      uploadedBy: { select: TRAVELLER_SELECT },
    },
  });

  const refs = rows
    .map((r) => {
      const kind = OWNER_KIND_BY_TARGET_TYPE[r.targetType as TargetType];
      return kind && r.targetId ? { kind, id: r.targetId } : null;
    })
    .filter((r): r is { kind: OwnerKind; id: string } => r !== null);

  const { owners, forkOwned } = await loadOwners(tripId, refs);

  const attachments: McpAttachment[] = [];
  const byOwner = new Map<string, McpFileRef[]>();

  const addFile = (key: string, ref: McpFileRef) => {
    const existing = byOwner.get(key);
    if (existing) existing.push(ref);
    else byOwner.set(key, [ref]);
  };

  for (const row of rows) {
    const targetType = row.targetType as TargetType;
    const title = row.title ?? row.filename;
    const fileRef: McpFileRef = { id: row.id, title };
    const uploadedBy = travellerName(row.uploadedBy);
    const base = { id: row.id, title, filename: row.filename, mime: row.mime, size: row.size, uploadedBy };

    if (targetType === "TRIP") {
      addFile(ownerKey("TRIP", tripId), fileRef);
      attachments.push({ ...base, owner: { kind: "TRIP", label: "Trip" } });
      continue;
    }

    const kind = OWNER_KIND_BY_TARGET_TYPE[targetType];
    if (kind) {
      const key = row.targetId ? ownerKey(kind, row.targetId) : null;
      if (key && forkOwned.has(key)) continue; // On a What-if plan: excluded entirely (Review Focus 4).

      const owner = key ? owners.get(key) : undefined;
      if (owner) {
        addFile(key!, fileRef);
        attachments.push({ ...base, owner: { kind: owner.kind, label: owner.label } });
      } else {
        // The owner row is gone: keep the file, named "(removed)" (Review Focus 3).
        attachments.push({ ...base, owner: { kind, label: REMOVED_LABEL } });
      }
      continue;
    }

    // Any other targetType (e.g. JOURNAL): no plan entity to attach to.
    attachments.push({ ...base, owner: { kind: "TRIP", label: OTHER_TARGET_LABELS[targetType] ?? targetType } });
  }

  return { attachments, byOwner };
}

export async function loadAttachmentIndexForMcp(tripId: string): Promise<{ attachments: McpAttachment[] }> {
  await requireTripAccess(tripId);
  const { attachments } = await loadTripAttachments(tripId);
  return { attachments };
}
