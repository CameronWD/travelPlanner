"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setProfilePhotoFocal } from "@/server/actions/profile";
import { toast } from "@/components/ui/use-toast";

export interface ProfilePhotoFocalProps {
  /** The served photo — travellerImageUrl(user). */
  src: string;
  focalX: number | null;
  focalY: number | null;
  /** Called with the chosen point as it is committed, so the caller's own
   * preview (the Account card's avatar) can follow optimistically. */
  onPick?: (x: number, y: number) => void;
}

/**
 * Focus-point picker for the Profile photo (CONTEXT.md "focus point";
 * Feedback cmumd56py000004kygdjtwl7s). The whole picture is shown at its own
 * aspect so a click or drag position in the preview IS its position in the
 * photo — the same model as CoverImageField.onPickFocal.
 *
 * The circle overlay is the real avatar window, not a ring around the
 * marker: avatars draw the photo with `object-fit: cover` and
 * `object-position: x% y%` (travellerImagePosition), which lines image point
 * x% up with box point x% — it keeps the chosen point in view, it does not
 * centre it. So on a landscape photo the window is a square of the photo's
 * height slid across by x of the spare width; on a portrait one, a square of
 * its width slid down by y of the spare height (focalWindow).
 */
/**
 * The square an avatar circle shows of a photo of aspect `ratio`
 * (width / height) with focus point (x, y), as percentages of the photo's
 * displayed box — so it scales with the preview without re-measuring.
 */
export function focalWindow(ratio: number, x: number, y: number) {
  if (ratio >= 1) {
    const side = 1 / ratio; // the photo's height, as a fraction of its width
    return { left: x * (1 - side) * 100, top: 0, width: side * 100, height: 100 };
  }
  const side = ratio; // the photo's width, as a fraction of its height
  return { left: 0, top: y * (1 - side) * 100, width: 100, height: side * 100 };
}

export function ProfilePhotoFocal({ src, focalX, focalY, onPick }: ProfilePhotoFocalProps) {
  const router = useRouter();
  const [focal, setFocal] = React.useState({ x: focalX ?? 0.5, y: focalY ?? 0.5 });
  const [pending, startTransition] = React.useTransition();
  const dragging = React.useRef(false);
  const imgRef = React.useRef<HTMLImageElement>(null);
  // The photo's aspect (width / height), known once it has loaded.
  const [ratio, setRatio] = React.useState<number | null>(null);

  const measure = React.useCallback(() => {
    const img = imgRef.current;
    if (img && img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
  }, []);
  // A cached picture can finish loading before hydration attaches onLoad.
  React.useEffect(() => { if (imgRef.current?.complete) measure(); }, [measure]);

  const win = ratio ? focalWindow(ratio, focal.x, focal.y) : null;

  function pointToFocal(e: React.PointerEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    return { x: clamp((e.clientX - rect.left) / rect.width), y: clamp((e.clientY - rect.top) / rect.height) };
  }

  function commit(p: { x: number; y: number }) {
    setFocal(p);
    onPick?.(p.x, p.y);
    startTransition(async () => {
      const r = await setProfilePhotoFocal(p.x, p.y);
      if (!r.success) toast({ variant: "destructive", title: "Couldn't save that — please try again." });
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-muted-foreground">
        Drag or tap the part of your photo to keep in view. The circle shows what people will see.
      </p>
      <button
        type="button"
        aria-label="Choose the part of your photo to keep in view"
        disabled={pending}
        onPointerDown={(e) => {
          // Capture so a drag past the picker's edge keeps reporting (the
          // clamp pins it to the edge) and its release still commits.
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          const p = pointToFocal(e);
          if (p) setFocal(p);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const p = pointToFocal(e);
          if (p) setFocal(p);
        }}
        onPointerUp={(e) => {
          // A release from a press that started elsewhere must not commit.
          if (!dragging.current) return;
          dragging.current = false;
          const p = pointToFocal(e);
          if (p) commit(p);
        }}
        className="relative block w-full max-w-xs cursor-crosshair touch-none overflow-hidden rounded-md border-2 border-border disabled:cursor-wait"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob */}
        <img ref={imgRef} src={src} alt="" draggable={false} onLoad={measure} className="block h-auto w-full select-none" />
        {win ? (
          <span
            data-testid="profile-focal-window"
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full border-[3px] border-white [box-shadow:0_0_0_9999px_hsl(var(--foreground)/0.35)]"
            style={{ left: `${win.left}%`, top: `${win.top}%`, width: `${win.width}%`, height: `${win.height}%` }}
          />
        ) : null}
        <span
          data-testid="profile-focal-marker"
          aria-hidden="true"
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-foreground shadow-hard-1"
          style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
        />
      </button>
    </div>
  );
}
