"use client";

import * as React from "react";
import { BedDouble } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapLink } from "@/components/trip/map-link";
import { AttachmentLinks } from "@/components/trip/attachment-links";
import { CardActionCluster } from "@/components/trip/card-action-cluster";
import { CostEditor } from "@/components/trip/cost-editor";
import { formatDayLabel } from "@/lib/dates";
import { costPaidState, stayCostLabel, stayNightsLabel, stayNightsOfStop } from "@/lib/plan/plan-model";
import type { AccommodationCardAccommodation } from "@/components/trip/accommodation-card";
import type { AttachmentView } from "@/components/trip/attachment-list";
import type { NoteView } from "@/components/trip/note-thread";
import type { CostRow } from "@/server/actions/costs";

/** One Accommodation as the stay detail view shows it: the card's fields plus its Costs, files and note thread. */
export interface StayDetailAccommodation extends AccommodationCardAccommodation {
  costs?: CostRow[];
  attachments?: AttachmentView[];
  /** The collaborative note thread (not the Accommodation's own `notes` text). */
  noteThread?: NoteView[];
}

export interface StayDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  stopName: string;
  stop: { arriveDate: string | null; departDate: string | null };
  stays: StayDetailAccommodation[];
  /** The stay to show first. Null or unknown (deleted meanwhile) → the first stay; no stays → "No bed yet". */
  selectedId: string | null;
  homeCurrency?: string;
  tripId?: string;
  currentUserId?: string;
  forkId?: string | null;
  pendingId?: string | null;
  /** Opens the existing AccommodationFormDialog on this stay. */
  onEdit(a: StayDetailAccommodation): void;
  onDelete?(id: string): void;
  onAdd?: () => void;
}

const CHIP =
  "tap-target inline-flex h-[30px] shrink-0 items-center whitespace-nowrap rounded-full border-2 border-border px-3 text-xs font-bold focus-visible:outline-[3px] focus-visible:outline-ring";

/** "Tue 15 Dec · 15:00", or just the day when no time is set. */
function when(date: string, time?: string | null): string {
  return time ? `${formatDayLabel(date)} · ${time}` : formatDayLabel(date);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm font-bold text-foreground">{children}</dd>
    </div>
  );
}

function StayDetail({
  a,
  stop,
  homeCurrency,
  tripId,
  currentUserId,
  forkId,
  pending,
  onDelete,
}: {
  a: StayDetailAccommodation;
  stop: StayDialogProps["stop"];
  homeCurrency?: string;
  tripId?: string;
  currentUserId?: string;
  forkId?: string | null;
  pending: boolean;
  onDelete?(id: string): void;
}) {
  const headingId = React.useId();
  const coverage = stayNightsOfStop(stop, a);
  const cost = stayCostLabel(a.costs, homeCurrency);
  const paid = costPaidState(a.costs);
  const files = a.attachments ?? [];

  return (
    <section
      data-testid="stay-detail"
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-4", pending && "pointer-events-none opacity-60")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="flex items-center gap-2 font-display text-xl font-extrabold leading-tight">
            <BedDouble className="size-5 shrink-0" aria-hidden="true" />
            <span className="truncate">{a.name}</span>
          </h3>
          {/* Address-gated like the stay panel (FB-09 tracks coordinates-only stays). */}
          {a.address && (
            <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-foreground/80">
              <span className="truncate">{a.address}</span>
              <MapLink lat={a.lat} lng={a.lng} address={a.address} label={a.name} className="text-foreground/80" />
            </p>
          )}
        </div>
        {/* Notes thread, files and Delete — what the card's cluster offered; Edit is the footer button. */}
        <CardActionCluster
          tripId={tripId}
          targetType="ACCOMMODATION"
          targetId={a.id}
          editLabel={`Edit ${a.name}`}
          deleteLabel={`Delete ${a.name}`}
          moreLabel={`More actions for ${a.name}`}
          onDelete={onDelete ? () => onDelete(a.id) : undefined}
          isPending={pending}
          notes={a.noteThread}
          currentUserId={currentUserId}
          attachments={a.attachments}
        />
      </div>

      <dl data-testid="stay-facts" className="grid gap-3 sm:grid-cols-2">
        <Fact label="Check-in">{when(a.checkIn, a.checkInTime)}</Fact>
        <Fact label="Check-out">{when(a.checkOut, a.checkOutTime)}</Fact>
        {coverage && <Fact label="Nights">{stayNightsLabel(coverage)}</Fact>}
        {a.confirmation && (
          <Fact label="Booking reference">
            <span className="font-mono">{a.confirmation}</span>
          </Fact>
        )}
        {cost && (
          <Fact label="Cost">
            <span className="flex items-center gap-1.5">
              {cost}
              {paid === "paid" ? <Badge variant="teal">Paid</Badge> : <Badge variant="muted">Unpaid</Badge>}
            </span>
          </Fact>
        )}
      </dl>

      {a.notes && (
        <div>
          <h4 className="text-[11px] font-semibold text-muted-foreground">Notes</h4>
          <p className="whitespace-pre-line text-sm">{a.notes}</p>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-muted-foreground">Attachments</h4>
          <AttachmentLinks attachments={files} />
        </div>
      )}

      {(a.costs?.length ?? 0) > 1 && tripId && (
        <div data-testid="stay-cost-editor" className="border-t border-border/60 pt-2">
          <CostEditor
            tripId={tripId}
            ownerType="ACCOMMODATION"
            ownerId={a.id}
            costs={a.costs!}
            homeCurrency={homeCurrency}
            defaultCurrency={homeCurrency}
            forkId={forkId}
          />
        </div>
      )}
    </section>
  );
}

