"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GlobeMapLoader } from "./globe-map-loader";
import { MarkerList } from "./marker-list";
import { MarkerFilters } from "./marker-filters";
import { MarkerForm } from "./marker-form";
import { GlobeInviteButton } from "./globe-invite-button";
import { filterMarkers, distinctCountries, type MarkerFilter } from "@/lib/globe-list";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Everywhere you want to go. Tap the map to drop a pin, or use{" "}
          <span className="font-medium text-foreground">Add marker</span> to search for a place.
        </p>
        <div className="flex items-center gap-2">
          <GlobeInviteButton members={members} />
          <Button onClick={openAdd}>Add Marker</Button>
        </div>
      </div>

      <GlobeMapLoader
        markers={filtered}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onDelete={handleDelete}
        onMapClick={openDrop}
        attachmentsByMarkerId={attachmentsByMarkerId}
      />

      <MarkerFilters filter={filter} countries={countries} onChange={setFilter} />
      <MarkerList
        markers={filtered}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onDelete={handleDelete}
        globeId={globeId}
        attachmentsByMarkerId={attachmentsByMarkerId}
      />

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
