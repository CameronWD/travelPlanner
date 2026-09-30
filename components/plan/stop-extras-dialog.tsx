"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NoteThread, type NoteView } from "@/components/trip/note-thread";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import { formatDayLabel } from "@/lib/dates";
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

        {kind === "reminders" && (
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col gap-1">
              {reminders.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <Bell className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 break-words text-foreground">{r.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDayLabel(r.date)}</span>
                </li>
              ))}
            </ul>
            {onAddReminder && (
              <Button variant="outline" size="sm" className="self-start" onClick={onAddReminder}>
                <Bell className="size-3.5" aria-hidden="true" />
                Add a reminder
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
