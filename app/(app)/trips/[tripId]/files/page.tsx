import type { Metadata } from "next";
import { Paperclip } from "lucide-react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AttachmentList,
  type AttachmentView,
} from "@/components/trip/attachment-list";
import type { TargetType } from "@/lib/enums";
import { TARGET_TYPES } from "@/lib/enums";

export const metadata: Metadata = { title: "Files" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tailwind classes for the entity-group section-header label — kit Label
 * (`text-label`: 11px, uppercase, 0.08em) in the display face.
 * Exported so the page test can assert the class is present.
 */
export const FILES_SECTION_HEADER_CLASS =
  "font-display font-bold text-label text-muted-foreground";

/** Kit display title (same as Activity / Checklists). Exported for tests. */
export const FILES_TITLE_CLASS =
  "font-display text-[28px] font-extrabold leading-none tracking-[-0.035em] text-foreground sm:text-4xl";

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
    <div className="flex flex-col gap-3 sm:gap-[18px]">
      {/* ── Page heading ── */}
      <h2 className={FILES_TITLE_CLASS}>Files</h2>

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
          <div className="flex items-center gap-2 pt-2">
            <h3 className={FILES_SECTION_HEADER_CLASS}>
              {TARGET_TYPE_LABELS[type]}
            </h3>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{items.length}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-border-soft" />
          </div>
          <AttachmentList
            tripId={tripId}
            targetType={type}
            attachments={items}
            showUpload={false}
          />
        </div>
      ))}

      {/* ── Empty state when there are no files at all ── */}
      {!hasAny ? (
        <EmptyState
          icon={Paperclip}
          tone="sun"
          title="No files yet"
          description="Keep tickets, confirmations and passport scans here — upload your first file above."
        />
      ) : null}
    </div>
  );
}
