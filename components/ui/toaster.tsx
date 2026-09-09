"use client";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";

/**
 * Mounts the Radix Toast provider/viewport and renders toasts from the
 * `useToast` store. Drop once near the app root (already wired in layout).
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider
      // Radix takes one non-responsive swipeDirection, but that's fine here:
      // the gesture is pointer-based, not touch-only (Radix wires it through
      // onPointerDown/onPointerMove — see @radix-ui/react-toast/dist/index.mjs
      // — and a mouse-drag dismiss works too; touch just widens the
      // swipe-start buffer from 2px to 10px), and touch below md is still the
      // dominant swipe case, where the viewport is right-anchored (it only
      // moves to bottom-left from md up). Don't "fix" this to match the
      // desktop corner — it would point the swipe the wrong way on the
      // viewport where swiping mostly happens.
      swipeDirection="right"
    >
      {toasts.map(({ id, title, description, action, duration, variant }) => (
        <Toast
          key={id}
          variant={variant}
          duration={duration}
          onOpenChange={(open) => {
            if (!open) dismiss(id);
          }}
        >
          <div className="flex flex-col gap-1">
            {title ? <ToastTitle>{title}</ToastTitle> : null}
            {description ? (
              <ToastDescription>{description}</ToastDescription>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {action}
            <ToastClose />
          </div>
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
