"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GlobeMapLoader } from "./globe-map-loader";
import { MarkerList } from "./marker-list";
import { MarkerFilters } from "./marker-filters";
import { MarkerForm } from "./marker-form";
import { GlobeInviteButton } from "./globe-invite-button";
import { filterMarkers, distinctCountries, type MarkerFilter } from "@/lib/globe-list";
import { Plus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { deleteMarker } from "@/server/actions/globe";
import type { MarkerView, GlobeMemberView } from "./types";
import type { AttachmentView } from "@/components/trip/attachment-list";

export interface GlobeViewProps {
  markers: MarkerView[];
  members: GlobeMemberView[];
  globeId?: string;
  attachmentsByMarkerId?: Record<string, AttachmentView[]>;
}

export function GlobeView({ markers, members, globeId, attachmentsByMarkerId }: GlobeViewProps) {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [filter, setFilter] = useState<MarkerFilter>({ category: null, country: null, query: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MarkerView | null>(null);
  const [prefill, setPrefill] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bumped on every open so the form's `key` changes and MarkerForm remounts
  // fresh — otherwise reopening "Add" (a constant key) reuses the prior
  // instance's state and carries the last marker's fields over.
  const [openSeq, setOpenSeq] = useState(0);

  const filtered = useMemo(() => filterMarkers(markers, filter), [markers, filter]);
  const countries = useMemo(() => distinctCountries(markers), [markers]);
  const byId = useMemo(() => new Map(markers.map((m) => [m.id, m])), [markers]);

  const openAdd = () => { setEditing(null); setPrefill(null); setOpenSeq((n) => n + 1); setFormOpen(true); };
  const openEdit = (id: string) => { setEditing(byId.get(id) ?? null); setPrefill(null); setOpenSeq((n) => n + 1); setFormOpen(true); };
  const openDrop = (lat: number, lng: number) => { setEditing(null); setPrefill({ lat, lng }); setOpenSeq((n) => n + 1); setFormOpen(true); };
  const onSaved = () => router.refresh();

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
    router.refresh();
  };

  const countryCount = countries.length;
  const hiddenByFilters = markers.length > 0 && filtered.length === 0;

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
        <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-20">
          <GlobeMapLoader
            markers={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEdit={openEdit}
            onDelete={handleDelete}
            onMapClick={openDrop}
            attachmentsByMarkerId={attachmentsByMarkerId}
          />
          <p className="text-right text-xs font-medium text-muted-foreground">Tap the map to drop a marker</p>
        </div>

        <Card data-testid="globe-panel" className="flex min-w-0 flex-col gap-3 p-3.5 lg:p-[18px]">
          <MarkerFilters filter={filter} countries={countries} onChange={setFilter} />
          {hiddenByFilters ? (
            <EmptyState
              icon={SearchX}
              tone="teal"
              title="Nothing matches"
              description="Try another place, country or category."
            />
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
        </Card>
      </div>

      <MarkerForm
        key={`${openSeq}-${editing ? `edit-${editing.id}` : prefill ? `drop-${prefill.lat},${prefill.lng}` : "add"}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        marker={editing}
        prefill={prefill}
        onSaved={onSaved}
        globeId={globeId}
        attachments={editing ? (attachmentsByMarkerId?.[editing.id] ?? []) : undefined}
      />

      {confirmDialog}
    </div>
  );
}
