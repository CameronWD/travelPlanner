import type { Metadata } from "next";
import { Paperclip } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import type { AttachmentView } from "@/components/trip/attachment-list";
import { FilesIndex, type FilesSection } from "@/components/trip/files-index";
import type { MoveTargetGroup } from "@/lib/attachment-move";
import { loadBookingConfirmationsToAdd } from "@/lib/booking-confirmations-loader";
import { REAL_PLAN } from "@/lib/plan-scope";
import type { TargetType } from "@/lib/enum-values";
import { TARGET_TYPES } from "@/lib/enum-values";
import { loadFileOwners, ownerKey, REMOVED_OWNER } from "@/lib/files-index-loader";
import { filesMeta } from "@/lib/page-meta";
import { tripStorageUsed, TRIP_QUOTA_BYTES } from "@/lib/storage-quota";
import { MAX_WARM_TRIP_BYTES } from "@/lib/offline";
import { formatMB } from "@/lib/format-bytes";
import { cn } from "@/lib/cn";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";

export const metadata: Metadata = { title: "Files" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export { FILES_SECTION_HEADER_CLASS } from "@/components/trip/files-section-class";

const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  TRIP: "Trip-level",
  STOP: "Stops",
  ITEM: "Things to do",
  TRANSPORT: "Transport",
  ACCOMMODATION: "Accommodation",
  JOURNAL: "Journal",
  MARKER: "Markers",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FilesPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const { user } = await requireTripAccess(tripId);
  const [shell, slug, storageUsed, v] = await Promise.all([
    readTripShell(tripId), tripSlugFor(tripId), tripStorageUsed(tripId), loadSurpriseVisibility(tripId, user.id),
  ]);

  // Fetch all attachments for this trip, newest first — none inside a
  // Surprise the viewer may not see (ADR 0051).
  const rows = await db.attachment.findMany({
    where: { tripId, ...v.where.attachment },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      title: true,
      mime: true,
      size: true,
      url: true,
      targetType: true,
      targetId: true,
      uploadedById: true,
      createdAt: true,
    },
  });

  const [confirmations, photoRows] = await Promise.all([
    loadBookingConfirmationsToAdd(tripId, user.id),
    db.item.findMany({ where: { tripId, photoAttachmentId: { not: null } }, select: { photoAttachmentId: true } }),
  ]);
  const owners = await loadFileOwners(tripId, slug, [
    ...rows.filter((r) => r.targetType !== "TRIP").map((r) => ({ targetType: r.targetType as TargetType, targetId: r.targetId })),
    ...confirmations.map((c) => ({ targetType: c.kind, targetId: c.id })),
  ]);
  const toAdd = confirmations.flatMap((c) => {
    const owner = owners.get(ownerKey(c.kind, c.id));
    return owner?.href ? [{ kind: c.kind, id: c.id, label: owner.label, href: owner.href }] : [];
  });
  const photoIds = new Set(photoRows.map((i) => i.photoAttachmentId));
  const withOwner = (r: (typeof rows)[number]): AttachmentView => ({
    ...r,
    movable: r.targetType !== "JOURNAL" && !photoIds.has(r.id),
    owner: r.targetType === "TRIP" ? null : r.targetId ? (owners.get(ownerKey(r.targetType as TargetType, r.targetId)) ?? REMOVED_OWNER) : REMOVED_OWNER,
  });

  // Separate trip-level attachments from entity-level ones.
  const tripAttachments: AttachmentView[] = rows
    .filter((r) => r.targetType === "TRIP")
    .map(withOwner);

  const otherAttachments = rows.filter((r) => r.targetType !== "TRIP");

  // Group entity-level attachments by targetType.
  const grouped = new Map<TargetType, AttachmentView[]>();
  for (const type of TARGET_TYPES) {
    if (type === "TRIP") continue;
    const items = otherAttachments
      .filter((r) => r.targetType === type)
      .map(withOwner);
    if (items.length > 0) {
      grouped.set(type, items);
    }
  }

  const [moveWishlist, moveStops, moveTransports, moveStays, moveItems] = await Promise.all([
    db.item.findMany({ where: { tripId, ...REAL_PLAN, stopId: null, date: null, ...v.where.item }, select: { id: true, title: true }, orderBy: { sortOrder: "asc" } }),
    db.stop.findMany({ where: { tripId, ...REAL_PLAN, id: { notIn: v.hiddenStopIds } }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    db.transport.findMany({ where: { tripId, ...REAL_PLAN }, select: { id: true, fromStopId: true, toStopId: true }, orderBy: { sortOrder: "asc" } }),
    db.accommodation.findMany({ where: { tripId, ...REAL_PLAN, ...v.where.accommodation }, select: { id: true, name: true, stop: { select: { name: true } } }, orderBy: { checkIn: "asc" } }),
    db.item.findMany({ where: { tripId, ...REAL_PLAN, stopId: { not: null }, ...v.where.item }, select: { id: true, title: true, stop: { select: { name: true } } }, orderBy: { sortOrder: "asc" } }),
  ]);
  const transportOwners = await loadFileOwners(tripId, slug, moveTransports.map((t) => ({ targetType: "TRANSPORT" as const, targetId: t.id })));
  const moveTargets: MoveTargetGroup[] = [
    { label: "Trip", options: [{ value: "TRIP", label: "The whole trip", target: { type: "TRIP" } }] },
    { label: "Stops", options: moveStops.map((x) => ({ value: `STOP:${x.id}`, label: x.name, target: { type: "STOP", id: x.id } })) },
    {
      label: "Transport",
      options: moveTransports.map((x) => ({ value: `TRANSPORT:${x.id}`, label: transportOwners.get(ownerKey("TRANSPORT", x.id))?.label ?? "Transport", target: { type: "TRANSPORT", id: x.id } })),
    },
    { label: "Stays", options: moveStays.map((x) => ({ value: `ACCOMMODATION:${x.id}`, label: `${x.name} · ${x.stop.name}`, target: { type: "ACCOMMODATION", id: x.id } })) },
    { label: "Things to do", options: moveItems.map((x) => ({ value: `ITEM:${x.id}`, label: x.stop ? `${x.title} · ${x.stop.name}` : x.title, target: { type: "ITEM", id: x.id } })) },
    { label: "Wishlist", options: moveWishlist.map((x) => ({ value: `ITEM:${x.id}`, label: x.title, target: { type: "ITEM", id: x.id } })) },
  ].filter((g) => g.options.length > 0) as MoveTargetGroup[];
  const sections: FilesSection[] = (Array.from(grouped.entries()) as Array<[TargetType, AttachmentView[]]>).map(([type, attachments]) => ({
    type,
    label: TARGET_TYPE_LABELS[type],
    attachments,
  }));

  const hasAny = rows.length > 0;

  // Storage quota (spec 2026-10-02 §B): the Trip's own 500 MB cap. Amber
  // from 90% to flag the ceiling before the next upload is refused.
  const nearCap = storageUsed / TRIP_QUOTA_BYTES >= 0.9;
  const quotaMeta = (
    <span className={cn(nearCap && "text-hue-sun-text")}>
      Used {formatMB(storageUsed)} of {formatMB(TRIP_QUOTA_BYTES)}
    </span>
  );
  const filesCount = filesMeta(rows.length);

  // 200 MB per-Trip offline warm cap (ADR 0043, amended 2026-10-02): note it
  // only when the Trip's total exceeds the cap — most Trips never see this.
  const totalBytes = rows.reduce((n, a) => n + a.size, 0);
  const exceedsWarmCap = totalBytes > MAX_WARM_TRIP_BYTES;

  return (
    <div className="flex flex-col gap-3 sm:gap-[18px]">
      <PageHeader
        eyebrow={shell?.name}
        title="Files"
        meta={
          <>
            {filesCount ? <>{filesCount} · </> : null}
            {quotaMeta}
          </>
        }
        metaOnMobile
        trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
      />

      {exceedsWarmCap ? (
        <p className="text-sm text-muted-foreground">Files from the last 200 MB are kept on this device for offline use.</p>
      ) : null}

      <FilesIndex tripId={tripId} tripAttachments={tripAttachments} sections={sections} moveTargets={moveTargets} toAdd={toAdd} />

      {/* ── Empty state when there are no files at all ── */}
      {!hasAny ? (
        <EmptyState
          icon={Paperclip}
          tone="sun"
          title="No files yet"
          description="Keep tickets, confirmations and passport scans here. Upload your first file above."
        />
      ) : null}
    </div>
  );
}
