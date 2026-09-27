"use client";

import type { ReactElement } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CoverImageField } from "@/components/trip/settings/cover-image-field";

export interface CoverUploaderDialogProps {
  tripId: string;
  hasCover: boolean;
  coverVersion?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  /** The button that opens it (rendered as the Radix trigger, asChild). */
  trigger: ReactElement;
}

/**
 * The Trip settings cover uploader (`CoverImageField` — upload, remove, focal
 * point) in a dialog, so the desktop Home's countdown tile can open it in
 * place ("Change" on the polaroid, "+ Add a photo" without one).
 */
export function CoverUploaderDialog({ tripId, hasCover, coverVersion, focalX, focalY, trigger }: CoverUploaderDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasCover ? "Change the cover" : "Add a cover"}</DialogTitle>
        </DialogHeader>
        <CoverImageField
          tripId={tripId}
          hasCover={hasCover}
          coverVersion={coverVersion}
          focalX={focalX}
          focalY={focalY}
        />
      </DialogContent>
    </Dialog>
  );
}
