import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildICS } from "@/lib/ics";
import { readPlan } from "@/lib/plan-reads";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // ADR 0067 (Recently deleted): `findUnique` can't filter on a relation, so
  // this is a `findFirst` scoped by the token's own unique column — a Trip
  // in Recently deleted must 404 the same as an unknown token.
  const feed = await db.calendarFeed.findFirst({
    where: { token, trip: { deletedAt: null } },
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
  //
  // Policy (not a BND-2 spelling exemption): this dated view deliberately
  // always shows the real plan and ignores `?plan=` — see
  // architecture-sitrep-2026-09-22.md. Never wire in a variable plan here.
  //
  // Surprise (CONTEXT.md, ADR 0051): one subscription per Trip with no viewer
  // identity, so a null viewer is surprised by every live Surprise and the
  // inside stays out of the feed for everyone until the reveal. A hidden
  // real-plan Item keeps its slot as an event titled "Surprise".
  //
  // The feed row above already proves the Trip exists and is not deleted, so
  // readPlan's notFound() (a Next 404 from a Route Handler) cannot fire here;
  // the unknown-token case keeps its explicit JSON 404 above.
  const rows = await readPlan(tripId, null, null);

  // Each row is narrowed to exactly the fields buildICS read before readPlan:
  // rows also carry notes / booking / reference / confirmation, and the
  // ARCH-TEN-7 floor says none of them may reach the serializer. Costs are
  // never passed.
  const stops = rows.stops
    .filter((s) => s.arriveDate)
    .map((s) => ({ id: s.id, name: s.name, timezone: s.timezone }));
  // Placeholders are already merged and titled "Surprise" (real plan only).
  const items = rows.items
    .filter((i) => i.date)
    .map((i) => ({
      id: i.id, title: i.title, category: i.category, date: i.date,
      startTime: i.startTime, endTime: i.endTime, stopId: i.stopId,
      address: i.address, link: i.link,
    }));
  const transports = rows.transports.map((t) => ({
    id: t.id, mode: t.mode, depPlace: t.depPlace, arrPlace: t.arrPlace, depAt: t.depAt, arrAt: t.arrAt,
  }));
  const accommodations = rows.accommodations.map((a) => ({
    id: a.id, name: a.name, checkIn: a.checkIn, checkOut: a.checkOut,
    address: a.address, checkOutTime: a.checkOutTime, stopId: a.stopId,
  }));

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
