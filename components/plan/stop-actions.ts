import * as React from "react";
import {
  Pencil,
  CalendarClock,
  Pin,
  Sparkles,
  ChevronUp,
  ChevronDown,
  CalendarPlus,
  BookOpen,
  FolderInput,
  Bell,
  MessageCircle,
  Paperclip,
  Trash2,
  Gift,
} from "lucide-react";
import type { CardActionItem } from "@/components/trip/card-actions";
import type { SurpriseView } from "@/lib/surprise";

export interface StopActionFlags {
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  isOwner: boolean;
  chaptersEnabled: boolean;
  canRemind: boolean;
  notesCount: number | null;
  filesCount: number | null;
  /** The Stop's live Surprise as this viewer sees it (CONTEXT.md **Surprise**), or null. */
  surprise: SurpriseView | null;
  /** Only the planner may reveal it; being the owner earns no peek. */
  currentUserId?: string;
  /** The Stop is the only one in a dated Trip's plan (ADR 0073): it keeps the Trip's dates, so no Make rough. */
  loneOnDatedTrip: boolean;
}

export interface StopActionHandlers {
  onEdit(): void;
  onAdjustDates(): void;
  onTogglePin(): void;
  onMakeRough(): void;
  onMoveUp(): void;
  onMoveDown(): void;
  onGiveDates(): void;
  onStartChapter(): void;
  onAssignChapter(): void;
  onAddReminder(): void;
  onNotes(): void;
  onFiles(): void;
  onDelete(): void;
  onMakeSurprise(): void;
  onRevealSurprise(): void;
}

interface Stop {
  name: string;
  arriveDate: string | null;
  departDate: string | null;
  pinned: boolean;
}

function icon(Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>, extra?: string) {
  return React.createElement(Icon, { className: extra ? `size-4 ${extra}` : "size-4", "aria-hidden": true });
}

/**
 * The ⋯ menu items for a stop card, grouped for both the desktop dropdown
 * (`MoreActionsMenu`'s `groups`) and the mobile `StopActionsSheet`. Pure —
 * no rendering here, just which items apply and what each one does.
 */
export function buildStopActions(
  stop: Stop,
  flags: StopActionFlags,
  h: StopActionHandlers,
): CardActionItem[][] {
  const rough = !stop.arriveDate || !stop.departDate;
  const { isFirst, isLast, isPending, isOwner, chaptersEnabled, canRemind, notesCount, filesCount, surprise, loneOnDatedTrip } = flags;
  // A surprised Traveller can look at the outside but not touch it: no menu at all.
  if (surprise?.youAreSurprised) return [];

  const surpriseItems: CardActionItem[] = [];
  if (surprise === null) {
    surpriseItems.push({
      key: "surprise",
      label: "Make it a surprise",
      icon: icon(Gift),
      hint: "hide what's inside from someone",
      onSelect: h.onMakeSurprise,
      disabled: isPending,
    });
  } else if (!surprise.youAreSurprised && surprise.plannerId === flags.currentUserId) {
    surpriseItems.push({
      key: "reveal",
      label: "Reveal the surprise",
      icon: icon(Gift),
      hint: "everyone sees inside",
      onSelect: h.onRevealSurprise,
      disabled: isPending,
    });
  }

  const group1: CardActionItem[] = [
    { key: "edit", label: "Edit name & place", icon: icon(Pencil), onSelect: h.onEdit, disabled: isPending },
  ];

  if (!rough) {
    group1.push(
      {
        key: "adjust-dates",
        label: "Adjust dates",
        icon: icon(CalendarClock),
        hint: "moves later stops",
        onSelect: h.onAdjustDates,
        disabled: isPending,
      },
      {
        key: "pin",
        label: stop.pinned ? "Unpin dates" : "Pin dates",
        icon: icon(Pin, stop.pinned ? "fill-current" : undefined),
        hint: "stops the shuffle",
        onSelect: h.onTogglePin,
        disabled: isPending,
      },
      ...surpriseItems,
    );
    if (!loneOnDatedTrip) {
      group1.push({
        key: "make-rough",
        label: "Make rough",
        icon: icon(Sparkles),
        onSelect: h.onMakeRough,
        disabled: isPending,
      });
    }
  } else {
    group1.push(
      { key: "up", label: "Move up", icon: icon(ChevronUp), onSelect: h.onMoveUp, disabled: isFirst || isPending },
      { key: "down", label: "Move down", icon: icon(ChevronDown), onSelect: h.onMoveDown, disabled: isLast || isPending },
      { key: "give-dates", label: "Give it dates", icon: icon(CalendarPlus), onSelect: h.onGiveDates, disabled: isPending },
      ...surpriseItems,
    );
  }

  const group2: CardActionItem[] = [];
  if (chaptersEnabled) {
    group2.push({
      key: "start-chapter",
      label: "Start a chapter here",
      icon: icon(BookOpen),
      onSelect: h.onStartChapter,
      disabled: isPending,
    });
    if (rough) {
      group2.push({
        key: "assign-chapter",
        label: "Assign to chapter",
        icon: icon(FolderInput),
        onSelect: h.onAssignChapter,
        disabled: isPending,
      });
    }
  }
  if (canRemind) {
    group2.push({
      key: "add-reminder",
      label: "Add a reminder",
      icon: icon(Bell),
      onSelect: h.onAddReminder,
      disabled: isPending,
    });
  }
  if (notesCount !== null) {
    group2.push({
      key: "notes",
      label: notesCount > 0 ? `Notes (${notesCount})` : "Notes",
      icon: icon(MessageCircle),
      onSelect: h.onNotes,
    });
  }
  if (filesCount !== null) {
    group2.push({
      key: "files",
      label: filesCount > 0 ? `Files (${filesCount})` : "Files",
      icon: icon(Paperclip),
      onSelect: h.onFiles,
    });
  }

  const group3: CardActionItem[] = [];
  if (isOwner) {
    group3.push({
      key: "delete",
      label: `Delete ${stop.name}`,
      icon: icon(Trash2),
      hint: "owner only",
      destructive: true,
      onSelect: h.onDelete,
      disabled: isPending,
    });
  }

  return [group1, group2, group3].filter((group) => group.length > 0);
}
