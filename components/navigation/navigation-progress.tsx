"use client";

import * as React from "react";
import { useNavigationPending } from "@/components/navigation/navigation-pending";

const NAVIGATION_PROGRESS_DELAY_MS = 300;

/**
 * A 2px bar across the top of the viewport that appears only once a
 * navigation has been pending longer than `delayMs` (ADR 0063): a fast
 * network never sees it; a slow one gets a signal without a skeleton.
 * Mounted once by app/(app)/layout.tsx. The sr-only status line gives screen
 * readers the same "still loading" cue.
 */
export function NavigationProgress({ delayMs = NAVIGATION_PROGRESS_DELAY_MS }: { delayMs?: number }) {
  const pending = useNavigationPending();
  const [shownFor, setShownFor] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!pending) return;
    const startedAt = pending.startedAt;
    const t = setTimeout(() => setShownFor(startedAt), delayMs);
    return () => clearTimeout(t);
  }, [pending, delayMs]);

  const visible = pending != null && shownFor === pending.startedAt;
  return (
    <>
      <div
        data-nav-progress={visible ? "visible" : "hidden"}
        aria-hidden="true"
        hidden={!visible}
        className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-[60] h-0.5 overflow-hidden print:hidden"
      >
        <span className="tp-nav-progress block h-full w-1/3 rounded-full bg-coral" />
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {visible ? "Loading the next page" : ""}
      </span>
    </>
  );
}
