"use client";

import * as React from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";
import { saveJournalEntry, deleteJournalEntry, setJournalShareHidden } from "@/server/actions/journal";
import { uploadAttachment, deleteAttachment } from "@/server/actions/attachments";
import { compressImage, oversizeUploadMessage } from "@/lib/image-compress";
import { JOURNAL_NOTE_MAX } from "@/lib/journal-window";
import { journalBodyExceedsLimit } from "@/lib/journal-window";
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
  /** This Traveller's one Journal photo for the day (spec K) — `null` when
   * they haven't added one yet. */
  photo: AttachmentView | null;
  /** This Traveller's OTHER Journal photos for the day, beyond `photo` —
   * only a legacy multi-photo day has any (spec K: "existing multi-photo
   * days are kept and displayed unchanged"). Shown read-only under the
   * editor's own photo slot. */
  extraPhotos?: AttachmentView[];
  /** Initial value of the "Keep off Share links" switch (spec L). */
  hiddenFromShares?: boolean;
  /** Kit `Card` shell (default, day view). Pass `false` when the editor
   * already sits inside another kit Card (the Journal page's day Card,
   * Today's journal), so cards don't nest. */
  framed?: boolean;
}

// ---------------------------------------------------------------------------
// Photo slot sub-component — one photo per author per date (spec K)
// ---------------------------------------------------------------------------

