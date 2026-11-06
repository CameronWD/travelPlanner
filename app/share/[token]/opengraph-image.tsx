import { ImageResponse } from "next/og";
import { DefaultOgCard, OG_SIZE, ShareOgCard, ogFonts } from "@/lib/og-card";
import { db } from "@/lib/db";
import { staticMapId } from "@/lib/map/google-config";
import { fetchStaticMapDataUrl } from "@/lib/map/static-map-fetch";
import { REAL_PLAN } from "@/lib/plan-scope";
import { homeMapPoint } from "@/lib/route-map";
import { loadRouteLegPaths } from "@/lib/travel-times/read";
import { findShareLink, loadShareStops } from "@/lib/share/lookup";
import { shareOgModel } from "@/lib/share/og";
import { scheduledShareStops } from "@/lib/share/view";
import { currentTripTimezone, todayISOInZone } from "@/lib/tz";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A shared trip on Teepee";
// Generated images are statically cached by default; a revoked or rotated
// link must stop previewing its trip at once, and the stage moves with today.
export const dynamic = "force-dynamic";

/** Same public projection as the page; a revoked link gets the site card, not a 404 that confirms it existed. */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fonts = await ogFonts();
  const link = await findShareLink(token);
  if (!link || !link.trip.startDate || !link.trip.endDate) {
    return new ImageResponse(<DefaultOgCard />, { ...size, fonts });
  }
  const stops = await loadShareStops(link.trip.id);
  // Dated Stops draw the sketch and set the clock; the count is every Stop (spec 2026-10-13 D4).
  const scheduled = scheduledShareStops(stops);
  const today = todayISOInZone(currentTripTimezone(scheduled));
  const model = shareOgModel({
    trip: { name: link.trip.name, startDate: link.trip.startDate, endDate: link.trip.endDate },
    stops: scheduled,
    stopCount: stops.length,
    today,
  });
  const mapId = staticMapId();
  let mapImage: string | null = null;
  if (mapId && scheduled.filter((s) => s.lat != null && s.lng != null).length > 0) {
    const home = homeMapPoint(link.trip);
    const transports = link.includeTransport
      ? await db.transport.findMany({
          where: { tripId: link.trip.id, ...REAL_PLAN },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            mode: true,
            fromStopId: true,
            toStopId: true,
            depPlace: true,
            arrPlace: true,
            depAt: true,
            arrAt: true,
            sortOrder: true,
            depIsHome: true,
            arrIsHome: true,
            depLat: true,
            depLng: true,
            arrLat: true,
            arrLng: true,
          },
        })
      : [];
    mapImage = await fetchStaticMapDataUrl({
      mapId,
      width: 280,
      height: 373,
      stops: scheduled,
      home,
      showReturn: link.trip.roundTrip ?? false,
      legPaths: await loadRouteLegPaths(scheduled, transports, home),
    });
  }
  return new ImageResponse(<ShareOgCard {...model} mapImage={mapImage} />, { ...size, fonts });
}
