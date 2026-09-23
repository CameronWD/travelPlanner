import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { formatDateRange, nightsBetween } from "@/lib/dates";
import { orderPlanStops } from "@/lib/plan-order";
import { describePhase } from "@/lib/trip-phase";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { chapterColourSwatch } from "@/lib/chapter-colours";
import { ShareOgCard, DefaultOgCard, OG_SIZE, ogFonts } from "@/lib/og-card";

/**
 * Dynamic OG image for a share link. Same query discipline as page.tsx: select only what
 * the card shows (no costs, notes, confirmations). Invalid/revoked/date-less → generic card,
 * never a 404 image (unfurlers cache errors).
 * TODO(repo): confirm the Stop → Chapter relation name; fallback hue is teal.
 */
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A trip shared from Teepee";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fonts = await ogFonts();
  const link = await db.shareLink.findUnique({
    where: { token },
    select: { trip: { select: { id: true, name: true, startDate: true, endDate: true } } },
  });
  const trip = link?.trip;
  if (!trip || !trip.startDate || !trip.endDate) return new ImageResponse(<DefaultOgCard />, { ...size, fonts });

  const raw = await db.stop.findMany({
    where: { tripId: trip.id, ...REAL_PLAN, arriveDate: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true, chapter: { select: { colour: true } } },
  });
  const stops = orderPlanStops(raw.map((s) => ({ ...s, timezone: s.timezone ?? "UTC", arriveDate: s.arriveDate!, departDate: s.departDate! })));
  const phase = describePhase({ startDate: trip.startDate, endDate: trip.endDate, today: todayISOInZone(currentTripTimezone(stops)) });

  return new ImageResponse(
    <ShareOgCard trip={{
      name: trip.name,
      dates: formatDateRange(trip.startDate, trip.endDate),
      nights: nightsBetween(trip.startDate, trip.endDate),
      stops: stops.map((s) => ({ name: s.name, hex: chapterColourSwatch(s.chapter?.colour ?? "teal") })),
      phase: phase.countdown,
    }} />,
    { ...size, fonts },
  );
}
