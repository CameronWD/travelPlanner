"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StopCard, type StopCardStop } from "./stop-card";
import { StopFormDialog } from "./stop-form-dialog";
import { TransportCard, type TransportCardTransport } from "./transport-card";
import { TransportFormDialog, type StopOption } from "./transport-form-dialog";
import { AccommodationCard, type AccommodationCardAccommodation } from "./accommodation-card";
import { AccommodationFormDialog } from "./accommodation-form-dialog";
import { deleteStop, moveStop } from "@/server/actions/stops";
import { suggestNextStopDates } from "@/lib/dates";
import { deleteTransport } from "@/server/actions/transport";
import { deleteAccommodation } from "@/server/actions/accommodation";
import type { TransportMode } from "@/lib/enums";
import type { CostRow } from "@/server/actions/costs";
import type { NoteView } from "./note-thread";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccommodationCardAccommodationWithCosts
  extends AccommodationCardAccommodation {
  costs?: CostRow[];
}

export interface ItineraryStop extends StopCardStop {
  accommodations: AccommodationCardAccommodationWithCosts[];
}

export interface ItineraryTransport {
  id: string;
  mode: TransportMode;
  fromStopId?: string | null;
  toStopId?: string | null;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | null;
  arrAt?: Date | null;
  reference?: string | null;
  notes?: string | null;
  sortOrder: number;
  /** Costs attached to this transport */
  costs?: CostRow[];
}

