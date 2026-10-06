"use client";

import { useEffect, useMemo, useState } from "react";
import { GlobeMapLoader } from "./globe-map-loader";
import { MarkerList } from "./marker-list";
import { MarkerFilters } from "./marker-filters";
import { MarkerForm } from "./marker-form";
import { GlobeInviteButton } from "./globe-invite-button";
import { filterMarkers, distinctCountries, type MarkerFilter } from "@/lib/globe-list";
import { Globe, Plus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { deleteMarker } from "@/server/actions/globe";
import { ARRIVAL_FLY_S, PIN_STAGGER_MS, arrivalToastTitle } from "./arrival";
import type { MarkerView, GlobeMemberView, GlobeArrival } from "./types";
import type { AttachmentView } from "@/components/trip/attachment-list";

export interface GlobeViewProps {
  markers: MarkerView[];
  members: GlobeMemberView[];
  globeId?: string;
  attachmentsByMarkerId?: Record<string, AttachmentView[]>;
  arrival?: GlobeArrival | null;
}

export function GlobeView({ markers, members, globeId, attachmentsByMarkerId, arrival }: GlobeViewProps) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [filter, setFilter] = useState<MarkerFilter>({ category: null, country: null, query: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MarkerView | null>(null);
  const [prefill, setPrefill] = useState<{ lat: number; lng: number } | null>(null);
  // "Add {query}" (spec 2026-10-05 §H): the filter text to prefill the Add
  // Marker place search with; null for every other way of opening the form.
  const [addQuery, setAddQuery] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bumped on every open so the form's `key` changes and MarkerForm remounts
  // fresh — otherwise reopening "Add" (a constant key) reuses the prior
  // instance's state and carries the last marker's fields over.
  const [openSeq, setOpenSeq] = useState(0);

  const filtered = useMemo(() => filterMarkers(markers, filter), [markers, filter]);
  const countries = useMemo(() => distinctCountries(markers), [markers]);
  const byId = useMemo(() => new Map(markers.map((m) => [m.id, m])), [markers]);

  // Flies to + pops in the just-landed Trip's pins (Task 15), then toasts the
  // located count and drops `?added=` once they've settled. The timer is set
  // fresh per effect run and cleared on cleanup, so a Strict Mode double-run
  // still toasts exactly once.
  useEffect(() => {
    if (!arrival) return;
    const n = arrival.pins.length;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduce || n === 0 ? 0 : ARRIVAL_FLY_S * 1000 + n * PIN_STAGGER_MS + 200;
    const t = window.setTimeout(() => {
      toast({ title: arrivalToastTitle(n) });
      window.history.replaceState(null, "", "/globe");
    }, delay);
    return () => window.clearTimeout(t);
  }, [arrival]);

  const openAdd = () => { setEditing(null); setPrefill(null); setAddQuery(null); setOpenSeq((n) => n + 1); setFormOpen(true); };
  const openAddNamed = (q: string) => { setEditing(null); setPrefill(null); setAddQuery(q); setOpenSeq((n) => n + 1); setFormOpen(true); };
  const openEdit = (id: string) => { setEditing(byId.get(id) ?? null); setPrefill(null); setAddQuery(null); setOpenSeq((n) => n + 1); setFormOpen(true); };
  const openDrop = (lat: number, lng: number) => { setEditing(null); setPrefill({ lat, lng }); setAddQuery(null); setOpenSeq((n) => n + 1); setFormOpen(true); };

  const handleDelete = async (id: string) => {
    const marker = byId.get(id);
    const confirmed = await confirm({
      title: `Delete "${marker?.title ?? "this marker"}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    await deleteMarker(id);
  };

  const countryCount = countries.length;
  const hiddenByFilters = markers.length > 0 && filtered.length === 0;
  const query = filter.query.trim();

  return (
    <div className="flex flex-col gap-4 lg:gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-extrabold leading-none tracking-[-0.035em] text-foreground sm:text-4xl">
          Your globe
        </h1>
        <div className="flex items-center gap-2">
          <GlobeInviteButton members={members} />
          <Button onClick={openAdd}>
            <Plus aria-hidden="true" strokeWidth={3} />
            Add marker
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="lilac" className="min-h-7 px-2.5 py-1 text-[11px]">
          {countryCount} {countryCount === 1 ? "country" : "countries"}
        </Badge>
        <Badge variant="coral" className="min-h-7 px-2.5 py-1 text-[11px]">
          {markers.length} {markers.length === 1 ? "marker" : "markers"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-[18px]">
        <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-6">
          <GlobeMapLoader
            markers={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEdit={openEdit}
            onDelete={handleDelete}
            onMapClick={openDrop}
            attachmentsByMarkerId={attachmentsByMarkerId}
            arrivalPins={arrival?.pins}
          />
          <p className="text-right text-xs font-medium text-muted-foreground">Tap the map to drop a marker</p>
        </div>

        <Card data-testid="globe-panel" className="flex min-w-0 flex-col gap-3 p-3.5 lg:p-[18px]">
          {markers.length === 0 ? (
            // Nothing to filter yet: no filter box to mistake for adding a
            // place (spec 2026-10-05 §H) — one pointer to the two real ways in.
            <EmptyState
              icon={Globe}
              tone="teal"
              title="No markers yet"
              description="Tap the map to drop one, or use Add marker above."
            />
          ) : (
            <>
              <MarkerFilters filter={filter} countries={countries} onChange={setFilter} />
              {hiddenByFilters ? (
                query ? (
                  <EmptyState
                    icon={SearchX}
                    tone="teal"
                    title={
                      filter.country || filter.category
                        ? `Nothing called '${query}' on your globe with these filters`
                        : `Nothing called '${query}' on your globe yet`
                    }
                    action={
                      <Button onClick={() => openAddNamed(query)}>
                        <Plus aria-hidden="true" strokeWidth={3} />
                        Add {query}
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={SearchX}
                    tone="teal"
                    title="Nothing matches"
                    description="Try another country or category."
                  />
                )
              ) : (
                <MarkerList
                  markers={filtered}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  globeId={globeId}
                  attachmentsByMarkerId={attachmentsByMarkerId}
                />
              )}
            </>
          )}
        </Card>
      </div>

      <MarkerForm
        key={`${openSeq}-${editing ? `edit-${editing.id}` : prefill ? `drop-${prefill.lat},${prefill.lng}` : "add"}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        marker={editing}
        prefill={prefill}
        initialQuery={addQuery ?? undefined}
        globeId={globeId}
        attachments={editing ? (attachmentsByMarkerId?.[editing.id] ?? []) : undefined}
      />

      {confirmDialog}
    </div>
  );
}