function PhotoSlot({
  tripId,
  date,
  photo,
}: {
  tripId: string;
  date: string;
  photo: AttachmentView | null;
}) {
  const [isPending, startTransition] = React.useTransition();
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();

  function resetInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    startTransition(async () => {
      const compressed = await compressImage(file);
      const oversize = oversizeUploadMessage(compressed);
      if (oversize) {
        setUploadError(oversize);
        resetInput();
        return;
      }

      if (photo) {
        const confirmed = await confirm({
          title: "Replace your photo for this day?",
          description: "This swaps out your existing photo for this day. It can't be undone.",
          confirmLabel: "Replace",
          destructive: true,
        });
        if (!confirmed) {
          resetInput();
          return;
        }
      }

      const fd = new FormData();
      fd.set("tripId", tripId);
      fd.set("targetType", "JOURNAL");
      fd.set("targetId", date);
      fd.set("file", compressed);
      if (photo) fd.set("replace", "1");
      const result = await uploadAttachment(fd);
      if (!result.success) {
        setUploadError(result.error);
      }
      resetInput();
    });
  }

  function handleRemove() {
    if (!photo) return;
    setIsDeleting(true);
    startTransition(async () => {
      await deleteAttachment(photo.id);
      setIsDeleting(false);
    });
  }

  return (
    <div className="space-y-3">
      {dialog}

      {photo ? (
        <div className="group relative w-fit">
          <AttachmentLink href={photo.url} mime={photo.mime} label={`View photo ${photo.filename}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.filename}
              loading="lazy"
              decoding="async"
              width={96}
              height={96}
              className="h-24 w-24 rounded-md border-2 border-border object-cover transition-opacity group-hover:opacity-80"
            />
          </AttachmentLink>
          <button
            type="button"
            aria-label={`Remove photo ${photo.filename}`}
            disabled={isDeleting}
            onClick={handleRemove}
            className={cn(
              "absolute right-1 top-1 flex size-7 items-center justify-center rounded-full border-2 border-border bg-card text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']",
              isDeleting && "opacity-100",
            )}
          >
            {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <span aria-hidden className="text-xs leading-none">×</span>}
          </button>
        </div>
      ) : null}

      <FormError>{uploadError ?? undefined}</FormError>

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
            "inline-flex size-14 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-border-soft text-muted-foreground transition-colors hover:border-border hover:text-foreground",
            isPending && "pointer-events-none opacity-50",
          )}
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" aria-hidden="true" />}
          <span className="sr-only">{photo ? "Replace photo" : "Add a photo"}</span>
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
  photo,
  extraPhotos = [],
  hiddenFromShares: initialHiddenFromShares = false,
  framed = true,
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
  const [hiddenFromShares, setHiddenFromShares] = React.useState(initialHiddenFromShares);
  const [hiddenError, setHiddenError] = React.useState<string | null>(null);
  const [, startHiddenTransition] = React.useTransition();
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

  // Spec K: new/changed text over JOURNAL_NOTE_MAX is refused server-side —
  // mirrored client-side against `baseline` (not the original `initialBody`
  // prop) so it stays correct as saves advance the baseline. A legacy entry
  // already over the cap stays exempt for as long as it's resaved unchanged
  // — `overLimit` drives Save-disabling/autosave-blocking, while `overCap`
  // (length alone) drives the always-visible "shorten to edit" note, since
  // a legacy note sitting unchanged at 600 chars still needs that reminder
  // even though there's nothing un-saved to block yet.
  const overCap = body.length > JOURNAL_NOTE_MAX;
  const overLimit = journalBodyExceedsLimit(body, baseline);

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
    // Autosave on blur if body changed from the last-known-persisted value,
    // and it isn't refused for length (over the cap and actually changed).
    if (body !== baseline && !overLimit) {
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

  function handleHiddenChange(next: boolean) {
    // Optimistic — the switch "applies immediately" — but rolled back if the
    // save actually fails (fix round 1, Finding 4: this previously ignored
    // the result entirely, so a refused/erroring save left the switch
    // showing a state that was never persisted).
    const previous = hiddenFromShares;
    setHiddenFromShares(next);
    setHiddenError(null);
    startHiddenTransition(async () => {
      const result = await setJournalShareHidden(tripId, date, next);
      if (!result.success) {
        setHiddenFromShares(previous);
        const firstError = Object.values(result.errors)[0]?.[0];
        setHiddenError(firstError ?? "Failed to update.");
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

  const hiddenSwitchId = `journal-hidden-${tripId}-${date}`;

  const content = (
    <div className="space-y-3">
      {/* Header row: date label + combined save status / char count */}
      <div className="flex items-center justify-between">
        <span className="font-display text-base font-extrabold tracking-[-0.02em] text-foreground">
          {dateLabel}
        </span>
        {/* role="status" aria-live="polite" — always mounted, stable position */}
        <p
          role="status"
          aria-live="polite"
          className="text-[11px] font-medium text-teal-text"
        >
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "saved"
              ? "Saved"
              : lastSaved
                ? "Saved"
                : ""}
          {" · "}
          <span className={overCap ? "text-destructive" : undefined}>
            {body.length} / {JOURNAL_NOTE_MAX}
          </span>
        </p>
      </div>

      {/* Text area */}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={handleBlur}
        placeholder="How was today? Jot a memory…"
        rows={6}
        className="resize-none"
        aria-label="Journal entry"
        disabled={isSaving}
      />

      {overCap ? (
        <p className="text-xs font-semibold text-destructive">
          Shorten to under {JOURNAL_NOTE_MAX} to edit
        </p>
      ) : null}

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
              loading={isSaving}
              disabled={isSaving || isDeleting || overLimit}
            >
              <Save className="size-4" />
              Save
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Photo slot */}
      <div className="space-y-2">
        <h4 className="text-label text-muted-foreground">Photo</h4>
        <PhotoSlot tripId={tripId} date={date} photo={photo} />
        {extraPhotos.length > 0 ? (
          <ul data-slot="journal-extra-photos" aria-label="Your earlier photos for this day" className="flex flex-wrap gap-2">
            {extraPhotos.map((extra) => (
              <li key={extra.id}>
                <AttachmentLink
                  href={extra.url}
                  mime={extra.mime}
                  label={`View photo ${extra.filename}`}
                  className="block rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={extra.url}
                    alt={extra.filename}
                    loading="lazy"
                    decoding="async"
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-md border-2 border-border object-cover transition-opacity hover:opacity-80"
                  />
                </AttachmentLink>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Keep off Share links (spec L / ADR 0051 amendment) */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center gap-2">
          <label htmlFor={hiddenSwitchId} className="text-xs font-semibold text-muted-foreground">
            Keep off Share links
          </label>
          <Switch id={hiddenSwitchId} checked={hiddenFromShares} onCheckedChange={handleHiddenChange} />
        </div>
        <FormError>{hiddenError ?? undefined}</FormError>
      </div>
    </div>
  );

  return (
    <>
      {dialog}
      {framed ? <Card className="p-4">{content}</Card> : content}
    </>
  );
}
