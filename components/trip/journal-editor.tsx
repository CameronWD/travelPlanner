"use client";

import * as React from "react";
import { Camera, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/relative-time";
import { saveJournalEntry } from "@/server/actions/journal";
import { uploadAttachment, deleteAttachment } from "@/server/actions/attachments";
import type { AttachmentView } from "@/components/trip/attachment-list";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalAuthor {
  id: string;
  name: string | null;
  image: string | null;
}

export interface JournalEditorProps {
  tripId: string;
  date: string; // YYYY-MM-DD
  initialBody: string;
  updatedAt?: Date | null;
  author?: JournalAuthor | null;
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

    const fd = new FormData();
    fd.set("tripId", tripId);
    fd.set("targetType", "JOURNAL");
    fd.set("targetId", date);
    fd.set("file", file);

    startTransition(async () => {
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
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative">
              <a
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View photo ${photo.filename}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.filename}
                  className="h-24 w-24 rounded-lg object-cover transition-opacity group-hover:opacity-80"
                />
              </a>
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
            "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary",
            isPending && !deletingId && "pointer-events-none opacity-50",
          )}
        >
          {isPending && !deletingId ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
          {isPending && !deletingId ? "Uploading…" : "Add photo"}
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
  author,
  photos,
}: JournalEditorProps) {
  const [body, setBody] = React.useState(initialBody);
  const [isSaving, startTransition] = React.useTransition();
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSaved, setLastSaved] = React.useState<Date | null>(
    updatedAt ?? null,
  );

  function handleSave() {
    setSaveError(null);
    startTransition(async () => {
      const result = await saveJournalEntry(tripId, date, body);
      if (!result.success) {
        const firstError = Object.values(result.errors)[0]?.[0];
        setSaveError(firstError ?? "Failed to save.");
      } else {
        setLastSaved(new Date());
      }
    });
  }

  function handleBlur() {
    // Autosave on blur if body changed from initial
    if (body !== initialBody) {
      handleSave();
    }
  }

  const hasChanges = body !== initialBody;

  return (
    <div className="space-y-4">
      {/* Text area */}
      <div className="relative">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={handleBlur}
          placeholder="How was today? Jot down your thoughts, highlights, and moments worth remembering…"
          rows={6}
          maxLength={5000}
          className="resize-none"
          aria-label="Journal entry"
          disabled={isSaving}
        />
        <div className="mt-1 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {body.length}/5000
          </div>
          {lastSaved && author ? (
            <p className="text-xs text-muted-foreground">
              Last edited by {author.name ?? "someone"}{" "}
              {relativeTime(lastSaved)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Save error */}
      <FormError>{saveError ?? undefined}</FormError>

      {/* Save button — visible when there are unsaved changes */}
      {hasChanges ? (
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}

      {/* Photo strip */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Photos</h4>
        <PhotoStrip tripId={tripId} date={date} photos={photos} />
      </div>
    </div>
  );
}
