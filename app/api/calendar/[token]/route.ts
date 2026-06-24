import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildICS } from "@/lib/ics";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const feed = await db.calendarFeed.findUnique({
    where: { token },
    select: {
      includeTransport: true,
      includeAccommodation: true,
      includeActivities: true,
      trip: { select: { id: true, name: true } },
    },
  });
  if (!feed) {
    return NextResponse.json({ error: "Feed not found" }, { status: 404 });
  }

  const tripId = feed.trip.id;
  const [stops, items, transports, accommodations] = await Promise.all([
    db.stop.findMany({ where: { tripId }, select: { id: true, name: true, timezone: true } }),
    db.item.findMany({
      where: { tripId, date: { not: null } },
      select: {
        id: true, title: true, category: true, date: true, startTime: true, endTime: true,
        stopId: true, address: true, link: true, booking: true, notes: true,
      },
    }),
    db.transport.findMany({
      where: { tripId },
      select: { id: true, mode: true, depPlace: true, arrPlace: true, depAt: true, arrAt: true, reference: true },
    }),
    db.accommodation.findMany({
      where: { tripId },
      select: { id: true, name: true, checkIn: true, checkOut: true, address: true, confirmation: true, notes: true },
    }),
  ]);

  const ics = buildICS({
    tripName: feed.trip.name,
    // A rough stop may have no timezone; fall back to UTC for the feed.
    stops: stops.map((s) => ({ ...s, timezone: s.timezone ?? "UTC" })),
    items: feed.includeActivities ? items : [],
    transports: feed.includeTransport ? transports : [],
    accommodations: feed.includeAccommodation ? accommodations : [],
    generatedAt: new Date(),
  });

  const headers = new Headers();
  headers.set("Content-Type", "text/calendar; charset=utf-8");
  headers.set("Content-Disposition", 'inline; filename="trip.ics"');
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(ics, { status: 200, headers });
}
