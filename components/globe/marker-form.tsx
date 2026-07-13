"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import {
  createMarker,
  updateMarker,
  deleteMarker,
  searchPlacesAction,
} from "@/server/actions/globe";
import { useServerAction } from "@/components/ui/use-server-action";
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
import { toast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";

export interface MarkerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marker?: MarkerView | null;
  prefill?: { lat: number; lng: number } | null;
  onSaved: () => void;
  globeId?: string;
  attachments?: AttachmentView[];
}

interface ResolvedPlace {
  lat: number | null;
  lng: number | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

export function MarkerForm({ open, onOpenChange, marker, prefill, onSaved, globeId, attachments }: MarkerFormProps) {
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
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);

  // Search flow — stays on its own useTransition (PlaceSearchOutcome is not ActionResult-shaped)
  const [searchPending, startSearchTransition] = useTransition();

  // Save flow — create or update
  const save = useServerAction(
    () => {
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
      return isEdit ? updateMarker(marker!.id, input) : createMarker(input);
    },
    {
      onSuccess: () => {
        toast({
          title: isEdit ? "Marker updated" : "Marker added",
          description: title,
          variant: "success",
        });
        onOpenChange(false);
        onSaved();
      },
    },
  );

  // Delete flow
  const del = useServerAction(
    () => deleteMarker(marker!.id),
    {
      onSuccess: () => {
        toast({
          title: "Marker removed",
          description: marker?.title,
          variant: "success",
        });
        onOpenChange(false);
        onSaved();
      },
    },
  );

  // Confirm dialog for destructive delete
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Combined busy flag — disables every control during any async operation
  const busy = searchPending || save.isPending || del.isPending;

  // If dropped via map click (prefill present, not editing), resolve the place
  // name in the background. State updates happen only inside the async IIFE —
  // never synchronously in the effect body (react-hooks/set-state-in-effect).
  const geocodedRef = useRef(false);
  useEffect(() => {
    if (!prefill || marker || geocodedRef.current) return;
    geocodedRef.current = true;
    setResolvingPlace(true);
    void (async () => {
      const { reverseGeocodeAction } = await import("@/server/actions/globe");
      const c = await reverseGeocodeAction(prefill.lat, prefill.lng);
      setResolvingPlace(false);
      if (!c) return;
      setTitle((t) => t || c.name.split(",")[0]);
      setQuery((q) => q || c.name);
      setPlace({ lat: c.lat, lng: c.lng, city: c.city, country: c.country, countryCode: c.countryCode });
    })();
  }, [prefill, marker]);

  const runSearch = () => {
    const q = query.trim();
    if (!q) return;
    startSearchTransition(async () => {
      const res = await searchPlacesAction(q);
      setSearched(true);
      if (res.status === "error") {
        setSearchFailed(true);
        setCandidates([]);
      } else {
        setSearchFailed(false);
        setCandidates(res.candidates);
      }
    });
  };

  const chooseCandidate = (c: GeoCandidate) => {
    // Always adopt the picked result's name — picking a place is an explicit
    // choice, so it overwrites any prior title (including an earlier pick).
    setTitle(c.name.split(",")[0]);
    setPlace({ lat: c.lat, lng: c.lng, city: c.city, country: c.country, countryCode: c.countryCode });
    setCandidates([]);
    setSearched(false);
    setSearchFailed(false);
  };

  // Resolved location caption: "Tokyo, Japan"
  const locationCaption = place?.city && place?.country
    ? `${place.city}, ${place.country}`
    : place?.country ?? null;

  const errors = save.errors;

  return (
    <>
    {confirmDialog}
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
                onChange={(e) => { setQuery(e.target.value); setSearched(false); setSearchFailed(false); }}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Search for a place…"
                disabled={busy}
                aria-label="Place search"
              />
              <Button
                type="button"
                variant="outline"
                onClick={runSearch}
                loading={searchPending}
                disabled={busy}
              >
                Search
              </Button>
            </div>

            {/* Candidate list */}
            {candidates.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-lg border border-border bg-card p-1 max-h-48 overflow-y-auto">
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

            {searchFailed && (
              <p className="text-xs text-destructive">
                Place search is temporarily unavailable. Please try again in a moment.
              </p>
            )}
            {searched && !searchFailed && candidates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No matching places found. Try a more specific search.
              </p>
            )}

            {/* Pin-drop geocode hint — shown while background reverse-geocode is resolving */}
            {resolvingPlace && !locationCaption && (
              <p className="text-xs text-muted-foreground">Finding this place…</p>
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
              disabled={busy}
            />
          </Field>

          {/* Category */}
          <Field label="Category" error={errors.category?.join(", ")}>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)} disabled={busy}>
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
              disabled={busy}
            />
          </Field>

          {/* Link */}
          <Field label="Link" error={errors.link?.join(", ")}>
            <Input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              disabled={busy}
            />
          </Field>

          {/* Note */}
          <Field label="Note" error={errors.note?.join(", ")}>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything worth noting…"
              disabled={busy}
            />
          </Field>

          {/* Attachments */}
          {marker?.id && globeId ? (
            <AttachmentList
              globeId={globeId}
              targetType="MARKER"
              targetId={marker.id}
              attachments={attachments ?? []}
              compact
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Save this marker first, then reopen it to attach files.
            </p>
          )}

          <DialogFooter>
            {/* Delete — edit mode only */}
            {isEdit && (
              <Button
                type="button"
                variant="destructive"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete "${title}"?`,
                    description: "This marker will be permanently removed.",
                    confirmLabel: "Delete",
                    destructive: true,
                  });
                  if (ok) del.run();
                }}
                loading={del.isPending}
                disabled={busy}
                className="sm:mr-auto"
              >
                Delete
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="primary"
              onClick={() => save.run()}
              loading={save.isPending}
              disabled={busy}
            >
              Save
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
