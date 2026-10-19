import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Loader2, SearchCheck } from "lucide-react";
import { requireTripAccess } from "@/lib/guards";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { currentTripTimezone } from "@/lib/tz";
import { orderPlanStops } from "@/lib/plan-order";
import { loadReviewsPage } from "@/lib/review/reviews-page-loader";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import { ReviewRunPanel } from "@/components/trip/reviews/review-run-panel";
import { ReviewPoller } from "@/components/trip/reviews/review-poller";
import { FindingList } from "@/components/trip/reviews/finding-list";
import { ReviewHistory } from "@/components/trip/reviews/review-history";

export const metadata: Metadata = { title: "Reviews" };

/**
 * Starting a Review is a Server Action on this page, and its model call runs
 * after the response in `after()` (J), which lives within the route's max
 * duration (Next 16 docs: functions/after, route-segment-config/maxDuration).
 * A page-level maxDuration covers every Server Action used on the page, the
 * Plan page's Booking import precedent. A run older than
 * REVIEW_STALE_AFTER_MS (6 minutes) counts as failed anyway (decision 3).
 */
export const maxDuration = 300;

/**
 * The Reviews tab (spec 2026-10-17 R10), beside Summary. Every Traveller on
 * the Trip may read every Review (R9: a Review reads the Trip with every
 * Surprise masked). Only the run panel depends on the viewer's permission.
 */
export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ review?: string | string[] }>;
}) {
  const { tripId } = await params;
  const { review } = await searchParams;
  const { user } = await requireTripAccess(tripId);
  const [shell, slug] = await Promise.all([readTripShell(tripId), tripSlugFor(tripId)]);
  if (!shell) notFound();

  const timeZone = currentTripTimezone(orderPlanStops(shell.stops));
  const model = await loadReviewsPage({
    tripId,
    userId: user.id,
    base: tripPath(slug),
    timeZone,
    reviewId: typeof review === "string" ? review : null,
    now: new Date(),
  });
  if (!model) notFound();
  const { shown } = model;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={shell.name} title="Reviews" trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />} />

      <ReviewRunPanel tripId={tripId} state={model.panel} fallbackTimeZone={timeZone} />

      {/*
        Always mounted, so a screen reader hears both edges: the line
        appearing when a Review starts (ReviewPoller's refresh lands it) and
        the content clearing once it's gone. An element that only ever
        mounts while running never announces its own disappearance.
      */}
      <p role="status" className="flex items-center gap-2 empty:hidden rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-semibold">
        {model.running ? (
          <>
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            {model.running.line}
          </>
        ) : null}
      </p>
      <ReviewPoller active={model.running != null} runningId={model.running?.id ?? null} latestRun={model.latestRun} />

      {shown ? (
        <section aria-labelledby="shown-review" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="shown-review" className="font-display text-xl font-extrabold tracking-[-0.02em]">{shown.heading}</h2>
              {shown.status === "DONE" ? <span className="text-sm font-semibold text-muted-foreground">{shown.openCount} open</span> : null}
            </div>
            <p className="text-[13px] text-muted-foreground">{shown.byLine}</p>
            {!shown.isLatest ? (
              <Link href={tripPath(slug, "/reviews")} className="w-fit text-[13px] font-semibold underline underline-offset-2">
                See the latest Review
              </Link>
            ) : null}
          </div>
          {shown.status === "DONE" ? (
            <>
              {shown.summary ? <p className="text-sm leading-relaxed text-foreground">{shown.summary}</p> : null}
              <FindingList open={shown.open} dealtWith={shown.dealtWith} actionable={shown.actionable} />
            </>
          ) : shown.status === "FAILED" ? (
            <p className="text-sm text-muted-foreground">{shown.failure}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Still running.</p>
          )}
        </section>
      ) : model.running ? null : (
        <EmptyState
          icon={SearchCheck}
          tone="lilac"
          title="No Reviews yet"
          description={
            model.panel.kind === "hidden"
              ? "When someone on this trip runs a Review, what Claude finds shows here."
              : "Run a Review and Claude checks the plan for closures, holidays, tickets and more."
          }
        />
      )}

      {model.history.length > 0 ? <ReviewHistory rows={model.history} /> : null}
    </div>
  );
}