interface ItineraryManagerProps {
  tripId: string;
  initialStops: ItineraryStop[];
  initialTransports: ItineraryTransport[];
  /** Trip's home currency — passed to cost display */
  homeCurrency?: string;
  /** Trip date window — used to default + constrain stop date pickers */
  tripStartDate?: string;
  tripEndDate?: string;
  /** Map of stopId → notes for that stop */
  notesByStopId?: Map<string, NoteView[]>;
  /** Current authenticated user's ID */
  currentUserId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Enrich a transport with stop names and timezones for display.
 */
function enrichTransport(
  t: ItineraryTransport,
  stops: ItineraryStop[],
): TransportCardTransport {
  const fromStop = stops.find((s) => s.id === t.fromStopId);
  const toStop = stops.find((s) => s.id === t.toStopId);
  return {
    ...t,
    fromStopName: fromStop?.name ?? null,
    toStopName: toStop?.name ?? null,
    fromStopTimezone: fromStop?.timezone ?? null,
    toStopTimezone: toStop?.timezone ?? null,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ItineraryManager({
  tripId,
  initialStops,
  initialTransports,
  homeCurrency,
  tripStartDate,
  tripEndDate,
  notesByStopId,
  currentUserId,
}: ItineraryManagerProps) {
  // ── Stop dialog state ──
  const [editingStop, setEditingStop] = React.useState<StopCardStop | null>(null);
  const [addStopOpen, setAddStopOpen] = React.useState(false);

  // ── Transport dialog state ──
  const [editingTransport, setEditingTransport] =
    React.useState<TransportCardTransport | null>(null);
  const [addTransportDefaults, setAddTransportDefaults] = React.useState<{
    fromStopId?: string;
    toStopId?: string;
  } | null>(null);

  // ── Accommodation dialog state ──
  const [editingAccommodation, setEditingAccommodation] =
    React.useState<AccommodationCardAccommodation | null>(null);
  const [editingAccStop, setEditingAccStop] =
    React.useState<ItineraryStop | null>(null);
  const [addAccommodationStop, setAddAccommodationStop] =
    React.useState<ItineraryStop | null>(null);

  // ── Pending mutations ──
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // ── Stop handlers ──
  async function handleDeleteStop(stopId: string) {
    if (!confirm("Delete this stop? This cannot be undone.")) return;
    setPendingId(stopId);
    try {
      await deleteStop(stopId);
    } finally {
      setPendingId(null);
    }
  }

  async function handleMoveStop(stopId: string, direction: "up" | "down") {
    setPendingId(stopId);
    try {
      await moveStop(stopId, direction);
    } finally {
      setPendingId(null);
    }
  }

  // ── Transport handlers ──
  async function handleDeleteTransport(transportId: string) {
    if (!confirm("Delete this transport leg? This cannot be undone.")) return;
    setPendingId(transportId);
    try {
      await deleteTransport(transportId);
    } finally {
      setPendingId(null);
    }
  }

  // ── Accommodation handlers ──
  async function handleDeleteAccommodation(accId: string) {
    if (!confirm("Delete this accommodation? This cannot be undone.")) return;
    setPendingId(accId);
    try {
      await deleteAccommodation(accId);
    } finally {
      setPendingId(null);
    }
  }

  // ── Derived data ──
  const stops = initialStops;
  const stopOptions: StopOption[] = stops.map((s) => ({ id: s.id, name: s.name }));

  /**
   * Transports that link consecutive stops[i] → stops[i+1].
   * Returns a map of `${fromId}-${toId}` → transport[].
   */
  const transportByPair = React.useMemo(() => {
    const map = new Map<string, ItineraryTransport[]>();
    for (const t of initialTransports) {
      if (t.fromStopId && t.toStopId) {
        const key = `${t.fromStopId}-${t.toStopId}`;
        const arr = map.get(key) ?? [];
        arr.push(t);
        map.set(key, arr);
      }
    }
    return map;
  }, [initialTransports]);

  /** Transports that DON'T link a consecutive pair (orphaned or partial) */
  const otherTransports = React.useMemo(() => {
    const consecutivePairKeys = new Set<string>();
    for (let i = 0; i < stops.length - 1; i++) {
      consecutivePairKeys.add(`${stops[i].id}-${stops[i + 1].id}`);
    }

    return initialTransports.filter((t) => {
      if (!t.fromStopId || !t.toStopId) return true; // no both stops → other
      const key = `${t.fromStopId}-${t.toStopId}`;
      return !consecutivePairKeys.has(key);
    });
  }, [initialTransports, stops]);

  const hasStops = stops.length > 0;

  // Default a new stop to pick up where the last one departs (or trip start),
  // so the date picker opens in the trip's window rather than today.
  const suggestedStopDates = suggestNextStopDates(
    stops,
    tripStartDate,
    tripEndDate,
  );

  return (
    <div className="flex flex-col gap-4">
      {hasStops ? (
        <>
          {/* Stops + interspersed transports + accommodations */}
          <div className="flex flex-col gap-3">
            {stops.map((stop, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === stops.length - 1;

              // Transports departing FROM this stop TO the next stop
              const nextStop = isLast ? null : stops[idx + 1];
              const legTransports = nextStop
                ? (transportByPair.get(`${stop.id}-${nextStop.id}`) ?? [])
                : [];

              const stopDateRange = {
                arriveDate: stop.arriveDate,
                departDate: stop.departDate,
              };

              return (
                <React.Fragment key={stop.id}>
                  {/* Stop card */}
                  <StopCard
                    stop={stop}
                    isFirst={isFirst}
                    isLast={isLast}
                    isPending={pendingId === stop.id}
                    onEdit={(s) => setEditingStop(s)}
                    onMoveUp={(id) => handleMoveStop(id, "up")}
                    onMoveDown={(id) => handleMoveStop(id, "down")}
                    onDelete={handleDeleteStop}
                    notes={notesByStopId?.get(stop.id) ?? []}
                    tripId={tripId}
                    currentUserId={currentUserId}
                  />

                  {/* Accommodations under this stop */}
                  {stop.accommodations.length > 0 && (
                    <div className="ml-4 flex flex-col gap-2 border-l-2 border-border/40 pl-4">
                      {stop.accommodations.map((acc) => (
                        <AccommodationCard
                          key={acc.id}
                          accommodation={acc}
                          stop={stopDateRange}
                          isPending={pendingId === acc.id}
                          onEdit={(a) => {
                            setEditingAccommodation(a);
                            setEditingAccStop(stop);
                          }}
                          onDelete={handleDeleteAccommodation}
                          costs={acc.costs}
                          tripId={tripId}
                          homeCurrency={homeCurrency}
                        />
                      ))}
                    </div>
                  )}

                  {/* Add accommodation for this stop */}
                  <div className="ml-4 pl-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setAddAccommodationStop(stop)}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Add accommodation
                    </Button>
                  </div>

                  {/* Transport legs to next stop */}
                  {!isLast && (
                    <div className="flex flex-col gap-2 px-2">
                      {legTransports.map((t) => (
                        <TransportCard
                          key={t.id}
                          transport={enrichTransport(t, stops)}
                          isPending={pendingId === t.id}
                          onEdit={(tr) => setEditingTransport(tr)}
                          onDelete={handleDeleteTransport}
                          costs={t.costs}
                          tripId={tripId}
                          homeCurrency={homeCurrency}
                        />
                      ))}

                      {/* Add transport between this pair */}
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setAddTransportDefaults({
                              fromStopId: stop.id,
                              toStopId: nextStop!.id,
                            })
                          }
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                          Add transport to {nextStop!.name}
                        </Button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Other transports (not linked to consecutive stops) */}
          {otherTransports.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Other transport
              </h3>
              {otherTransports.map((t) => (
                <TransportCard
                  key={t.id}
                  transport={enrichTransport(t, stops)}
                  isPending={pendingId === t.id}
                  onEdit={(tr) => setEditingTransport(tr)}
                  onDelete={handleDeleteTransport}
                  costs={t.costs}
                  tripId={tripId}
                  homeCurrency={homeCurrency}
                />
              ))}
            </div>
          )}

          {/* Add a standalone transport */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setAddTransportDefaults({})}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add transport (other)
            </Button>

            <Button
              variant="outline"
              size="md"
              onClick={() => setAddStopOpen(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add stop
            </Button>
          </div>
        </>
      ) : (
        <div className="flex justify-center">
          <Button
            variant="primary"
            size="md"
            onClick={() => setAddStopOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add stop
          </Button>
        </div>
      )}

      {/* ─── Dialogs ─── */}

      {/* Add stop */}
      <StopFormDialog
        tripId={tripId}
        open={addStopOpen}
        onOpenChange={setAddStopOpen}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        defaultArriveDate={suggestedStopDates.arriveDate}
        defaultDepartDate={suggestedStopDates.departDate}
      />

      {/* Edit stop */}
      {editingStop && (
        <StopFormDialog
          tripId={tripId}
          stop={editingStop}
          open={Boolean(editingStop)}
          onOpenChange={(open) => {
            if (!open) setEditingStop(null);
          }}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
        />
      )}

      {/* Add transport */}
      {addTransportDefaults !== null && (
        <TransportFormDialog
          tripId={tripId}
          stops={stopOptions}
          defaultFromStopId={addTransportDefaults.fromStopId}
          defaultToStopId={addTransportDefaults.toStopId}
          open={true}
          onOpenChange={(open) => {
            if (!open) setAddTransportDefaults(null);
          }}
        />
      )}

      {/* Edit transport */}
      {editingTransport && (
        <TransportFormDialog
          tripId={tripId}
          stops={stopOptions}
          transport={editingTransport}
          open={Boolean(editingTransport)}
          onOpenChange={(open) => {
            if (!open) setEditingTransport(null);
          }}
        />
      )}

      {/* Add accommodation */}
      {addAccommodationStop && (
        <AccommodationFormDialog
          stopId={addAccommodationStop.id}
          stopDateRange={{
            arriveDate: addAccommodationStop.arriveDate,
            departDate: addAccommodationStop.departDate,
          }}
          open={true}
          onOpenChange={(open) => {
            if (!open) setAddAccommodationStop(null);
          }}
        />
      )}

      {/* Edit accommodation */}
      {editingAccommodation && editingAccStop && (
        <AccommodationFormDialog
          stopId={editingAccStop.id}
          stopDateRange={{
            arriveDate: editingAccStop.arriveDate,
            departDate: editingAccStop.departDate,
          }}
          accommodation={editingAccommodation}
          open={Boolean(editingAccommodation)}
          onOpenChange={(open) => {
            if (!open) {
              setEditingAccommodation(null);
              setEditingAccStop(null);
            }
          }}
        />
      )}
    </div>
  );
}
