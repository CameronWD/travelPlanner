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
import { ATTACHMENT_TITLE_MAX, attachmentName } from "@/lib/attachment-name";
import { isAttachmentMime, mimeLabel } from "@/lib/attachment-mimes";
import { toast } from "@/components/ui/use-toast";
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
const UPLOAD_FAILED = "Couldn't upload that file.";

interface Outcome {
  added: number;
  failures: { name: string; reason: string }[];
}

function nameOf(row: StagedFile): string {
  return attachmentName({ filename: row.file.name, title: row.title });
}

export function useStagedUploads(target: UploadTarget) {
  const [staged, setStaged] = React.useState<StagedFile[]>([]);
  const [uploading, startUpload] = React.useTransition();
  const [preparing, setPreparing] = React.useState(false);
  const nextKey = React.useRef(0);
  const stagedRef = React.useRef<StagedFile[]>([]);
  const claimed = React.useRef(new Set<string>());
  const uploadQueue = React.useRef<Promise<void>>(Promise.resolve());
  const prepQueue = React.useRef<Promise<void>>(Promise.resolve());
  const pendingPreps = React.useRef(0);
  const afterUnmount = React.useRef<Outcome | null>(null);
  const targetRef = React.useRef(target);

  React.useEffect(() => {
    targetRef.current = target;
  });

  function update(fn: (prev: StagedFile[]) => StagedFile[]) {
    stagedRef.current = fn(stagedRef.current);
    setStaged(stagedRef.current);
  }

  function uploadable(s: StagedFile) {
    return s.error === null && !claimed.current.has(s.key);
  }

  async function send(row: StagedFile): Promise<string | null> {
    const t = targetRef.current;
    const fd = new FormData();
    if (t.tripId) fd.set("tripId", t.tripId);
    if (t.globeId) fd.set("globeId", t.globeId);
    fd.set("targetType", t.targetType);
    if (t.targetId) fd.set("targetId", t.targetId);
    fd.set("file", row.file);
    fd.set("title", row.title);
    try {
      const result = await uploadAttachment(fd);
      return result.success ? null : firstErrorMessage(result, UPLOAD_FAILED);
    } catch {
      return UPLOAD_FAILED;
    }
  }

  function enqueue(row: StagedFile): Promise<void> {
    claimed.current.add(row.key);
    const run = uploadQueue.current.then(async () => {
      update((prev) => prev.map((s) => (s.key === row.key ? { ...s, uploadError: null } : s)));
      const failure = await send(row);
      claimed.current.delete(row.key);
      const outcome = afterUnmount.current;
      if (outcome) {
        update((prev) => prev.filter((s) => s.key !== row.key));
        if (failure === null) outcome.added++;
        else outcome.failures.push({ name: nameOf(row), reason: failure });
        return;
      }
      update((prev) =>
        failure === null
          ? prev.filter((s) => s.key !== row.key)
          : prev.map((s) => (s.key === row.key ? { ...s, uploadError: failure } : s)),
      );
    });
    uploadQueue.current = run;
    return run;
  }

  async function prepare(original: File): Promise<StagedFile> {
    const key = `staged-${nextKey.current++}`;
    if (!isAttachmentMime(original.type)) {
      return { key, file: original, title: "", error: DISALLOWED_TYPE };
    }
    // Phone photos routinely exceed the upload cap raw; shrink images
    // client-side first (non-images pass through untouched).
    const file = await compressImage(original);
    return { key, file, title: "", error: oversizeUploadMessage(file) };
  }

  async function addFiles(files: File[]) {
    pendingPreps.current++;
    setPreparing(true);
    const run = prepQueue.current.then(async () => {
      for (const original of files) {
        const row = await prepare(original);
        const outcome = afterUnmount.current;
        if (!outcome) update((prev) => [...prev, row]);
        else if (row.error !== null) outcome.failures.push({ name: nameOf(row), reason: row.error });
        else void enqueue(row);
      }
    });
    prepQueue.current = run;
    await run;
    if (--pendingPreps.current === 0) setPreparing(false);
  }

  function setTitle(key: string, title: string) {
    update((prev) => prev.map((s) => (s.key === key ? { ...s, title } : s)));
  }

  function remove(key: string) {
    update((prev) => prev.filter((s) => s.key !== key));
  }

  function uploadAll() {
    const rows = stagedRef.current.filter(uploadable);
    startUpload(async () => {
      await Promise.all(rows.map(enqueue));
    });
  }

  async function report(outcome: Outcome) {
    let tail: Promise<void>;
    do {
      await prepQueue.current;
      tail = uploadQueue.current;
      await tail;
    } while (tail !== uploadQueue.current);
    if (outcome.added > 0) {
      toast({ variant: "success", title: `Added ${outcome.added} file${outcome.added === 1 ? "" : "s"}` });
    }
    for (const { name, reason } of outcome.failures) {
      toast({ variant: "destructive", title: `Couldn't add ${name}`, description: reason });
    }
  }

  const uploadLeftovers = React.useEffectEvent(() => {
    const left = stagedRef.current.filter(uploadable);
    if (left.length === 0 && claimed.current.size === 0 && pendingPreps.current === 0) return;
    const outcome: Outcome = { added: 0, failures: [] };
    afterUnmount.current = outcome;
    left.forEach(enqueue);
    void report(outcome);
  });

  // Closing the host unmounts the tray; staged files are uploaded anyway and
  // reported by toast. StrictMode's dev remount reaches this with an empty
  // tray, so it does nothing then.
  React.useEffect(() => {
    afterUnmount.current = null;
    return () => uploadLeftovers();
  }, []);

  return {
    staged,
    validCount: staged.filter((s) => s.error === null).length,
    uploading,
    preparing,
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
  const idBase = React.useId();
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
                  {mimeLabel(file.type)} · {formatBytes(file.size)}
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
              id={`${idBase}-${key}`}
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
