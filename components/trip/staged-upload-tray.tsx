"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { uploadAttachment } from "@/server/actions/attachments";
import type { TargetType } from "@/lib/enum-values";
import { firstErrorMessage } from "@/components/ui/action-failure";
import { compressImage, oversizeUploadMessage } from "@/lib/image-compress";
import { ATTACHMENT_TITLE_MAX } from "@/lib/attachment-name";
import { isAttachmentMime } from "@/lib/attachment-mimes";
import { formatBytes } from "@/lib/format-bytes";

export interface StagedFile {
  key: string;
  file: File;
  title: string;
  error: string | null;
  uploadError?: string | null;
}

interface UploadTarget {
  tripId?: string;
  globeId?: string;
  targetType: TargetType;
  targetId?: string;
}

const DISALLOWED_TYPE = "Only PDFs, photos or text files can be added.";

function typeLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "text/plain") return "TXT";
  if (mime.startsWith("image/")) return mime.split("/")[1].toUpperCase();
  return "File";
}

export function useStagedUploads(target: UploadTarget) {
  const [staged, setStaged] = React.useState<StagedFile[]>([]);
  const [uploading, startUpload] = React.useTransition();
  const nextKey = React.useRef(0);

  async function addFiles(files: File[]) {
    const rows = await Promise.all(
      files.map(async (original): Promise<StagedFile> => {
        const key = `staged-${nextKey.current++}`;
        if (!isAttachmentMime(original.type)) {
          return { key, file: original, title: "", error: DISALLOWED_TYPE };
        }
        // Phone photos routinely exceed the upload cap raw; shrink images
        // client-side first (non-images pass through untouched).
        const file = await compressImage(original);
        return { key, file, title: "", error: oversizeUploadMessage(file) };
      }),
    );
    setStaged((prev) => [...prev, ...rows]);
  }

  function setTitle(key: string, title: string) {
    setStaged((prev) => prev.map((s) => (s.key === key ? { ...s, title } : s)));
  }

  function remove(key: string) {
    setStaged((prev) => prev.filter((s) => s.key !== key));
  }

  function uploadAll() {
    const rows = staged.filter((s) => s.error === null);
    startUpload(async () => {
      for (const row of rows) {
        const fd = new FormData();
        if (target.tripId) fd.set("tripId", target.tripId);
        if (target.globeId) fd.set("globeId", target.globeId);
        fd.set("targetType", target.targetType);
        if (target.targetId) fd.set("targetId", target.targetId);
        fd.set("file", row.file);
        fd.set("title", row.title);

        setStaged((prev) => prev.map((s) => (s.key === row.key ? { ...s, uploadError: null } : s)));

        let failure: string | null = null;
        try {
          const result = await uploadAttachment(fd);
          if (!result.success) failure = firstErrorMessage(result, "Couldn't upload that file.");
        } catch {
          failure = "Couldn't upload that file.";
        }
        setStaged((prev) =>
          failure === null
            ? prev.filter((s) => s.key !== row.key)
            : prev.map((s) => (s.key === row.key ? { ...s, uploadError: failure } : s)),
        );
      }
    });
  }

  return {
    staged,
    validCount: staged.filter((s) => s.error === null).length,
    uploading,
    addFiles,
    setTitle,
    remove,
    uploadAll,
  };
}

export function StagedUploadTray({
  tray,
  compact,
}: {
  tray: ReturnType<typeof useStagedUploads>;
  compact: boolean;
}) {
  if (tray.staged.length === 0) return null;
  const n = tray.validCount;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <p className={cn("font-bold text-foreground", compact ? "text-xs" : "text-sm")}>Ready to add</p>
      <ul className="space-y-2">
        {tray.staged.map(({ key, file, title, error, uploadError }) => (
          <li key={key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-semibold text-foreground", compact ? "text-xs" : "text-sm")}>
                  {file.name}
                </p>
                <p className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
                  {typeLabel(file.type)} · {formatBytes(file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 hover:bg-muted"
                aria-label={`Remove ${file.name}`}
                disabled={tray.uploading}
                onClick={() => tray.remove(key)}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <Input
              aria-label={`Title for ${file.name}`}
              placeholder={file.name}
              maxLength={ATTACHMENT_TITLE_MAX}
              value={title}
              disabled={tray.uploading}
              className={compact ? "h-9 px-3 text-xs sm:text-xs" : undefined}
              onChange={(e) => tray.setTitle(key, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
            {error ?? uploadError ? (
              <p
                role="alert"
                className="rounded-md border-2 border-destructive bg-card px-3 py-2 text-sm font-medium text-foreground"
              >
                {error ?? uploadError}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <Button
        type="button"
        size={compact ? "sm" : "md"}
        disabled={n === 0 || tray.uploading}
        onClick={tray.uploadAll}
      >
        {n === 0 ? "Add files" : `Add ${n} file${n === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
