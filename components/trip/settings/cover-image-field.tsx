"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTripCover, removeTripCover, setCoverFocal } from "@/server/actions/cover";
import { compressImage, oversizeUploadMessage } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

export interface CoverImageFieldProps {
  tripId: string;
  hasCover: boolean;
  /** Trip.coverImageKey — busts the preview's cache when the photo changes. */
  coverVersion?: string | null;
  /** Trip.coverFocalX / coverFocalY — 0–1; null = centre. */
  focalX?: number | null;
  focalY?: number | null;
}

export function CoverImageField({ tripId, hasCover, coverVersion, focalX, focalY }: CoverImageFieldProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Optimistic marker: moves on click, before the refresh brings the saved point back.
  const [focal, setFocal] = React.useState({ x: focalX ?? 0.5, y: focalY ?? 0.5 });

  // Spec E2: the cover is cropped to fill (object-cover) on the Home tile and
  // the trips list; the focal point says where that crop centres. The
  // preview shows the photo whole at its own aspect, so a click's position in
  // the preview IS its position in the photo.
  function onPickFocal(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const x = clamp((e.clientX - rect.left) / rect.width);
    const y = clamp((e.clientY - rect.top) / rect.height);
    setFocal({ x, y });
    startTransition(async () => {
      const r = await setCoverFocal(tripId, x, y);
      if (!r.success) toast({ variant: "destructive", title: r.error });
      else router.refresh();
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    startTransition(async () => {
      const compressed = await compressImage(file);
      const oversize = oversizeUploadMessage(compressed);
      if (oversize) {
        toast({ variant: "destructive", title: oversize });
        return;
      }
      const fd = new FormData();
      fd.set("tripId", tripId);
      fd.set("file", compressed);
      try {
        const r = await setTripCover(fd);
        if (!r.success) toast({ variant: "destructive", title: r.error });
        else router.refresh();
      } catch {
        // The action reports its own failures; reaching here means the request
        // itself died (network, platform limit) — don't invent a size excuse.
        toast({ variant: "destructive", title: "Upload failed. Please try again." });
      }
    });
  }

  function onRemove() {
    startTransition(async () => {
      const r = await removeTripCover(tripId);
      if (!r.success) toast({ variant: "destructive", title: r.error });
      else router.refresh();
    });
  }

  return (
    <Field
      label="Cover photo"
      description="Shown on your trips list and the trip's home. Leave empty to use the auto route render."
    >
      <div className="flex items-center gap-3">
        <Input type="file" accept="image/*" onChange={onFile} disabled={isPending} />
        {hasCover && (
          <Button type="button" variant="ghost" onClick={onRemove} disabled={isPending}>
            Remove
          </Button>
        )}
      </div>
      {hasCover && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
            Tap the part of the photo to keep in view when it&apos;s cropped.
          </p>
          <button
            type="button"
            aria-label="Choose the cover photo's focal point"
            onClick={onPickFocal}
            disabled={isPending}
            className="relative block w-full max-w-xs cursor-crosshair overflow-hidden rounded-md border-2 border-border disabled:cursor-wait"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable */}
            <img
              src={`/api/trips/${tripId}/cover${coverVersion ? `?v=${encodeURIComponent(coverVersion)}` : ""}`}
              alt=""
              className="block h-auto w-full"
            />
            <span
              data-testid="cover-focal-marker"
              aria-hidden="true"
              className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-coral shadow-hard-1"
              style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
            />
          </button>
        </div>
      )}
    </Field>
  );
}
