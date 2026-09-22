"use client";

import * as React from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";
import { saveJournalEntry, deleteJournalEntry } from "@/server/actions/journal";
import { uploadAttachment, deleteAttachment } from "@/server/actions/attachments";
import { compressImage, oversizeUploadMessage } from "@/lib/image-compress";
import type { AttachmentView } from "@/components/trip/attachment-list";
import { AttachmentLink } from "@/components/trip/attachment-link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalEditorProps {
  tripId: string;
  date: string; // YYYY-MM-DD
  initialBody: string;
  updatedAt?: Date | null;
  photos: AttachmentView[];
}

// ---------------------------------------------------------------------------
// Photo strip sub-component
// ---------------------------------------------------------------------------

function PhotoStrip({
  tripId,
  date,
  photos,
}: {
  tripId: string;
  date: string;
  photos: AttachmentView[];
}) {
  const [isPending, startTransition] = React.useTransition();
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    startTransition(async () => {
      const compressed = await compressImage(file);
      const oversize = oversizeUploadMessage(compressed);
      if (oversize) {
        setUploadError(oversize);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      const fd = new FormData();
      fd.set("tripId", tripId);
      fd.set("targetType", "JOURNAL");
      fd.set("targetId", date);
      fd.set("file", compressed);
      const result = await uploadAttachment(fd);
      if (!result.success) {
        setUploadError(result.error);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      await deleteAttachment(id);
      setDeletingId(null);
    });
  }

  return (
    <div className="space-y-3">
      {/* Photo grid */}
      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative">
              <AttachmentLink
                href={photo.url}
                mime={photo.mime}
                label={`View photo ${photo.filename}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.filename}
                  className="h-24 w-full rounded-xl object-cover transition-opacity group-hover:opacity-80"
                />
              </AttachmentLink>
              <button
                type="button"
                aria-label={`Delete photo ${photo.filename}`}
                disabled={isPending && deletingId === photo.id}
                onClick={() => handleDelete(photo.id)}
                className={cn(
                  "absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100",
                  isPending && deletingId === photo.id && "opacity-100",
                )}
              >
                {isPending && deletingId === photo.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <span aria-hidden className="text-xs leading-none">
                    ×
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Upload error */}
      <FormError>{uploadError ?? undefined}</FormError>

      {/* Upload control */}
      <div>
        <input
          ref={inputRef}
          id={`journal-photo-${tripId}-${date}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={handleFileChange}
          disabled={isPending}
        />
        <label
          htmlFor={`journal-photo-${tripId}-${date}`}
          className={cn(
            "inline-flex size-14 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-dashed border-border transition-colors hover:border-primary hover:text-primary",
            isPending && !deletingId && "pointer-events-none opacity-50",
          )}
        >
          {isPending && !deletingId ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

export function JournalEditor({
  tripId,
  date,
  initialBody,
  updatedAt,
  photos,
}: JournalEditorProps) {
  const [body, setBody] = React.useState(initialBody);
  // The body last known to be persisted — diffed against `body` to decide
  // whether there are unsaved changes. Starts at `initialBody` (what the
  // server loaded) and is advanced on every successful save or delete, so
  // "Save" and "Remove entry" reflect reality even though `initialBody`
  // itself (a prop) never changes for the life of this component instance.
  const [baseline, setBaseline] = React.useState(initialBody);
  const [isSaving, startTransition] = React.useTransition();
  const [isDeleting, startDeleteTransition] = React.useTransition();
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // lastSaved doubles as "does a persisted entry currently exist" — it
  // starts from the server-loaded updatedAt, moves forward on every save,
  // and resets to null once the entry is removed.
  const [lastSaved, setLastSaved] = React.useState<Date | null>(
    updatedAt ?? null,
  );
  const [saveStatus, setSaveStatus] = React.useState<"saving" | "saved" | null>(null);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const { confirm, dialog } = useConfirm();

  // Tracks whichever saveJournalEntry call is currently in flight, so a
  // delete can wait for it to land rather than race it (ARCH-DAT-6 fix
  // round 1, Finding 1). Blur-triggered autosave and the explicit Remove
  // button share this editor instance, and the browser fires
  // mousedown → blur → click when Remove is clicked while the textarea has
  // unsaved edits — so handleSave() can already be in flight by the time
  // handleDelete() runs. Without serialising them, a slow save's upsert can
  // resolve *after* the delete's deleteMany and resurrect the row the
  // Traveller just confirmed removing.
  const pendingSaveRef = React.useRef<Promise<void> | null>(null);
  // Referenced by handleBlur to recognise "focus is moving to Remove".
  const removeButtonRef = React.useRef<HTMLButtonElement>(null);

  function handleSave() {
    // Cancel any pending timer before starting a new save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setSaveError(null);
    setSaveStatus("saving");

    // Capture the in-flight promise in a ref *before* handing it to
    // startTransition, so handleDelete can await the actual network/state
    // work regardless of how fast or slow it is.
    let markDone: () => void;
    const done = new Promise<void>((resolve) => {
      markDone = resolve;
    });
    pendingSaveRef.current = done;

    startTransition(async () => {
      try {
        const result = await saveJournalEntry(tripId, date, body);
        if (!result.success) {
          const firstError = Object.values(result.errors)[0]?.[0];
          setSaveError(firstError ?? "Failed to save.");
          setSaveStatus(null);
        } else {
          setBaseline(body);
          setLastSaved(new Date());
          setSaveStatus("saved");
          saveTimerRef.current = setTimeout(() => setSaveStatus(null), 2000);
        }
      } finally {
        markDone();
        if (pendingSaveRef.current === done) {
          pendingSaveRef.current = null;
        }
      }
    });
  }

  // Cleanup: cancel timer on unmount
  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function handleBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    // Skip the autosave outright when focus is moving straight to the
    // Remove control — that click is about to explicitly delete this entry,
    // so kicking off a save we're just going to have to wait on (or worse,
    // forgetting to wait on it) is pure waste. This is a UX/efficiency
    // optimisation only, not the correctness fix: it covers the common
    // mouse-click path but not every way a save could already be in flight
    // (keyboard activation, an earlier blur, etc.) — handleDelete's await
    // on pendingSaveRef below is what actually guarantees ordering.
    if (e.relatedTarget === removeButtonRef.current) return;
    // Autosave on blur if body changed from the last-known-persisted value
    if (body !== baseline) {
      handleSave();
    }
  }

  // Removing an entry is a separate, explicit, confirmed action — blanking
  // the textarea and letting it autosave must never delete (ARCH-DAT-6).
  async function handleDelete() {
    const confirmed = await confirm({
      title: "Remove your journal entry?",
      description:
        "This removes only your own entry for this day. It can't be undone.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;

    // Correctness fix (fix round 1, Finding 1): if a save is still in
    // flight, wait for it to land *before* issuing the delete. This
    // guarantees deleteJournalEntry's deleteMany always runs strictly after
    // any earlier saveJournalEntry's upsert has resolved on the server, no
    // matter how slow that save is — so the DB can never end up with a row
    // the Traveller just explicitly confirmed removing.
    if (pendingSaveRef.current) {
      await pendingSaveRef.current;
    }

    startDeleteTransition(async () => {
      const result = await deleteJournalEntry(tripId, date);
      if (result.success) {
        setBody("");
        setBaseline("");
        setLastSaved(null);
        setSaveStatus(null);
        setSaveError(null);
      }
    });
  }

  const hasChanges = body !== baseline;
  const hasEntry = lastSaved !== null;

  // Format date label for header (YYYY-MM-DD → e.g. "Monday 1 Jun 2026")
  const dateLabel = React.useMemo(() => {
    try {
      return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return date;
    }
  }, [date]);

  return (
    <>
      {dialog}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="space-y-3">
          {/* Header row: date label + combined save status / char count */}
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold text-foreground">
              {dateLabel}
            </span>
            {/* role="status" aria-live="polite" — always mounted, stable position */}
            <p
              role="status"
              aria-live="polite"
              className="text-[11px] font-medium text-success"
            >
              {saveStatus === "saving"
                ? "Saving…"
                : saveStatus === "saved"
                  ? "Saved"
                  : lastSaved
                    ? "Saved"
                    : ""}
              {" · "}
              {body.length}/5000
            </p>
          </div>

          {/* Text area */}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={handleBlur}
            placeholder="How was today? Jot a memory…"
            rows={6}
            maxLength={5000}
            className="rounded-xl resize-none"
            aria-label="Journal entry"
            disabled={isSaving}
          />

          {/* Save error */}
          <FormError>{saveError ?? undefined}</FormError>

          {/* Action row — Remove entry (left, once an entry exists) and Save
              (right, once there are unsaved changes) */}
          {hasEntry || hasChanges ? (
            <div className="flex items-center justify-between">
              {hasEntry ? (
                <Button
                  ref={removeButtonRef}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isSaving || isDeleting}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {isDeleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Remove entry
                </Button>
              ) : (
                <span />
              )}
              {hasChanges ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving || isDeleting}
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {isSaving ? "Saving…" : "Save"}
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Photo strip */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">Photos</h4>
            <PhotoStrip tripId={tripId} date={date} photos={photos} />
          </div>
        </div>
      </div>
    </>
  );
}
