"use client";

import * as React from "react";
import { BookOpen, Plus, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RowActions } from "@/components/ui/row-actions";
import { ChapterChip } from "@/components/trip/chapter-chip";
import { ChapterFormDialog, type ChapterFormDialogChapter } from "./chapter-form-dialog";
import { deleteChapter, suggestChaptersFromCountries } from "@/server/actions/chapters";
import { formatDateRange } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChaptersManagerProps {
  tripId: string;
  chapters: ChapterFormDialogChapter[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChaptersManager({ tripId, chapters }: ChaptersManagerProps) {
  const { confirm, dialog } = useConfirm();
  // ── Dialog state ──
  const [addOpen, setAddOpen] = React.useState(false);
  const [editingChapter, setEditingChapter] =
    React.useState<ChapterFormDialogChapter | null>(null);

  // ── Pending mutations ──
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [isSuggesting, startSuggestTransition] = React.useTransition();

  // ── Error state ──
  const [error, setError] = React.useState<string | null>(null);

  // ── Handlers ──
  async function handleDelete(chapter: ChapterFormDialogChapter) {
    const confirmed = await confirm({
      title: `Delete chapter "${chapter.name}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;

    setError(null);
    setPendingId(chapter.id);
    try {
      const result = await deleteChapter(chapter.id);
      if (!result.success) {
        setError("Couldn't delete that chapter. Please try again.");
      }
    } finally {
      setPendingId(null);
    }
  }

  function handleSuggest() {
    setError(null);
    startSuggestTransition(async () => {
      const result = await suggestChaptersFromCountries(tripId);
      if (!result.success) {
        setError("Couldn't suggest chapters. Please try again.");
      }
    });
  }

  const hasChapters = chapters.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-sm font-medium text-destructive">{error}</p>
      )}
      {hasChapters ? (
        <div className="flex flex-col gap-2">
          {chapters.map((chapter) => {
            const isPending = pendingId === chapter.id;
            return (
              <div
                key={chapter.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 transition-opacity",
                  isPending && "pointer-events-none opacity-60",
                )}
              >
                {/* Left: chip + date range */}
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <ChapterChip name={chapter.name} colour={chapter.colour} />
                  <span className="text-sm text-muted-foreground">
                    {chapter.startDate && chapter.endDate
                      ? formatDateRange(chapter.startDate, chapter.endDate)
                      : "No dates"}
                  </span>
                </div>

                {/* Right: edit + delete */}
                <RowActions
                  onEdit={() => setEditingChapter(chapter)}
                  onDelete={() => handleDelete(chapter)}
                  editLabel={`Edit ${chapter.name}`}
                  deleteLabel={`Delete ${chapter.name}`}
                  disabled={isPending}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No chapters yet."
          description="Chapters are optional — use them to group stops into named segments of your trip."
          action={
            <Button variant="outline" size="md" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add Chapter
            </Button>
          }
        />
      )}

      {/* Actions row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          variant="outline"
          size="md"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add Chapter
        </Button>
        <Button
          variant="ghost"
          size="md"
          onClick={handleSuggest}
          disabled={isSuggesting}
          loading={isSuggesting}
        >
          <Wand2 className="size-4" aria-hidden="true" />
          Suggest from countries
        </Button>
      </div>

      {/* ─── Dialogs ─── */}

      {/* Add chapter */}
      <ChapterFormDialog
        tripId={tripId}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {/* Edit chapter */}
      {editingChapter && (
        <ChapterFormDialog
          tripId={tripId}
          chapter={editingChapter}
          open={Boolean(editingChapter)}
          onOpenChange={(open) => {
            if (!open) setEditingChapter(null);
          }}
        />
      )}

      {dialog}
    </div>
  );
}
