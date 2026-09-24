"use client";

import * as React from "react";
import {
  FileText,
  Image as ImageIcon,
  File,
  Trash2,
  Upload,
  ExternalLink,
  Loader2,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { uploadAttachment, deleteAttachment } from "@/server/actions/attachments";
import type { TargetType } from "@/lib/enums";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { compressImage, oversizeUploadMessage } from "@/lib/image-compress";
import { AttachmentLink } from "@/components/trip/attachment-link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttachmentView {
  id: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
  uploadedById: string;
  createdAt: Date;
}

export interface AttachmentListProps {
  /** Trip-scoped attachments set `tripId`; Globe-scoped (Marker) attachments set `globeId`. Exactly one. */
  tripId?: string;
  globeId?: string;
  targetType: TargetType;
  targetId?: string;
  attachments: AttachmentView[];
  /**
   * If true, show a denser layout: smaller text, tighter row padding, and no
   * file-size label. Useful in sidebar or grouped-file contexts.
   */
  compact?: boolean;
  /**
   * Whether to show the upload trigger (dropzone / inline label). Defaults to
   * true so all existing callers are byte-identical. Set to false on grouped
   * entity lists where there is no single upload target.
   */
  showUpload?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MimeIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) {
    return <ImageIcon className={cn("text-hue-sky-text", className)} aria-hidden />;
  }
  if (mime === "application/pdf") {
    return <FileText className={cn("text-coral-text", className)} aria-hidden />;
  }
  return <File className={cn("text-muted-foreground", className)} aria-hidden />;
}

function mimeLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "text/plain") return "TXT";
  if (mime.startsWith("image/")) return mime.split("/")[1].toUpperCase();
  return "File";
}

/** Kit file tile label (together.jsx Files): "PDF" / "IMG" / "TXT" / "FILE". */
function tileLabel(mime: string): string {
  if (mime.startsWith("image/")) return "IMG";
  if (mime === "application/pdf") return "PDF";
  if (mime === "text/plain") return "TXT";
  return "FILE";
}

/**
 * Kit tile tone by what the file belongs to (together.jsx Files: coral
 * transport, lilac stay, teal trip, sun thing-to-do). Stops share the route
 * accent (teal); Journal the Journal hub tile (lilac); Markers stay white.
 */
const TILE_TONE: Record<TargetType, string> = {
  TRIP: "island bg-teal text-on-accent",
  STOP: "island bg-teal text-on-accent",
  TRANSPORT: "island bg-coral text-on-accent",
  ACCOMMODATION: "island bg-lilac text-on-accent",
  ITEM: "island bg-sun text-on-accent",
  JOURNAL: "island bg-lilac text-on-accent",
  MARKER: "bg-card text-foreground",
};

/** 44px icon target for card actions (links and buttons alike). */
const CARD_ACTION =
  "inline-flex size-11 items-center justify-center rounded-md transition-colors focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

