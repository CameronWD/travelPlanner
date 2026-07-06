"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import {
  createMarker,
  updateMarker,
  deleteMarker,
  searchPlacesAction,
} from "@/server/actions/globe";
import type { GeoCandidate } from "@/lib/geocode";
import type { MarkerView } from "@/components/globe/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

export interface MarkerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marker?: MarkerView | null;
  prefill?: { lat: number; lng: number } | null;
  onSaved: () => void;
}

interface ResolvedPlace {
  lat: number | null;
  lng: number | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

export function MarkerForm({ open, onOpenChange, marker, prefill, onSaved }: MarkerFormProps) {
  const isEdit = !!marker;

  // State seeds directly from props so the parent can remount this component
  // (via a changing `key`) whenever the target marker / prefill changes — no
  // synchronous setState inside an effect body (react-hooks/set-state-in-effect).
  const [title, setTitle] = useState(marker?.title ?? "");
  const [category, setCategory] = useState<Category>((marker?.category as Category) ?? "SIGHTSEEING");
  const [note, setNote] = useState(marker?.note ?? "");
  const [link, setLink] = useState(marker?.link ?? "");
  const [timing, setTiming] = useState(marker?.timing ?? "");
  const [place, setPlace] = useState<ResolvedPlace | null>(
    marker
      ? { lat: marker.lat, lng: marker.lng, city: marker.city, country: marker.country, countryCode: marker.countryCode }
      : prefill
        ? { lat: prefill.lat, lng: prefill.lng, city: null, country: null, countryCode: null }
        : null,
  );
  const [query, setQuery] = useState(marker?.title ?? "");
  const [candidates, setCandidates] = useState<GeoCandidate[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  // If dropped via map click (prefill present, not editing), resolve the place
  // name in the background. State updates happen only inside the async IIFE —
  // never synchronously in the effect body (react-hooks/set-state-in-effect).
  const geocodedRef = useRef(false);
  useEffect(() => {
    if (!prefill || marker || geocodedRef.current) return;
    geocodedRef.current = true;
    void (async () => {
      const { reverseGeocodeAction } = await import("@/server/actions/globe");
      const c = await reverseGeocodeAction(prefill.lat, prefill.lng);
      if (!c) return;
      setTitle((t) => t || c.name.split(",")[0]);
      setQuery((q) => q || c.name);
      setPlace({ lat: c.lat, lng: c.lng, city: c.city, country: c.country, countryCode: c.countryCode });
    })();
  }, [prefill, marker]);

  const runSearch = () => {
    const q = query.trim();
    if (!q) return;
    startTransition(async () => {
      setCandidates(await searchPlacesAction(q));
    });
  };

  const chooseCandidate = (c: GeoCandidate) => {
    setTitle((t) => t || c.name.split(",")[0]);
    setPlace({ lat: c.lat, lng: c.lng, city: c.city, country: c.country, countryCode: c.countryCode });
    setCandidates([]);
  };

  const submit = () => {
    const input = {
      title,
      category,
      note,
      link,
      timing,
      lat: place?.lat ?? undefined,
      lng: place?.lng ?? undefined,
      city: place?.city ?? undefined,
      country: place?.country ?? undefined,
      countryCode: place?.countryCode ?? undefined,
    };
    startTransition(async () => {
      const res = isEdit ? await updateMarker(marker!.id, input) : await createMarker(input);
      if (res.success) {
        onOpenChange(false);
        onSaved();
      } else {
        setErrors(res.errors);
      }
    });
  };

  const remove = () => {
    if (!marker) return;
    startTransition(async () => {
      const res = await deleteMarker(marker.id);
      if (res.success) {
        onOpenChange(false);
        onSaved();
      }
    });
  };

  // Resolved location caption: "Tokyo, Japan"
  const locationCaption = place?.city && place?.country
    ? `${place.city}, ${place.country}`
    : place?.country ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Marker" : "Add Marker"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Place search */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Search for a place…"
                disabled={pending}
                aria-label="Place search"
              />
              <Button
                type="button"
                variant="outline"
                onClick={runSearch}
                disabled={pending}
              >
                Search
              </Button>
            </div>

            {/* Candidate list */}
            {candidates.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-lg border border-border bg-card p-1">
                {candidates.map((c, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => chooseCandidate(c)}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Resolved location caption */}
            {locationCaption && (
              <p className="text-xs text-muted-foreground">{locationCaption}</p>
            )}
          </div>

          {/* Title */}
          <Field label="Title" required error={errors.title?.join(", ")}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Tokyo Tower"
              disabled={pending}
            />
          </Field>

          {/* Category */}
          <Field label="Category" error={errors.category?.join(", ")}>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)} disabled={pending}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* When / timing */}
          <Field label="When" error={errors.timing?.join(", ")}>
            <Input
              value={timing}
              onChange={(e) => setTiming(e.target.value)}
              placeholder="e.g. Spring, evenings, weekends…"
              disabled={pending}
            />
          </Field>

          {/* Link */}
          <Field label="Link" error={errors.link?.join(", ")}>
            <Input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              disabled={pending}
            />
          </Field>

          {/* Note */}
          <Field label="Note" error={errors.note?.join(", ")}>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything worth noting…"
              disabled={pending}
            />
          </Field>

          <DialogFooter>
            {/* Delete — edit mode only */}
            {isEdit && (
              <Button
                type="button"
                variant="destructive"
                onClick={remove}
                disabled={pending}
                className="sm:mr-auto"
              >
                Delete
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="primary"
              onClick={submit}
              loading={pending}
              disabled={pending}
            >
              Save
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
