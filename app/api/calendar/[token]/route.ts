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
      alarmTransport: true,
      alarmCheckOut: true,
      trip: { select: { id: true, name: true } },
    },
  });
  if (!feed) {
    return NextResponse.json({ error: "Feed not found" }, { status: 404 });
  }

  const tripId = feed.trip.id;
  // ARCH-TEN-7: a feed URL is bearer auth — calendar clients fetch it
  // unauthenticated and the URL travels wherever a subscribed calendar is
  // shared. It therefore inherits the Share link's floor (server/actions/share.ts:14):
  // money, notes, confirmations and booking refs are never emitted. The
  // confirmation lives in the app, offline, behind the Traveller's account.
  const [stops, items, transports, accommodations] = await Promise.all([
    db.stop.findMany({ where: { tripId, forkId: null, arriveDate: { not: null } }, select: { id: true, name: true, timezone: true } }),
    db.item.findMany({
      where: { tripId, forkId: null, date: { not: null } },
      select: {
        id: true, title: true, category: true, date: true, startTime: true, endTime: true,
        stopId: true, address: true, link: true,
      },
    }),
    db.transport.findMany({
      where: { tripId, forkId: null },
      select: { id: true, mode: true, depPlace: true, arrPlace: true, depAt: true, arrAt: true },
    }),
    db.accommodation.findMany({
      where: { tripId, forkId: null },
      select: {
        id: true,
        name: true,
        checkIn: true,
        checkOut: true,
        address: true,
        checkOutTime: true,
        stopId: true,
      },
    }),
  ]);

  const ics = buildICS({
    tripName: feed.trip.name,
    // A rough stop may have no timezone. Pass `null` through rather than
    // defaulting to "UTC" here: that string is truthy, so it would satisfy
    // ics.ts's `&& tz` accommodation-alarm guard and fire a check-out Alarm
    // at a confidently wrong hour instead of being skipped as "no zone to
    // trust". `IcsStop.timezone` is typed `string | null` so the compiler
    // enforces this rather than a comment merely asserting it.
    stops,
    items: feed.includeActivities ? items : [],
    transports: feed.includeTransport ? transports : [],
    accommodations: feed.includeAccommodation ? accommodations : [],
    generatedAt: new Date(),
    alarms: { transport: feed.alarmTransport, checkOut: feed.alarmCheckOut },
  });

  const headers = new Headers();
  headers.set("Content-Type", "text/calendar; charset=utf-8");
  headers.set("Content-Disposition", 'inline; filename="trip.ics"');
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(ics, { status: 200, headers });
}