const MONTH_SHORT_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format a Date as "D MMM YYYY" using UTC calendar date (e.g. "1 Jan 2026"). */
function formatAddedDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTH_SHORT_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttachmentList({
  tripId,
  globeId,
  targetType,
  targetId,
  attachments,
  compact = false,
  showUpload = true,
}: AttachmentListProps) {
  const [isPending, startTransition] = React.useTransition();
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    startTransition(async () => {
      // Phone photos routinely exceed the upload cap raw; shrink images
      // client-side first (non-images pass through untouched).
      const compressed = await compressImage(file);
      const oversize = oversizeUploadMessage(compressed);
      if (oversize) {
        setUploadError(oversize);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      const fd = new FormData();
      if (tripId) fd.set("tripId", tripId);
      if (globeId) fd.set("globeId", globeId);
      fd.set("targetType", targetType);
      if (targetId) fd.set("targetId", targetId);
      fd.set("file", compressed);

      const result = await uploadAttachment(fd);
      if (!result.success) {
        setUploadError(result.error);
      }
      // Reset the file input so the same file can be re-selected after an error.
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  async function handleDelete(id: string, filename: string) {
    const confirmed = await confirm({
      title: `Delete "${filename}"?`,
      description: "This attachment will be permanently removed.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteAttachment(id);
      setDeletingId(null);
    });
  }

  const inputId = `upload-${tripId ?? globeId}-${targetType}-${targetId ?? "root"}`;
  const uploading = isPending && !deletingId;

  const fileInput = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain"
      className="sr-only"
      onChange={handleFileChange}
      disabled={isPending}
    />
  );

  const errorAlert = uploadError ? (
    <p
      role="alert"
      className="rounded-md border-2 border-destructive bg-card px-3 py-2.5 text-sm font-medium text-foreground"
    >
      {uploadError}
    </p>
  ) : null;

  // ── Compact: dense list for dialogs, popovers and cards (unchanged shape) ──
  if (compact) {
    return (
      <>
      {dialog}
      <div className="space-y-3">
        {attachments.length > 0 ? (
          <AnimatedList as="ul" className="divide-y divide-border rounded-xl border border-border bg-card">
            {attachments.map((att) => (
              <AnimatedItem key={att.id} as="li" className="flex items-center gap-3 px-4 py-2">
                <MimeIcon mime={att.mime} className="size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-xs text-foreground">{att.filename}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {mimeLabel(att.mime)}
                    </Badge>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <AttachmentLink
                    href={att.url}
                    mime={att.mime}
                    label={`View ${att.filename}`}
                    className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </AttachmentLink>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:bg-destructive/10"
                    aria-label={`Delete ${att.filename}`}
                    disabled={isPending && deletingId === att.id}
                    onClick={() => handleDelete(att.id, att.filename)}
                  >
                    {isPending && deletingId === att.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 text-destructive" />
                    )}
                  </Button>
                </div>
              </AnimatedItem>
            ))}
          </AnimatedList>
        ) : null}

        {errorAlert}

        {showUpload && (
          <div>
            {fileInput}
            <label
              htmlFor={inputId}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary",
                isPending && "pointer-events-none opacity-50",
              )}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploading ? "Uploading…" : "Add file"}
            </label>
          </div>
        )}
      </div>
      </>
    );
  }

  // ── Full: kit Files grid (together.jsx) — upload tile first, then cards ──
  if (attachments.length === 0 && !showUpload) return <>{dialog}</>;

  return (
    <>
    {dialog}
    <div className="flex flex-col gap-3">
      {errorAlert}
      <AnimatedList
        as="ul"
        data-slot="file-grid"
        className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
      >
        {showUpload && (
          <li key="upload" className="flex">
            {fileInput}
            <label
              htmlFor={inputId}
              className={cn(
                "flex min-h-[90px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-soft p-4 text-center transition-colors hover:border-border md:min-h-[150px]",
                "has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                isPending && "pointer-events-none opacity-50",
              )}
            >
              {uploading ? (
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              ) : (
                <Paperclip className="size-6" aria-hidden="true" />
              )}
              <span className="font-display text-base font-extrabold tracking-[-0.02em]">
                {uploading ? "Uploading…" : "Tap to add a file"}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                PDF, photos or text, up to 4 MB
              </span>
            </label>
          </li>
        )}
        {attachments.map((att) => (
          <AnimatedItem key={att.id} as="li" className="flex">
            <Card
              data-slot="file-card"
              className="relative flex w-full items-center gap-3 p-3.5 md:flex-col md:items-start"
            >
              <span
                data-slot="file-tile"
                aria-hidden="true"
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-[10px] border-2 border-border text-[11px] font-extrabold md:size-12",
                  TILE_TONE[targetType],
                )}
              >
                {tileLabel(att.mime)}
              </span>

              <div className="min-w-0 flex-1 md:w-full md:pr-24">
                <p className="truncate text-sm font-extrabold text-foreground" title={att.filename}>
                  {att.filename}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                  {formatBytes(att.size)}
                  {" · added "}
                  {formatAddedDate(att.createdAt)}
                </p>
              </div>

              <div className="flex shrink-0 items-center md:absolute md:right-2 md:top-2">
                <AttachmentLink
                  href={att.url}
                  mime={att.mime}
                  label={`View ${att.filename}`}
                  className={cn(CARD_ACTION, "hover:bg-muted")}
                >
                  <ExternalLink className="size-[18px]" aria-hidden="true" />
                </AttachmentLink>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(CARD_ACTION, "text-destructive hover:bg-destructive/10")}
                  aria-label={`Delete ${att.filename}`}
                  disabled={isPending && deletingId === att.id}
                  onClick={() => handleDelete(att.id, att.filename)}
                >
                  {isPending && deletingId === att.id ? (
                    <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-[18px]" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </Card>
          </AnimatedItem>
        ))}
      </AnimatedList>
    </div>
    </>
  );
}
