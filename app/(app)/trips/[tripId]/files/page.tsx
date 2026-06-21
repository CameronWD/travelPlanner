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
    <div className="space-y-8">
      {/* ── Page heading ── */}
      <div>
        <h2 className="font-display text-2xl font-semibold text-foreground">
          Files
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep tickets, booking confirmations and passport scans here.
        </p>
      </div>

      {/* ── Upload + trip-level list ── */}
      <section aria-labelledby="trip-files-heading">
        <h3
          id="trip-files-heading"
          className="mb-3 text-base font-semibold text-foreground"
        >
          {TARGET_TYPE_LABELS["TRIP"]} files
        </h3>
        <AttachmentList
          tripId={tripId}
          targetType="TRIP"
          attachments={tripAttachments}
        />
      </section>

      {/* ── Grouped entity-level files ── */}
      {grouped.size > 0 ? (
        <section aria-label="Files by category">
          <h3 className="mb-4 text-base font-semibold text-foreground">
            Files by category
          </h3>
          <div className="space-y-6">
            {(
              Array.from(grouped.entries()) as Array<[TargetType, AttachmentView[]]>
            ).map(([type, items]) => (
              <div key={type}>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {TARGET_TYPE_LABELS[type]}
                </h4>
                <AttachmentList
                  tripId={tripId}
                  targetType={type}
                  attachments={items}
                  compact
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
