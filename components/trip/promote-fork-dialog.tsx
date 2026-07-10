"use client";

import * as React from "react";
import { useTransition } from "react";
import { GitMerge, AlertTriangle } from "lucide-react";
import { getPromotionPreview, promoteFork } from "@/server/actions/forks";
import type { PromotionPreview } from "@/server/actions/forks";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { toast } from "@/components/ui/use-toast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDelta(value: number, unit: string): string {
  if (value === 0) return null as unknown as string;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} ${unit}`;
}

export function formatBudgetDelta(minor: number | null, currency: string): string | null {
  if (minor === null || minor === 0) return null;
  const sign = minor > 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(minor), currency)}`;
}

function DeltaSummary({
  deltas,
  homeCurrency,
}: {
  deltas: PromotionPreview["deltas"];
  homeCurrency?: string;
}) {
  const parts: string[] = [];

  const nights = formatDelta(deltas.nightTotal, deltas.nightTotal === 1 || deltas.nightTotal === -1 ? "night" : "nights");
  if (nights) parts.push(nights);

  const stops = formatDelta(deltas.stopCount, deltas.stopCount === 1 || deltas.stopCount === -1 ? "stop" : "stops");
  if (stops) parts.push(stops);

  const budget = formatBudgetDelta(deltas.budgetHomeMinor, homeCurrency ?? "");
  if (budget) parts.push(`budget ${budget}`);

  const flags = formatDelta(deltas.flagWarnings, deltas.flagWarnings === 1 || deltas.flagWarnings === -1 ? "warning" : "warnings");
  if (flags) parts.push(`${flags} flag`);

  const flights = formatDelta(deltas.flightCount, Math.abs(deltas.flightCount) === 1 ? "flight" : "flights");
  if (flights) parts.push(flights);

  const projEnd = deltas.projectedEndDays !== null && deltas.projectedEndDays !== 0
    ? formatDelta(deltas.projectedEndDays, Math.abs(deltas.projectedEndDays) === 1 ? "day" : "days")
    : null;
  if (projEnd) parts.push(`projected end ${projEnd}`);

  if (parts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This fork is identical to the current plan — no metric changes.
      </p>
    );
  }

  return (
    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
      {parts.map((part) => (
        <li key={part}>{part}</li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Kind labels
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<PromotionPreview["lossList"][number]["kind"], string> = {
  PAID_COST: "Paid cost",
  CONFIRMATION: "Booking confirmation",
  ATTACHMENT: "Attachment",
};

// ---------------------------------------------------------------------------
// Inner dialog body — only rendered when open=true (remount-on-open pattern)
// ---------------------------------------------------------------------------

interface InnerProps {
  forkId: string;
  forkName: string;
  /** Pre-loaded preview — skip fetching if provided. */
  preview?: PromotionPreview;
  homeCurrency?: string;
  onClose: () => void;
}

function PromoteForkDialogInner({
  forkId,
  forkName,
  preview: initialPreview,
  homeCurrency,
  onClose,
}: InnerProps) {
  // Fetch preview if not provided. We fetch in a fire-once effect guarded by
  // a ref so that we never call setState synchronously in the effect body
  // (react-hooks/set-state-in-effect compliance).
  const [preview, setPreview] = React.useState<PromotionPreview | null>(
    initialPreview ?? null,
  );
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const fetched = React.useRef(false);

  React.useEffect(() => {
    if (initialPreview || fetched.current) return;
    fetched.current = true;
    // Async IIFE — state updates happen asynchronously, never synchronously
    // inside the effect body, so set-state-in-effect is satisfied.
    void (async () => {
      try {
        const result = await getPromotionPreview(forkId);
        setPreview(result);
      } catch {
        setFetchError("Could not load preview. Please try again.");
      }
    })();
  }, [forkId, initialPreview]);

  const [confirmValue, setConfirmValue] = React.useState("");
  const [isPending, startTransition] = useTransition();

  const lossList = preview?.lossList ?? [];
  const hasLosses = lossList.length > 0;

  // When there are losses, require user to type the fork name exactly.
  const confirmed = hasLosses ? confirmValue.trim() === forkName.trim() : true;

  function handlePromote() {
    if (!confirmed || !preview) return;

    startTransition(async () => {
      const result = await promoteFork(forkId);
      if (result.success) {
        onClose();
      } else {
        toast({ title: "Couldn't promote fork", description: result.error, variant: "destructive" });
        onClose();
      }
    });
  }

  // Loading state
  if (!preview && !fetchError) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Promote &ldquo;{forkName}&rdquo;?</DialogTitle>
          <DialogDescription>Loading preview…</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Promote &ldquo;{forkName}&rdquo;?</DialogTitle>
          <DialogDescription className="text-destructive">{fetchError}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Promote &ldquo;{forkName}&rdquo;?</DialogTitle>
        <DialogDescription>
          This will replace your current plan with this fork. All other forks
          will be deleted. This cannot be undone.
        </DialogDescription>
      </DialogHeader>

      {/* Delta summary */}
      <div>
        <p className="mb-2 text-sm font-medium">Changes vs current plan:</p>
        <DeltaSummary deltas={preview!.deltas} homeCurrency={homeCurrency} />
      </div>

      {/* Loss list — only when non-empty */}
      {hasLosses && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            Promoting will discard these committed things from your current plan:
          </div>
          <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            {lossList.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 min-w-0 text-sm">
                <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
                  {KIND_LABELS[item.kind]}
                </span>
                <span className="min-w-0 truncate text-foreground">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Type-to-confirm — only when losses */}
      {hasLosses && (
        <Field
          label={
            <>
              Type <strong>{forkName}</strong> to confirm you accept these losses
            </>
          }
          error={confirmValue && !confirmed ? "Name doesn't match" : undefined}
        >
          <Input
            placeholder={forkName}
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            aria-label={`Type ${forkName} to confirm`}
          />
        </Field>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" disabled={isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button
          variant={hasLosses ? "destructive" : "primary"}
          onClick={handlePromote}
          disabled={!confirmed || !preview || isPending}
          loading={isPending}
        >
          <GitMerge className="size-4" aria-hidden="true" />
          {hasLosses ? "Promote anyway" : "Promote to real plan"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface PromoteForkDialogProps {
  /** The fork to promote. */
  forkId: string;
  forkName: string;
  /** Controlled open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Pre-loaded preview. If not provided, the dialog fetches it on open.
   * Useful when the parent already has the preview (e.g. a compare column).
   */
  preview?: PromotionPreview;
  /** Trip's home currency code (e.g. "USD"), used for budget delta display. */
  homeCurrency?: string;
}

export function PromoteForkDialog({
  forkId,
  forkName,
  open,
  onOpenChange,
  preview,
  homeCurrency,
}: PromoteForkDialogProps) {
  function handleClose() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Remount-on-open pattern: mount the inner content only when the
            dialog is open. This resets all state (confirmValue, preview, etc.)
            on every open without needing setState in an effect. */}
        {open && (
          <PromoteForkDialogInner
            forkId={forkId}
            forkName={forkName}
            preview={preview}
            homeCurrency={homeCurrency}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
