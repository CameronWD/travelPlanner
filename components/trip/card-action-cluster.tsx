"use client";

import * as React from "react";
import { Pencil, Trash2, MessageCircle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoreActionsMenu, type CardActionItem } from "./card-actions";
import { NoteThread, type NoteView } from "./note-thread";
import { AttachmentPopover } from "./attachment-popover";
import { AttachmentList, type AttachmentView } from "./attachment-list";
import type { TargetType } from "@/lib/enums";

export interface CardActionClusterProps {
  tripId?: string;
  targetType: TargetType;
  targetId: string;
  /** aria-labels passed verbatim so existing labels/tests are preserved. */
  editLabel: string;
  deleteLabel: string;
  moreLabel: string;
  onEdit?: () => void;
  onDelete?: () => void;
  isPending?: boolean;
  notes?: NoteView[];
  currentUserId?: string;
  attachments?: AttachmentView[];
  className?: string;
}

/**
 * The right-hand action cluster shared by the accommodation, transport, and
 * wishlist item cards. Edit stays visible at every width; on mobile the
 * secondary actions (Notes, Attachments, Delete) fold into a `⋯` menu, with
 * Notes/Attachments opening as bottom sheets — mirroring the stop card.
 */
export function CardActionCluster({
  tripId,
  targetType,
  targetId,
  editLabel,
  deleteLabel,
  moreLabel,
  onEdit,
  onDelete,
  isPending = false,
  notes,
  currentUserId,
  attachments,
  className,
}: CardActionClusterProps) {
  const [notesSheetOpen, setNotesSheetOpen] = React.useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = React.useState(false);

  const hasNotes =
    notes !== undefined && tripId !== undefined && currentUserId !== undefined;
  const hasAttachments = attachments !== undefined && tripId !== undefined;

  const menuItems: CardActionItem[] = [];
  if (hasNotes) {
    menuItems.push({
      key: "notes",
      label: notes!.length > 0 ? `Notes (${notes!.length})` : "Notes",
      icon: <MessageCircle className="size-4" aria-hidden="true" />,
      onSelect: () => setNotesSheetOpen(true),
    });
  }
  if (hasAttachments) {
    menuItems.push({
      key: "attachments",
      label:
        attachments!.length > 0
          ? `Attachments (${attachments!.length})`
          : "Attachments",
      icon: <Paperclip className="size-4" aria-hidden="true" />,
      onSelect: () => setAttachSheetOpen(true),
    });
  }
  if (onDelete) {
    menuItems.push({
      key: "delete",
      label: "Delete",
      icon: <Trash2 className="size-4" aria-hidden="true" />,
      onSelect: onDelete,
      disabled: isPending,
      destructive: true,
    });
  }

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {/* Desktop-only inline secondary actions. */}
      {hasAttachments && (
        <div className="hidden sm:block">
          <AttachmentPopover
            tripId={tripId}
            targetType={targetType}
            targetId={targetId}
            attachments={attachments!}
          />
        </div>
      )}
      {hasNotes && (
        <div className="hidden sm:block">
          <NoteThread
            tripId={tripId!}
            targetType={targetType}
            targetId={targetId}
            notes={notes!}
            currentUserId={currentUserId!}
          />
        </div>
      )}

      {/* Edit — single always-visible instance across breakpoints. */}
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']"
          disabled={isPending}
          onClick={onEdit}
          aria-label={editLabel}
          title={editLabel}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex relative size-8 text-destructive hover:bg-destructive/10 hover:text-destructive pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']"
          disabled={isPending}
          onClick={onDelete}
          aria-label={deleteLabel}
          title={deleteLabel}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      )}

      {/* Mobile-only overflow menu. */}
      {menuItems.length > 0 && (
        <div className="sm:hidden">
          <MoreActionsMenu label={moreLabel} items={menuItems} />
        </div>
      )}

      {/* Notes bottom sheet (mobile). */}
      {hasNotes && (
        <Dialog open={notesSheetOpen} onOpenChange={setNotesSheetOpen}>
          <DialogContent>
            <DialogTitle className="sr-only">Notes</DialogTitle>
            <NoteThread
              inline
              tripId={tripId!}
              targetType={targetType}
              targetId={targetId}
              notes={notes!}
              currentUserId={currentUserId!}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Attachments bottom sheet (mobile). */}
      {hasAttachments && (
        <Dialog open={attachSheetOpen} onOpenChange={setAttachSheetOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Attachments</DialogTitle>
            </DialogHeader>
            <AttachmentList
              tripId={tripId}
              targetType={targetType}
              targetId={targetId}
              attachments={attachments!}
              compact
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
