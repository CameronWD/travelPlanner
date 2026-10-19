"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/use-toast";
import type { ReviewStatus } from "@/lib/review/types";
import { takeWatchedReview, watchReview } from "./watched-reviews";

export const REVIEW_POLL_MS = 10_000;

/** The toast's title when a watched run ends FAILED; its error says why. */
export const REVIEW_FAILED_TITLE = "This Review didn't finish.";

/** Spec 2026-10-18 A7: the toast's title when a watched run ends DONE. */
export const REVIEW_DONE_TITLE = "Review finished";

/** The DONE toast's description: how many Findings are left to deal with. */
function toDealWith(openCount: number): string {
  if (openCount === 0) return "Nothing to deal with";
  return openCount === 1 ? "1 to deal with" : `${openCount} to deal with`;
}

interface ReviewPollerProps {
  active: boolean;
  /** The Review running on the Trip now, if any. */
  runningId?: string | null;
  /** The Trip's newest Review (lib/review/reviews-page-loader.ts latestRun). */
  latestRun?: { id: string; status: ReviewStatus; error: string | null; openCount?: number } | null;
}

/**
 * Spec R11 (decision 7): while a Review runs, the tab refreshes itself every
 * 10 s so "Reviewing…" turns into the Findings without a reload. The page
 * renders this with `active` only while it shows a running Review, so the
 * refresh that lands the result also stops the poll. A hidden tab skips
 * its ticks. Announces nothing itself (`active` is never steered by focus);
 * the page's own `role="status"` line carries the polite announcement.
 *
 * Final wave I2: a run this tab saw running (or started, ReviewRunPanel)
 * that ends FAILED shows a toast with its stored reason, once.
 *
 * Spec 2026-10-18 A7: a run this tab watched that ends DONE shows "Review
 * finished" with how many Findings are left to deal with, once.
 */
export function ReviewPoller({ active, runningId = null, latestRun = null }: ReviewPollerProps) {
  const router = useRouter();
  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      router.refresh();
    }, REVIEW_POLL_MS);
    return () => window.clearInterval(id);
  }, [active, router]);

  React.useEffect(() => {
    if (runningId) watchReview(runningId);
  }, [runningId]);

  React.useEffect(() => {
    if (!latestRun || latestRun.status === "RUNNING" || latestRun.id === runningId) return;
    if (!takeWatchedReview(latestRun.id)) return;
    if (latestRun.status === "FAILED") {
      toast({ variant: "destructive", title: REVIEW_FAILED_TITLE, ...(latestRun.error ? { description: latestRun.error } : {}) });
    } else if (latestRun.status === "DONE") {
      toast({ title: REVIEW_DONE_TITLE, description: toDealWith(latestRun.openCount ?? 0) });
    }
  }, [latestRun, runningId]);

  return null;
}
