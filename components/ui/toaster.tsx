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
      // swipe is a touch gesture, touch means below md, and the viewport is
      // still right-anchored there (it only moves to bottom-left from md up,
      // past the point where anyone is swiping). Don't "fix" this to match
      // the desktop corner — it would point the swipe the wrong way on the
      // only viewport where swiping actually happens.
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
