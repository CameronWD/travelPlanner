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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { setStopNights, deleteStop } from "@/server/actions/stops";
import { formatLongDate } from "@/lib/dates";
import { computeProjectedEnd } from "@/lib/firm-up";
import {
  nightsOver,
  buildTrimPlan,
  buildDropCandidates,
  simulateAfterTrims,
  currentNights,
  isFlexible,
  type FitStop,
} from "@/lib/make-it-fit";

interface MakeItFitProps {
  tripId: string;
  stops: FitStop[];
  anchor: string | null;
  hardEndDate: string | null;
}

export function MakeItFit({
  tripId,
  stops,
  anchor,
  hardEndDate,
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
  projectedEnd,
  over,
  onClose,
}: MakeItFitProps & {
  projectedEnd: string | null;
  over: number;
  onClose: () => void;
}) {
  const flex = React.useMemo(
    () =>
      stops.filter(isFlexible).sort((a, b) => a.sortOrder - b.sortOrder),
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

  async function drop(id: string) {
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
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

        <div className="grid gap-6 sm:grid-cols-2">
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
                    onClick={() => drop(c.id)}
                  >
                    Drop {c.name}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
