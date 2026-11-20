import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Map, Navigation } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UsageAnchor } from "@/components/usage/usage-anchor";
import { TransportCountdown } from "@/components/trip/transport-countdown";
import { formatDayLabel } from "@/lib/dates";
import { instantToZonedDateISO, instantToZonedTime } from "@/lib/tz";
import { zoneLabel } from "@/lib/time-display";
import { directionsFromHereUrl } from "@/lib/map/maps";
import type { LocalMode } from "@/lib/travel-times/hops";
import type { NowNext } from "@/lib/now-next";

export function NowNextCard({
  nowNext,
  dayMapHref,
  localMode = null,
}: {
  nowNext: NowNext;
  tripId: string;
  dayMapHref: Route;
  localMode?: LocalMode | null;
}) {
  const dayMap = (
    <Button asChild variant="secondary" size="md" className="min-h-11">
      <Link href={dayMapHref}>
        <Map aria-hidden="true" />
        Day map
      </Link>
    </Button>
  );

  if (nowNext.kind === "nothing") {
    return (
      <Card className="flex items-center justify-between gap-3 p-3.5">
        <p className="text-sm font-bold text-muted-foreground">Nothing left today</p>
        {dayMap}
      </Card>
    );
  }

  if (nowNext.kind === "next-departure" && nowNext.withinDay && new Date(nowNext.departsAt) > new Date()) {
    return (
      <div className="flex flex-col gap-2">
        <TransportCountdown
          depAt={nowNext.departsAt}
          depTimeLabel={instantToZonedTime(nowNext.departsAt, nowNext.departsZone)}
          depZone={zoneLabel(nowNext.departsZone, instantToZonedDateISO(nowNext.departsAt, nowNext.departsZone))}
          label={nowNext.routeLabel}
        />
        <div className="flex">{dayMap}</div>
      </div>
    );
  }

  let eyebrow: string;
  let headline: string;
  let detail: ReactNode = null;
  let directions: string | null = null;

  if (nowNext.kind === "in-transit") {
    const time = instantToZonedTime(nowNext.arrivesAt, nowNext.arrivesZone);
    const arrivesDate = instantToZonedDateISO(nowNext.arrivesAt, nowNext.arrivesZone);
    const later = arrivesDate > instantToZonedDateISO(new Date(), nowNext.arrivesZone);
    const when = later ? `${formatDayLabel(arrivesDate)} ${time}` : time;
    eyebrow = "Now";
    headline = nowNext.arrivesName ? `Arrives ${nowNext.arrivesName} ${when}` : `Arrives ${when}`;
    detail = nowNext.routeLabel || null;
  } else if (nowNext.kind === "next-departure") {
    const day = formatDayLabel(instantToZonedDateISO(nowNext.departsAt, nowNext.departsZone));
    const time = instantToZonedTime(nowNext.departsAt, nowNext.departsZone);
    eyebrow = "Next";
    headline = nowNext.routeLabel ? `${day} ${time} · ${nowNext.routeLabel}` : `${day} ${time}`;
  } else {
    eyebrow = "Next";
    headline = nowNext.startsAt ? `${instantToZonedTime(nowNext.startsAt, nowNext.zone)} · ${nowNext.title}` : nowNext.title;
    const dest = nowNext.place ?? (nowNext.address ? { address: nowNext.address } : null);
    if (dest) directions = directionsFromHereUrl(dest, localMode).google;
  }

  return (
    <Card tone="coral" shadow={4} radius="xl" className="p-[18px]">
      <p className="text-label">{eyebrow}</p>
      <p className="mt-1.5 font-display text-2xl font-extrabold leading-[1.1] tracking-[-0.03em] text-balance">
        {headline}
      </p>
      {detail && <p className="mt-1 text-[13px] font-semibold">{detail}</p>}
      <div className="mt-3.5 flex flex-wrap gap-2">
        {directions && (
          <Button asChild variant="primary" size="md" className="min-h-11">
            <UsageAnchor action="directions-tapped" href={directions} target="_blank" rel="noopener noreferrer">
              <Navigation aria-hidden="true" />
              Directions
            </UsageAnchor>
          </Button>
        )}
        {dayMap}
      </div>
    </Card>
  );
}
