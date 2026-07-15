import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getShareLink } from "@/server/actions/share";
import { getCalendarFeed } from "@/server/actions/calendar-feed";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TripDetailsForm } from "@/components/trip/settings/trip-details-form";
import { CoverImageField } from "@/components/trip/settings/cover-image-field";
import { InvitePanel } from "@/components/trip/settings/invite-panel";
import { SharePanel } from "@/components/trip/settings/share-panel";
import { CalendarFeedPanel } from "@/components/trip/settings/calendar-feed-panel";
import { DrivingEstimatesPanel } from "@/components/trip/settings/driving-estimates-panel";
import { DangerZone } from "@/components/trip/settings/danger-zone";
import { DuplicateTripDialog } from "@/components/trip/duplicate-trip-dialog";
import { ChaptersManager } from "@/components/trip/chapters-manager";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  const { membership } = await requireTripAccess(tripId);
  const isOwner = membership.role === "owner";

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      hardEndDate: true,
      coverImageKey: true,
      homeCurrency: true,
      homeName: true,
      roundTrip: true,
      drivingWindingFactor: true,
      drivingAvgSpeedKph: true,
      members: {
        select: {
          userId: true,
          role: true,
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      invites: {
        where: { acceptedAt: null },
        select: { id: true, email: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!trip) notFound();

  const [shareLink, calendarFeed, chapters] = await Promise.all([
    getShareLink(tripId),
    getCalendarFeed(tripId),
    db.chapter.findMany({
      where: { tripId, forkId: null },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        name: true,
        colour: true,
        startDate: true,
        endDate: true,
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-3.5">
      <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h2>

      {/* ── Trip details ── */}
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="font-display text-base font-bold tracking-tight">Trip details</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <TripDetailsForm
            tripId={tripId}
            defaultValues={{
              name: trip.name,
              // A date-less trip renders empty date inputs.
              startDate: trip.startDate ?? "",
              endDate: trip.endDate ?? "",
              hardEndDate: trip.hardEndDate ?? "",
              homeCurrency: trip.homeCurrency,
              homeName: trip.homeName,
              roundTrip: trip.roundTrip,
            }}
          />
          <div className="mt-6">
            <CoverImageField tripId={tripId} hasCover={trip.coverImageKey != null} />
          </div>
        </CardContent>
      </Card>

      {/* ── Chapters ── */}
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="font-display text-base font-bold tracking-tight">Chapters</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <ChaptersManager tripId={tripId} chapters={chapters} />
        </CardContent>
      </Card>

      {/* ── Travellers ── */}
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="font-display text-base font-bold tracking-tight">Travellers</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <InvitePanel
            tripId={tripId}
            members={trip.members}
            pendingInvites={trip.invites}
          />
        </CardContent>
      </Card>

      {/* ── Sharing ── */}
      <Card>
        <CardContent className="p-5">
          <SharePanel tripId={tripId} initialToken={shareLink?.token ?? null} />
        </CardContent>
      </Card>

      {/* ── Calendar feed ── */}
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="font-display text-base font-bold tracking-tight">Calendar feed</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <p className="text-xs text-muted-foreground">
            Subscribe to this trip in Google, Apple or Outlook Calendar. Updates one-way as you
            edit the itinerary.
          </p>
          <CalendarFeedPanel
            tripId={tripId}
            initialToken={calendarFeed?.token ?? null}
            initialFilter={
              calendarFeed
                ? {
                    includeTransport: calendarFeed.includeTransport,
                    includeAccommodation: calendarFeed.includeAccommodation,
                    includeActivities: calendarFeed.includeActivities,
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>

      {/* ── Driving estimates ── */}
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="font-display text-base font-bold tracking-tight">Driving estimates</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <p className="text-xs text-muted-foreground">
            Tune the offline estimates used to flag long driving days. These are rough guides, not
            navigation ETAs.
          </p>
          <DrivingEstimatesPanel
            tripId={tripId}
            initialWindingFactor={trip.drivingWindingFactor}
            initialAvgSpeedKph={trip.drivingAvgSpeedKph}
          />
        </CardContent>
      </Card>

      {/* ── Danger zone (owner only) — includes Duplicate ── */}
      {isOwner && (
        <Card className="bg-destructive/5 border-destructive/30">
          <CardHeader className="p-5 pb-0">
            <CardTitle className="font-display text-base font-bold tracking-tight text-destructive">Danger zone</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-3">
            <div className="flex flex-wrap gap-2.5">
              <DuplicateTripDialog tripId={tripId} tripName={trip.name} />
              <DangerZone tripId={tripId} tripName={trip.name} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
