"use client";

import * as React from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { useOnlineStatus } from "@/components/ui/use-online-status";
import { compressImage, oversizeUploadMessage } from "@/lib/image-compress";
import { FEEDBACK_PICTURE_MIMES, MAX_FEEDBACK_PICTURES } from "@/lib/feedback/pictures";

const TOO_MANY = `Up to ${MAX_FEEDBACK_PICTURES} pictures per note.`;
const NEEDS_CONNECTION = "Pictures need a connection.";
const OFFLINE_WITH_PICTURES =
  "You’re offline. Remove the pictures to queue this note, or send it when you’re back online.";
const UNSUPPORTED = "That picture isn’t a JPEG, PNG or WebP, so it can’t be attached.";

const THUMB = "size-14 shrink-0 rounded-md border-2 border-border object-cover";

function isAccepted(file: File): boolean {
  return (FEEDBACK_PICTURE_MIMES as readonly string[]).includes(file.type);
}

function PickedThumb({
  file,
  onRemove,
  disabled,
}: {
  file: File;
  onRemove: () => void;
  disabled: boolean;
}) {
  const imgRef = React.useRef<HTMLImageElement>(null);
  // Set on the element rather than held in state: the revoke in cleanup would
  // otherwise kill the URL a StrictMode re-run of the effect still renders.
  React.useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const url = URL.createObjectURL(file);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <li className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} alt="" className={THUMB} />
      <button
        type="button"
        aria-label="Remove picture"
        disabled={disabled}
        onClick={onRemove}
        className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border-2 border-border bg-card text-foreground"
      >
        <X className="size-3" strokeWidth={3} aria-hidden />
      </button>
    </li>
  );
}

export function FeedbackPicturePicker({
  files,
  onChange,
  disabled,
  onPicking,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
  onPicking?: (picking: boolean) => void;
}) {
  const online = useOnlineStatus();
  // Compression is slow; `files` is captured when the pick starts, so nothing
  // else may change the list until it lands.
  const [picking, setPicking] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handlePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const next = [...files];
    let overflowed = false;
    setPicking(true);
    onPicking?.(true);
    try {
      for (const original of picked) {
        if (next.length >= MAX_FEEDBACK_PICTURES) {
          overflowed = true;
          break;
        }
        const file = await compressImage(original);
        const tooBig = oversizeUploadMessage(file);
        if (tooBig) {
          toast({ variant: "destructive", title: tooBig });
          continue;
        }
        if (!isAccepted(file)) {
          toast({ variant: "destructive", title: UNSUPPORTED });
          continue;
        }
        next.push(file);
      }
      if (overflowed) toast({ title: TOO_MANY });
      if (next.length !== files.length) onChange(next);
    } finally {
      setPicking(false);
      onPicking?.(false);
    }
  }

  const line = !online ? (files.length > 0 ? OFFLINE_WITH_PICTURES : NEEDS_CONNECTION) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          tabIndex={-1}
          onChange={(e) => void handlePicked(e)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Add pictures"
          disabled={disabled || picking || !online || files.length >= MAX_FEEDBACK_PICTURES}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus aria-hidden />
          Pictures
        </Button>
        {files.length > 0 ? (
          <ul className="flex flex-wrap gap-3">
            {files.map((file, i) => (
              <PickedThumb
                key={`${i}:${file.name}:${file.size}`}
                file={file}
                disabled={disabled || picking}
                onRemove={() => onChange(files.filter((_, at) => at !== i))}
              />
            ))}
          </ul>
        ) : null}
      </div>
      {line ? <p className="text-xs text-muted-foreground">{line}</p> : null}
    </div>
  );
}

export function FeedbackPictureStrip({
  pictures,
}: {
  pictures: Array<{ id: string; url: string }>;
}) {
  const [shown, setShown] = React.useState<number | null>(null);
  if (pictures.length === 0) return null;
  const current = shown === null ? null : pictures[shown];

  return (
    <>
      <ul className="mt-1 flex flex-wrap gap-2">
        {pictures.map((picture, i) => (
          <li key={picture.id}>
            <button
              type="button"
              aria-label={`Open picture ${i + 1} of ${pictures.length}`}
              onClick={() => setShown(i)}
              className="block rounded-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={picture.url} alt="" className={THUMB} />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={current !== null} onOpenChange={(next) => !next && setShown(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{`Picture ${(shown ?? 0) + 1} of ${pictures.length}`}</DialogTitle>
            <DialogDescription className="sr-only">
              The picture at full size.
            </DialogDescription>
          </DialogHeader>
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.url}
              alt={`Picture ${(shown ?? 0) + 1} of ${pictures.length}`}
              className="max-h-[70dvh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
