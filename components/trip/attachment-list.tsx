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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { uploadAttachment, deleteAttachment } from "@/server/actions/attachments";
import type { TargetType } from "@/lib/enums";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
    return <ImageIcon className={cn("text-blue-500", className)} aria-hidden />;
  }
  if (mime === "application/pdf") {
    return <FileText className={cn("text-red-500", className)} aria-hidden />;
  }
  return <File className={cn("text-muted-foreground", className)} aria-hidden />;
}

function mimeLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "text/plain") return "TXT";
  if (mime.startsWith("image/")) return mime.split("/")[1].toUpperCase();
  return "File";
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

    const fd = new FormData();
    if (tripId) fd.set("tripId", tripId);
    if (globeId) fd.set("globeId", globeId);
    fd.set("targetType", targetType);
    if (targetId) fd.set("targetId", targetId);
    fd.set("file", file);

    startTransition(async () => {
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

  return (
    <>
    {dialog}
    <div className="space-y-3">
      {/* File list */}
      {attachments.length > 0 ? (
        <AnimatedList as="ul" className="divide-y divide-border rounded-xl border border-border bg-card">
          {attachments.map((att) => (
            <AnimatedItem
              key={att.id}
              as="li"
              className={cn(
                "flex items-center gap-3 px-4",
                compact ? "py-2" : "py-3",
              )}
            >
              {/* Icon */}
              <MimeIcon mime={att.mime} className="size-5 shrink-0" />

              {/* Name + meta */}
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-medium text-foreground", compact ? "text-xs" : "text-sm")}>
                  {att.filename}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {mimeLabel(att.mime)}
                  </Badge>
                  {/* In compact mode the size label is suppressed for a denser row */}
                  {!compact && (
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(att.size)}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${att.filename}`}
                  className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>

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

      {/* Upload error */}
      {uploadError ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {uploadError}
        </p>
      ) : null}

      {/* Upload control */}
      <div>
        <input
          ref={inputRef}
          id={`upload-${tripId ?? globeId}-${targetType}-${targetId ?? "root"}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain"
          className="sr-only"
          onChange={handleFileChange}
          disabled={isPending}
        />
        <label
          htmlFor={`upload-${tripId ?? globeId}-${targetType}-${targetId ?? "root"}`}
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary",
            isPending && "pointer-events-none opacity-50",
          )}
        >
          {isPending && !deletingId ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {isPending && !deletingId ? "Uploading…" : "Add file"}
        </label>
      </div>
    </div>
    </>
  );
}
