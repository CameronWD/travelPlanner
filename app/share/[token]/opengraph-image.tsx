import { ImageResponse } from "next/og";
import { DefaultOgCard, OG_SIZE, ShareOgCard, ogFonts } from "@/lib/og-card";
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
  return new ImageResponse(<ShareOgCard {...model} />, { ...size, fonts });
}
