"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { TargetType } from "@/lib/enums";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import { FileTitleDialog } from "@/components/trip/file-title-dialog";
import { FileLinkDialog, type LinkTargetGroup } from "@/components/trip/file-link-dialog";
import { FILES_SECTION_HEADER_CLASS } from "@/app/(app)/trips/[tripId]/files/section-class";

export type { LinkTargetGroup };

export interface FilesSection {
  type: TargetType;
  label: string;
  attachments: AttachmentView[];
}

/**
 * The Files page's body (spec 2026-10-02 §C): Trip-level files with the
 * upload tile, then one section per owner type. Owns the Rename and Link-to
 * dialogs so the server page stays a loader. Link-to shows on Trip-level
 * files and on Item files (to unlink); files uploaded on a Stop, Transport
 * or Accommodation stay where they were put.
 */
export function FilesIndex({
  tripId,
  tripAttachments,
  sections,
  linkTargets,
}: {
  tripId: string;
  tripAttachments: AttachmentView[];
  sections: FilesSection[];
  linkTargets: LinkTargetGroup[];
}) {
  const router = useRouter();
  const [renaming, setRenaming] = React.useState<AttachmentView | null>(null);
  const [linking, setLinking] = React.useState<{ att: AttachmentView; itemId: string | null } | null>(null);
  const saved = () => router.refresh();

  return (
    <>
      <AttachmentList tripId={tripId} targetType="TRIP" attachments={tripAttachments} onRename={setRenaming} onLink={(att) => setLinking({ att, itemId: null })} />

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
            onLink={section.type === "ITEM" ? (att) => setLinking({ att, itemId: att.targetId ?? null }) : undefined}
          />
        </div>
      ))}

      <FileTitleDialog file={renaming ? { id: renaming.id, title: renaming.title } : null} onOpenChange={(o) => !o && setRenaming(null)} onSaved={saved} />
      <FileLinkDialog file={linking ? { id: linking.att.id, itemId: linking.itemId } : null} targets={linkTargets} onOpenChange={(o) => !o && setLinking(null)} onSaved={saved} />
    </>
  );
}
