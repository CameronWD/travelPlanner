"use client";

import * as React from "react";
import type { TargetType } from "@/lib/enum-values";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import { FileTitleDialog } from "@/components/trip/file-title-dialog";
import { FileMoveDialog } from "@/components/trip/file-move-dialog";
import type { MoveTargetGroup } from "@/lib/attachment-move";
import type { ConfirmationKind } from "@/lib/booking-confirmation";
import Link from "next/link";
import type { FileOwner } from "@/lib/attachment-view";
import { FILES_SECTION_HEADER_CLASS } from "@/components/trip/files-section-class";

export interface ConfirmationToAddRow {
  kind: ConfirmationKind;
  id: string;
  label: string;
  href: NonNullable<FileOwner["href"]>;
}

export interface FilesSection {
  type: TargetType;
  label: string;
  attachments: AttachmentView[];
}

/**
 * The Files page's body (spec 2026-10-02 §C): Booking confirmations still to
 * add, Trip-level files with the upload tile, then one section per owner
 * type. Owns the Rename and Move dialogs so the server page stays a loader.
 */
export function FilesIndex({
  tripId,
  tripAttachments,
  sections,
  moveTargets,
  toAdd,
}: {
  tripId: string;
  tripAttachments: AttachmentView[];
  sections: FilesSection[];
  moveTargets: MoveTargetGroup[];
  toAdd: ConfirmationToAddRow[];
}) {
  const [renaming, setRenaming] = React.useState<AttachmentView | null>(null);
  const [moving, setMoving] = React.useState<AttachmentView | null>(null);

  return (
    <>
      {toAdd.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 pt-2">
            <h3 className={FILES_SECTION_HEADER_CLASS}>Booking confirmations to add</h3>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{toAdd.length}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-border-soft" />
          </div>
          <ul className="flex flex-col gap-1.5">
            {toAdd.map((row) => (
              <li key={`${row.kind}:${row.id}`} className="text-sm font-semibold">
                <Link href={row.href} className="text-foreground underline-offset-2 hover:underline">
                  {row.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AttachmentList tripId={tripId} targetType="TRIP" attachments={tripAttachments} onRename={setRenaming} onMove={setMoving} />

      {sections.map((section) => (
        <div key={section.type} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 pt-2">
            <h3 className={FILES_SECTION_HEADER_CLASS}>{section.label}</h3>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{section.attachments.length}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-border-soft" />
          </div>
          <AttachmentList
            tripId={tripId}
            targetType={section.type}
            attachments={section.attachments}
            showUpload={false}
            onRename={setRenaming}
            onMove={setMoving}
          />
        </div>
      ))}

      <FileTitleDialog file={renaming ? { id: renaming.id, title: renaming.title } : null} onOpenChange={(o) => !o && setRenaming(null)} />
      {moving ? <FileMoveDialog attachmentId={moving.id} targets={moveTargets} onDone={() => setMoving(null)} /> : null}
    </>
  );
}
