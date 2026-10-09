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
import { FilesIndex, type FilesSection, type LinkTargetGroup } from "@/components/trip/files-index";
import { REAL_PLAN } from "@/lib/plan-scope";
import type { TargetType } from "@/lib/enum-values";
import { TARGET_TYPES } from "@/lib/enum-values";
import { loadFileOwners, ownerKey, REMOVED_OWNER } from "@/lib/files-index-loader";
import { filesMeta } from "@/lib/page-meta";
import { tripStorageUsed, TRIP_QUOTA_BYTES } from "@/lib/storage-quota";
import { MAX_WARM_TRIP_BYTES } from "@/lib/offline";
import { formatMB } from "@/lib/format-bytes";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Files" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export { FILES_SECTION_HEADER_CLASS } from "./section-class";

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
  await requireTripAccess(tripId);
  const [shell, slug, storageUsed] = await Promise.all([readTripShell(tripId), tripSlugFor(tripId), tripStorageUsed(tripId)]);

  // Fetch all attachments for this trip, newest first.
  const rows = await db.attachment.findMany({
    where: { tripId },
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

  const owners = await loadFileOwners(
    tripId,
    slug,
    rows.filter((r) => r.targetType !== "TRIP").map((r) => ({ targetType: r.targetType as TargetType, targetId: r.targetId })),
  );
  const withOwner = (r: (typeof rows)[number]): AttachmentView => ({
    ...r,
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

  const linkItems = await db.item.findMany({
    where: { tripId, ...REAL_PLAN },
    select: { id: true, title: true, stopId: true, stop: { select: { name: true, sortOrder: true } } },
    orderBy: [{ sortOrder: "asc" }],
  });
  const byStop = new Map<string, LinkTargetGroup & { order: number }>();
  for (const it of linkItems) {
    const key = it.stopId ?? "wishlist";
    const group = byStop.get(key) ?? { stopName: it.stop?.name ?? "Wishlist", items: [], order: it.stop?.sortOrder ?? Number.MAX_SAFE_INTEGER };
    group.items.push({ id: it.id, title: it.title });
    byStop.set(key, group);
  }
  const linkTargets: LinkTargetGroup[] = [...byStop.values()].sort((a, b) => a.order - b.order).map(({ stopName, items }) => ({ stopName, items }));
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

      <FilesIndex tripId={tripId} tripAttachments={tripAttachments} sections={sections} linkTargets={linkTargets} />

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
