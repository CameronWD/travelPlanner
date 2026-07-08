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
import type { MarkerView, GlobeMemberView } from "./types";

export interface GlobeViewProps {
  markers: MarkerView[];
  members: GlobeMemberView[];
}

export function GlobeView({ markers, members }: GlobeViewProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<MarkerFilter>({ category: null, country: null, query: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MarkerView | null>(null);
  const [prefill, setPrefill] = useState<{ lat: number; lng: number } | null>(null);

  const filtered = useMemo(() => filterMarkers(markers, filter), [markers, filter]);
  const countries = useMemo(() => distinctCountries(markers), [markers]);
  const byId = useMemo(() => new Map(markers.map((m) => [m.id, m])), [markers]);

  const openAdd = () => { setEditing(null); setPrefill(null); setFormOpen(true); };
  const openEdit = (id: string) => { setEditing(byId.get(id) ?? null); setPrefill(null); setFormOpen(true); };
  const openDrop = (lat: number, lng: number) => { setEditing(null); setPrefill({ lat, lng }); setFormOpen(true); };
  const onSaved = () => router.refresh();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Everywhere you want to go. Tap the map to drop a pin, or use{" "}
          <span className="font-medium text-foreground">Add marker</span> to search for a place.
        </p>
        <div className="flex items-center gap-2">
          <GlobeInviteButton members={members} />
          <Button onClick={openAdd}>Add marker</Button>
        </div>
      </div>

      <GlobeMapLoader markers={filtered} onSelect={openEdit} onMapClick={openDrop} />

      <MarkerFilters filter={filter} countries={countries} onChange={setFilter} />
      <MarkerList markers={filtered} onSelect={openEdit} />

      <MarkerForm
        key={editing ? `edit-${editing.id}` : prefill ? `drop-${prefill.lat},${prefill.lng}` : "add"}
        open={formOpen}
        onOpenChange={setFormOpen}
        marker={editing}
        prefill={prefill}
        onSaved={onSaved}
      />
    </div>
  );
}
