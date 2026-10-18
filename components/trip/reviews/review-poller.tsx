"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export const REVIEW_POLL_MS = 10_000;

/**
 * Spec R11 (decision 7): while a Review runs, the tab refreshes itself every
 * 10 s so "Reviewing…" turns into the Findings without a reload. The page
 * renders this with `active` only while it shows a running Review, so the
 * refresh that lands the result also stops the poll. A hidden tab skips
 * its ticks. Announces nothing itself (`active` is never steered by focus);
 * the page's own `role="status"` line carries the polite announcement.
 */
export function ReviewPoller({ active }: { active: boolean }) {
  const router = useRouter();
  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      router.refresh();
    }, REVIEW_POLL_MS);
    return () => window.clearInterval(id);
  }, [active, router]);
  return null;
}
