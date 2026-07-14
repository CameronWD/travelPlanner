import { FolderOpen } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AttachmentList,
  type AttachmentView,
} from "@/components/trip/attachment-list";
import type { TargetType } from "@/lib/enums";
import { TARGET_TYPES } from "@/lib/enums";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  TRIP: "Trip-level",
  STOP: "Stops",
  ITEM: "Activities",
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

  // Fetch all attachments for this trip, newest first.
  const rows = await db.attachment.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      mime: true,
      size: true,
      url: true,
      targetType: true,
      targetId: true,
      uploadedById: true,
      createdAt: true,
    },
  });

  // Separate trip-level attachments from entity-level ones.
  const tripAttachments: AttachmentView[] = rows
    .filter((r) => r.targetType === "TRIP")
    .map((r) => ({ ...r }));

  const otherAttachments = rows.filter((r) => r.targetType !== "TRIP");

  // Group entity-level attachments by targetType.
  const grouped = new Map<TargetType, AttachmentView[]>();
  for (const type of TARGET_TYPES) {
    if (type === "TRIP") continue;
    const items = otherAttachments
      .filter((r) => r.targetType === type)
      .map((r) => ({ ...r }));
    if (items.length > 0) {
      grouped.set(type, items);
    }
  }

  const hasAny = rows.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page heading ── */}
      <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
        Files
      </h2>

      {/* ── Trip-level files (first, no group header) ── */}
      <AttachmentList
        tripId={tripId}
        targetType="TRIP"
        attachments={tripAttachments}
      />

      {/* ── Grouped entity-level files ── */}
      {(
        Array.from(grouped.entries()) as Array<[TargetType, AttachmentView[]]>
      ).map(([type, items]) => (
        <div key={type} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              {TARGET_TYPE_LABELS[type]}
            </span>
            <span className="text-xs text-muted-foreground">{items.length}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <AttachmentList
            tripId={tripId}
            targetType={type}
            attachments={items}
          />
        </div>
      ))}

      {/* ── Empty state when there are no files at all ── */}
      {!hasAny ? (
        <EmptyState
          icon={FolderOpen}
          title="No files yet"
          description="Keep tickets, confirmations and passport scans here — upload your first file above."
        />
      ) : null}
    </div>
  );
}
