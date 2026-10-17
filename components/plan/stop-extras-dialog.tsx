"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NoteThread, type NoteView } from "@/components/trip/note-thread";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import { ReminderList } from "@/components/trip/reminder-list";
import type { ReminderItem } from "@/server/actions/reminders";
import type { ExtrasKind } from "./stop-open-body";

const TITLES: Record<ExtrasKind, string> = {
  notes: "Notes",
  files: "Files",
  reminders: "Reminders",
};

export interface StopExtrasDialogProps {
  kind: ExtrasKind | null;
  onOpenChange(open: boolean): void;
  tripId: string;
  stopId: string;
  stopName: string;
  notes: NoteView[];
  attachments: AttachmentView[];
  reminders: ReminderItem[];
  currentUserId?: string;
  onAddReminder?: () => void;
}

/**
 * The extras dialog (spec §D2): a Dialog (desktop) / sheet (mobile, via the
 * shared Dialog component) hosting the existing NotesSection / AttachmentList
 * / reminders list for a Stop — no re-implementation of their logic.
 */
export function StopExtrasDialog({
  kind,
  onOpenChange,
  tripId,
  stopId,
  stopName,
  notes,
  attachments,
  reminders,
  currentUserId,
  onAddReminder,
}: StopExtrasDialogProps) {
  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {kind ? TITLES[kind] : ""} · {stopName}
          </DialogTitle>
        </DialogHeader>

        {kind === "notes" && currentUserId && (
          <NoteThread inline tripId={tripId} targetType="STOP" targetId={stopId} notes={notes} currentUserId={currentUserId} />
        )}

        {kind === "files" && <AttachmentList tripId={tripId} targetType="STOP" targetId={stopId} attachments={attachments} compact />}

        {kind === "reminders" && <ReminderList reminders={reminders} onAdd={onAddReminder} />}
      </DialogContent>
    </Dialog>
  );
}
