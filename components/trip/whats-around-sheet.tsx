"use client";
import * as React from "react";
import { haversineKm, type LatLng } from "@/lib/geo";
import { mapsUrl } from "@/lib/map/maps";
import { NEARBY_KINDS, type NearbyKind } from "@/lib/nearby/kinds";
import type { NearbyPlace } from "@/lib/nearby/search";
import { whatsAround, type WhatsAroundFrom } from "@/server/actions/whats-around";
import { createItem } from "@/server/actions/items";
import type { ItemInput } from "@/lib/validations/item";
import { Chip } from "@/components/ui/chip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "@/components/ui/use-toast";

type StartPoint = { key: string; label: string; from: Exclude<WhatsAroundFrom, { kind: "device" }> };
type Loaded = { status: "ok"; places: NearbyPlace[]; origin: LatLng } | { status: "over-cap" } | { status: "failed" };

const NEAR_ME = "near-me";

export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? Math.round(k * 10) / 10 : Math.round(k)}k`;
}

export function walkMinutes(a: LatLng, b: LatLng): number {
  return Math.max(1, Math.round(((haversineKm(a, b) * 1.3) / 4.8) * 60));
}

export function WhatsAroundSheet({ tripId, date, dateLabel, stopId, startPoints, allowNearMe }: {
  tripId: string;
  date: string;
  dateLabel: string;
  stopId: string | null;
  startPoints: StartPoint[];
  allowNearMe: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [startKey, setStartKey] = React.useState(startPoints[0]?.key ?? (allowNearMe ? NEAR_ME : ""));
  const [kind, setKind] = React.useState<NearbyKind>("sights");
  const [device, setDevice] = React.useState<LatLng | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [locationMessage, setLocationMessage] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  const memo = React.useRef(new Map<string, Loaded>());
  const request = React.useRef(0);

  const start = startPoints.find((s) => s.key === startKey);
  const from: WhatsAroundFrom | null = startKey === NEAR_ME ? (device ? { kind: "device", ...device } : null) : (start?.from ?? null);

  React.useEffect(() => {
    if (!open || !from) return;
    const memoKey = startKey === NEAR_ME ? null : `${startKey}|${kind}`;
    const cached = memoKey ? memo.current.get(memoKey) : undefined;
    if (cached) {
      setLoaded(cached);
      return;
    }
    const mine = ++request.current;
    setLoaded(null);
    whatsAround(tripId, { from, nearbyKind: kind })
      .then((r): Loaded => (r.status === "ok" ? r : r.status === "over-cap" ? { status: "over-cap" } : { status: "failed" }))
      .catch((): Loaded => ({ status: "failed" }))
      .then((result) => {
        if (mine !== request.current) return;
        if (memoKey && result.status !== "failed") memo.current.set(memoKey, result);
        setLoaded(result);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startKey, kind, device, tripId]);

  function nearMe() {
    setLocationMessage(null);
    if (device) {
      setStartKey(NEAR_ME);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationMessage("Location isn't available here.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setDevice({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStartKey(NEAR_ME);
      },
      (err) => {
        setLocating(false);
        setLocationMessage(err.code === 1 ? "Location is off for this site." : "Couldn't get your location.");
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function save(place: NearbyPlace, to: "day" | "wishlist") {
    const category = NEARBY_KINDS.find((k) => k.key === kind)!.category as ItemInput["category"];
    const input: ItemInput = {
      title: place.name,
      category,
      placeId: place.placeId,
      lat: place.lat,
      lng: place.lng,
      ...(place.address ? { address: place.address } : {}),
      ...(place.openingHours ? { openingHours: place.openingHours } : {}),
      ...(place.businessStatus ? { businessStatus: place.businessStatus as ItemInput["businessStatus"] } : {}),
      ...(place.website ? { link: place.website } : {}),
      ...(to === "day" ? { date, ...(stopId ? { stopId } : {}) } : {}),
    };
    setPending(`${place.placeId}|${to}`);
    void (async () => {
      try {
        const r = await createItem(tripId, input);
        if (r.success) toast({ title: to === "day" ? `Added to ${dateLabel}` : "Saved to the Wishlist", description: place.name });
        else toast({ variant: "destructive", title: "Couldn't add it.", description: r.errors ? Object.values(r.errors)[0]?.[0] : undefined });
      } catch {
        toast({ variant: "destructive", title: "Couldn't add it." });
      } finally {
        setPending(null);
      }
    })();
  }

  const kindMeta = NEARBY_KINDS.find((k) => k.key === kind)!;
  const actionClass = "pressable inline-flex h-[34px] shrink-0 items-center justify-center rounded-full border-2 border-border bg-card px-3 text-[13px] font-extrabold text-foreground shadow-[2px_2px_0_hsl(var(--shadow-ink))] disabled:opacity-50";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Chip tone="white" size="l" touch>What&apos;s around</Chip>
      </SheetTrigger>
      <SheetContent side="docked">
        <SheetHeader>
          <SheetTitle>What&apos;s around</SheetTitle>
          <SheetDescription>{dateLabel}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Start from">
            {startPoints.map((s) => (
              <Chip key={s.key} selected={startKey === s.key} tone={startKey === s.key ? "ink" : "white"} onClick={() => setStartKey(s.key)}>{s.label}</Chip>
            ))}
            {allowNearMe ? (
              <Chip selected={startKey === NEAR_ME} tone={startKey === NEAR_ME ? "ink" : "white"} disabled={locating} onClick={nearMe}>Near me</Chip>
            ) : null}
          </div>
          {locationMessage ? <p role="status" className="text-[13px] font-semibold text-muted-foreground">{locationMessage}</p> : null}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind">
            {NEARBY_KINDS.map((k) => (
              <Chip key={k.key} selected={kind === k.key} tone={kind === k.key ? "ink" : "white"} onClick={() => setKind(k.key)}>{k.label}</Chip>
            ))}
          </div>
          <div className="min-h-0 overflow-y-auto">
            {!from ? (
              <p role="status" className="text-[13px] font-semibold text-muted-foreground">Pick a place to look around.</p>
            ) : loaded === null ? (
              <p role="status" className="text-[13px] font-semibold text-muted-foreground">Looking around…</p>
            ) : loaded.status === "over-cap" ? (
              <p role="status" className="text-[13px] font-semibold text-muted-foreground">That&apos;s all the looking around for today. Try again tomorrow.</p>
            ) : loaded.status === "failed" ? (
              <p role="status" className="text-[13px] font-semibold text-muted-foreground">Couldn&apos;t look around right now.</p>
            ) : loaded.places.length === 0 ? (
              <p role="status" className="text-[13px] font-semibold text-muted-foreground">Nothing like that nearby.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-2.5">
                  {loaded.places.map((p) => {
                    const href = mapsUrl({ lat: p.lat, lng: p.lng, label: p.name, placeId: p.placeId });
                    const open = p.openNow === true && p.closesAt ? `Open until ${p.closesAt}` : p.openNow === false ? "Closed now" : null;
                    const meta = [
                      p.typeLabel ?? kindMeta.label,
                      p.rating !== null ? `★ ${p.rating.toFixed(1)}${p.ratingCount !== null ? ` (${compactCount(p.ratingCount)})` : ""}` : null,
                      `~${walkMinutes(loaded.origin, p)} min walk`,
                      open,
                    ].filter(Boolean);
                    return (
                      <li key={p.placeId} className="flex flex-col gap-2 rounded-[16px] border-2 border-border bg-card px-3 py-2.5">
                        <span className="min-w-0">
                          {href ? (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate text-[15px] font-bold text-foreground underline underline-offset-2">{p.name}</a>
                          ) : (
                            <span className="block truncate text-[15px] font-bold text-foreground">{p.name}</span>
                          )}
                          <span className="block text-[13px] text-muted-foreground">{meta.join(" · ")}</span>
                        </span>
                        <span className="flex gap-2">
                          <button type="button" aria-label={`Add ${p.name} to ${dateLabel}`} disabled={pending !== null} onClick={() => save(p, "day")} className={actionClass}>+ Day</button>
                          <button type="button" aria-label={`Save ${p.name} to the Wishlist`} disabled={pending !== null} onClick={() => save(p, "wishlist")} className={actionClass}>♡ Wishlist</button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p translate="no" className="mt-2 text-right text-[11px] font-semibold text-muted-foreground">Google Maps</p>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
