"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
import { startReview } from "@/server/actions/reviews";
import { deviceTimeZone } from "@/lib/tz";
import { nextReviewLabel, type RunPanelState } from "@/lib/review/run-panel";
import type { ReviewKind } from "@/lib/review/types";

export const START_FAILED = "Couldn't start the Review. Try again.";

const noopSubscribe = () => () => {};

interface ReviewRunPanelProps {
  tripId: string;
  state: RunPanelState;
  /** The Trip's zone, used for the server render; the device's own zone takes over on the client. */
  fallbackTimeZone: string;
}

/**
 * The Reviews tab's run controls (spec 2026-10-17 R12). Only an account
 * whose permission is Limited or Unlimited sees them. The server action
 * re-checks permission, limits and the per-Trip lock in one transaction
 * (J), so this panel is only the offer, never the gate.
 */
export function ReviewRunPanel({ tripId, state, fallbackTimeZone }: ReviewRunPanelProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState<ReviewKind | null>(null);
  const [isRefreshing, startTransition] = React.useTransition();
  // The viewer's zone decides the cap's day (decision 5); null on the server.
  const deviceZone = React.useSyncExternalStore(noopSubscribe, deviceTimeZone, () => null);

  if (state.kind === "hidden") return null;

  function start(kind: ReviewKind) {
    setPending(kind);
    // The whole call, router.refresh() included, runs inside the transition
    // (React 19 async transitions keep isPending true across the awaits), so
    // `pending` — and so the disabled/loading state below — only clears once
    // the refresh has actually landed, not the instant startReview resolves.
    // That closes the gap where the buttons re-enabled before the page had
    // caught up (controller fix round 1, item 3).
    startTransition(async () => {
      try {
        const result = await startReview(tripId, kind);
        if (!result.success) {
          toastRefused(result, START_FAILED);
          return;
        }
        router.refresh();
      } catch {
        toastRejected(START_FAILED);
      } finally {
        setPending(null);
      }
    });
  }

  if (state.kind === "capped") {
    return (
      <section aria-label="Run a Review" className="flex flex-col gap-2">
        <div>
          <Button variant="secondary" size="sm" disabled>
            {nextReviewLabel(new Date(state.nextAvailableAt), new Date(), deviceZone ?? fallbackTimeZone)}
          </Button>
        </div>
      </section>
    );
  }

  const disabled = state.kind !== "ready" || pending !== null || isRefreshing;
  const hint =
    state.kind === "not-configured" ? "Reviews are not set up"
    : state.kind === "busy" ? "A Review is already running on this trip."
    : "Claude checks the plan for closures, holidays, tickets and more. Deep Review takes longer and thinks harder.";

  return (
    <section aria-label="Run a Review" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={disabled} loading={pending === "STANDARD"} onClick={() => start("STANDARD")}>
          <SearchCheck aria-hidden="true" />
          Standard Review
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled} loading={pending === "DEEP"} onClick={() => start("DEEP")}>
          <Sparkles aria-hidden="true" />
          Deep Review
        </Button>
      </div>
      <p className="text-[13px] font-medium text-muted-foreground">{hint}</p>
    </section>
  );
}
