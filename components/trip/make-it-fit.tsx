"use client";

import * as React from "react";
import { Scissors, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { setStopNights, deleteStop } from "@/server/actions/stops";
import { cn } from "@/lib/cn";
import { formatLongDate } from "@/lib/dates";
import { computeProjectedEnd } from "@/lib/firm-up";
import { orderPlanStops } from "@/lib/plan-order";
import {
  nightsOver,
  buildTrimPlan,
  buildDropCandidates,
  simulateAfterTrims,
  currentNights,
  isFlexible,
  type FitStop,
} from "@/lib/make-it-fit";
import {
  useStopDeletionPreview,
  hasStopDeletionLosses,
  StopDeletionLossList,
} from "./stop-deletion-preview";

interface MakeItFitProps {
  tripId: string;
  stops: FitStop[];
  anchor: string | null;
  hardEndDate: string | null;
  /**
   * Whether the viewer may destroy a Stop (owner, or an ADMIN_EMAILS
   * operator). Gates the "Or drop a stop" half only — trimming nights is open
   * to any Traveller, so the dialog itself is not owner-only.
   *
   * Defaults to true, matching ItineraryManager and CompareTable. Both real
   * call sites pass it explicitly.
   */
  isOwner?: boolean;
}

export function MakeItFit({
  tripId,
  stops,
  anchor,
  hardEndDate,
  isOwner = true,
}: MakeItFitProps) {
  const [open, setOpen] = React.useState(false);
  const projectedEnd = React.useMemo(
    () =>
      computeProjectedEnd(
        stops.map((s) => ({
          id: s.id,
          arriveDate: s.arriveDate,
          departDate: s.departDate,
          nights: s.nights,
          pinned: s.pinned,
          sortOrder: s.sortOrder,
        })),
        anchor,
      ),
    [stops, anchor],
  );
  const over = nightsOver(projectedEnd, hardEndDate);
  if (over === 0) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        Make it fit
      </Button>
      {open && (
        <MakeItFitDialog
          tripId={tripId}
          stops={stops}
          anchor={anchor}
          hardEndDate={hardEndDate}
          isOwner={isOwner}
          projectedEnd={projectedEnd}
          over={over}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MakeItFitDialog({
  stops,
  anchor,
  hardEndDate,
  isOwner = true,
  projectedEnd,
  over,
  onClose,
}: MakeItFitProps & {
  projectedEnd: string | null;
  over: number;
  onClose: () => void;
}) {
  // ADR 0038: a scheduled stop's position IS its dates — this trim list must
  // render chronologically, not by raw sortOrder.
  const flex = React.useMemo(
    () => orderPlanStops(stops).filter(isFlexible),
    [stops],
  );
  const initialPlan = React.useMemo(
    () => buildTrimPlan(stops, anchor, hardEndDate),
    [stops, anchor, hardEndDate],
  );
  const [nightsById, setNightsById] = React.useState<Record<string, number>>(
    () => {
      const m: Record<string, number> = {};
      for (const f of flex) m[f.id] = currentNights(f);
      for (const it of initialPlan.items) m[it.id] = it.toNights;
      return m;
    },
  );
  const [pending, setPending] = React.useState(false);
  // ARCH-DAT-4: the Stop dropped here is pending its loss-preview confirm
  // (DropConfirmDialog below) — replaces the old plain useConfirm() prompt,
  // which said only "This stop will be permanently removed" with no idea
  // what else it would take with it.
  const [dropTarget, setDropTarget] = React.useState<{ id: string; name: string } | null>(null);

  const liveTrims = flex
    .filter((f) => nightsById[f.id] !== currentNights(f))
    .map((f) => ({ id: f.id, nights: nightsById[f.id] }));
  const sim = simulateAfterTrims(stops, anchor, liveTrims);
  const liveOver = nightsOver(sim.projectedEnd, hardEndDate);
  const dropCandidates = React.useMemo(
    () => buildDropCandidates(stops, anchor, hardEndDate),
    [stops, anchor, hardEndDate],
  );

  async function applyTrim() {
    setPending(true);
    try {
      let applied = 0;
      for (const f of flex) {
        const n = nightsById[f.id];
        if (n !== currentNights(f)) {
          const r = await setStopNights(f.id, n);
          if (!r.success) {
            toast({
              variant: "destructive",
              title: applied > 0
                ? "Trimmed some stops, but one couldn't be saved — refresh to see the current plan."
                : "Couldn't apply the trim.",
            });
            return;
          }
          applied++;
        }
      }
      onClose();
    } finally {
      setPending(false);
    }
  }

  // Performs the actual drop once DropConfirmDialog's own confirm step has
  // already closed (mirrors the old confirm-then-delete sequencing exactly —
  // only what happens BEFORE the delete call changed, not this part).
  async function performDrop(id: string) {
    setPending(true);
    try {
      const r = await deleteStop(id);
      if (!r.success) {
        toast({ variant: "destructive", title: "Couldn't drop that stop." });
        return;
      }
      onClose();
    } finally {
      setPending(false);
    }
  }

  const hardEndLabel = hardEndDate ? formatLongDate(hardEndDate) : "";

  return (
    <>
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Make it fit</DialogTitle>
          <DialogDescription>
            {projectedEnd ? (
              <>
                Ends {formatLongDate(projectedEnd)} ·{" "}
                <span className="font-medium text-destructive">
                  {over} night{over === 1 ? "" : "s"} past
                </span>{" "}
                your hard end date of {hardEndLabel}.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {/* I5 (final fix wave): the Drop half is owner-only, same as Delete in
            ItineraryManager and Promote in CompareTable. Task 10 gated
            deleteStop server-side and Task 19 added the loss preview here, but
            nothing gated the affordance — so a non-owner got a confirm dialog
            whose body was the raw server string "Only the trip owner can
            preview a Stop deletion." with the Drop button still enabled, then
            a toast. Trimming nights stays open to any Traveller, so only this
            section is hidden, not the whole dialog. */}
        <div className={cn("grid gap-6", isOwner && "sm:grid-cols-2")}>
          <section aria-label="Trim plan" className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Scissors className="size-4" aria-hidden="true" /> Trim nights
            </h3>
            <ul className="flex flex-col gap-2">
              {flex.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate">{f.name}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <span className="tabular-nums">{currentNights(f)}→</span>
                    <Input
                      type="number"
                      min={0}
                      max={currentNights(f)}
                      aria-label={`Nights for ${f.name}`}
                      value={nightsById[f.id]}
                      disabled={pending}
                      onChange={(e) =>
                        setNightsById((m) => ({
                          ...m,
                          [f.id]: Math.min(currentNights(f), Math.max(0, Number.parseInt(e.target.value, 10) || 0)),
                        }))
                      }
                      className="w-16"
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {sim.projectedEnd ? (
                <>
                  Ends {formatLongDate(sim.projectedEnd)}
                  {liveOver > 0 ? ` · still ${liveOver} over` : " · fits ✓"}
                </>
              ) : null}
            </p>
            {!initialPlan.fits && (
              <p className="text-xs text-muted-foreground">
                Trimming alone won&apos;t reach your hard end date — drop a stop, unpin one, or move the date.
              </p>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={pending || liveTrims.length === 0}
              onClick={applyTrim}
            >
              Apply trim
            </Button>
          </section>

          {isOwner && (
          <section aria-label="Drop a stop" className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Trash2 className="size-4" aria-hidden="true" /> Or drop a stop
            </h3>
            <ul className="flex flex-col gap-2">
              {dropCandidates.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex flex-col">
                    <span className="truncate">
                      {c.name}{" "}
                      {c.recommended && (
                        <span className="text-xs text-primary">
                          · recommended
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.resultingEnd
                        ? `ends ${formatLongDate(c.resultingEnd)}${c.fits ? " · fits ✓" : ""}`
                        : ""}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => setDropTarget({ id: c.id, name: c.name })}
                  >
                    Drop {c.name}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
    {dropTarget && (
      <DropConfirmDialog
        stopId={dropTarget.id}
        stopName={dropTarget.name}
        onCancel={() => setDropTarget(null)}
        onConfirm={() => {
          const { id } = dropTarget;
          setDropTarget(null);
          void performDrop(id);
        }}
      />
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DropConfirmDialog — ARCH-DAT-4: itemises what dropping this Stop destroys,
// using the SAME preview fetch + loss-list rendering as DeleteStopDialog
// (stop-deletion-preview.tsx). Closes as soon as Drop is clicked, exactly
// like the old useConfirm() prompt did — the actual delete (and Make it
// fit's own pending/disable state) runs afterwards via performDrop, so this
// is an addition to the confirm step, not a redesign of the surrounding flow.
// ---------------------------------------------------------------------------

interface DropConfirmDialogProps {
  stopId: string;
  stopName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function DropConfirmDialog({ stopId, stopName, onCancel, onConfirm }: DropConfirmDialogProps) {
  const { preview, error } = useStopDeletionPreview(stopId);
  const hasLosses = hasStopDeletionLosses(preview);
  const ready = !!preview || !!error;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Drop &quot;{stopName}&quot;?</DialogTitle>
          <DialogDescription>
            This stop will be permanently removed from your trip.
            {!ready && " Loading what else this would remove…"}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {hasLosses && preview && (
          <StopDeletionLossList preview={preview} heading="Dropping this stop will also destroy:" />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!ready} onClick={onConfirm}>
            Drop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