/**
 * The stay detail view (spec 2026-10-05 §D; was the hosted accommodation
 * rows of 2026-10-04 §B). Large dialog; one stay at a time, chosen by a chip
 * row when the Stop has several; Edit opens the existing AccommodationFormDialog.
 */
export function StayDialog({
  open,
  onOpenChange,
  stopName,
  stop,
  stays,
  selectedId,
  homeCurrency,
  tripId,
  currentUserId,
  forkId,
  pendingId,
  onEdit,
  onDelete,
  onAdd,
}: StayDialogProps) {
  const [picked, setPicked] = React.useState<string | null>(selectedId);
  // R8: "+ Add a stay" from inside this view creates a stay elsewhere
  // (itinerary-manager.tsx's AccommodationFormDialog), which doesn't know the
  // new id to hand back as `selectedId` — so notice it ourselves: when the
  // `stays` list grows by an id we hadn't seen before, switch to it rather
  // than leaving the view on whichever stay was picked before the add.
  const knownIdsRef = React.useRef<Set<string>>(new Set(stays.map((s) => s.id)));
  React.useEffect(() => {
    const known = knownIdsRef.current;
    const added = stays.find((s) => !known.has(s.id));
    if (added) setPicked(added.id);
    knownIdsRef.current = new Set(stays.map((s) => s.id));
  }, [stays]);
  const current = stays.find((s) => s.id === picked) ?? stays[0] ?? null;
  const several = stays.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Staying in {stopName}</DialogTitle>
        </DialogHeader>

        {several && (
          <div role="group" aria-label={`Stays in ${stopName}`} className="flex flex-wrap items-center gap-1.5">
            {stays.map((s) => {
              const on = s.id === current?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(s.id)}
                  className={cn(CHIP, on ? "bg-teal/15" : "bg-card hover:bg-muted")}
                >
                  {s.name}
                </button>
              );
            })}
            {onAdd && (
              <button type="button" onClick={onAdd} className={cn(CHIP, "border-dashed bg-card text-coral-text")}>
                + Add a stay
              </button>
            )}
          </div>
        )}

        {current ? (
          <StayDetail
            key={current.id}
            a={current}
            stop={stop}
            homeCurrency={homeCurrency}
            tripId={tripId}
            currentUserId={currentUserId}
            forkId={forkId}
            pending={pendingId === current.id}
            onDelete={onDelete}
          />
        ) : (
          <div
            data-testid="stay-empty"
            className="flex flex-col items-start gap-3 rounded-[14px] border-2 border-dashed border-border bg-coral/20 px-4 py-3"
          >
            <p className="font-display text-base font-extrabold">No bed yet</p>
            {onAdd && (
              <Button variant="primary" size="md" onClick={onAdd} autoFocus>
                + Add a stay
              </Button>
            )}
          </div>
        )}

        {current && (
          <DialogFooter>
            {!several && onAdd && (
              <Button variant="outline" size="md" onClick={onAdd}>
                + Add a stay
              </Button>
            )}
            <Button variant="primary" size="md" onClick={() => onEdit(current)}>
              Edit
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
