import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getShareLink } from "@/server/actions/share";
import { getCalendarFeed } from "@/server/actions/calendar-feed";
import {
  Card,
  CardContent,
  CardDescription,
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
      where: { tripId },
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
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ── Trip details ── */}
      <Card>
        <CardHeader>
          <CardTitle>Trip details</CardTitle>
          <CardDescription>
            Update the name, dates, and home currency for this trip.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TripDetailsForm
            tripId={tripId}
            defaultValues={{
              name: trip.name,
              // A date-less trip renders empty date inputs.
              startDate: trip.startDate ?? "",
              endDate: trip.endDate ?? "",
              hardEndDate: trip.hardEndDate ?? "",
              homeCurrency: trip.homeCurrency,
            }}
          />
          <div className="mt-6">
            <CoverImageField tripId={tripId} hasCover={trip.coverImageKey != null} />
          </div>
        </CardContent>
      </Card>

      {/* ── Chapters ── */}
      <Card>
        <CardHeader>
          <CardTitle>Chapters</CardTitle>
          <CardDescription>
            Group stops into named segments of your trip, each with its own
            colour. Chapters are optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChaptersManager tripId={tripId} chapters={chapters} />
        </CardContent>
      </Card>

      {/* ── Travellers ── */}
      <Card>
        <CardHeader>
          <CardTitle>Travellers</CardTitle>
          <CardDescription>
            Manage who has access to this trip.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvitePanel
            tripId={tripId}
            members={trip.members}
            pendingInvites={trip.invites}
          />
        </CardContent>
      </Card>

      {/* ── Sharing ── */}
      <Card>
        <CardHeader>
          <CardTitle>Public share link</CardTitle>
          <CardDescription>
            Share a read-only view of the itinerary with anyone — no account
            needed. Budget, notes, and files are never visible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SharePanel tripId={tripId} initialToken={shareLink?.token ?? null} />
        </CardContent>
      </Card>

      {/* ── Calendar feed ── */}
      <Card>
        <CardHeader>
          <CardTitle>Calendar feed</CardTitle>
          <CardDescription>
            Subscribe to this trip in Google, Apple or Outlook Calendar. Updates one-way as you
            edit the itinerary.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        <CardHeader>
          <CardTitle>Driving estimates</CardTitle>
          <CardDescription>
            Tune the offline estimates used to flag long driving days. These are rough guides, not
            navigation ETAs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DrivingEstimatesPanel
            tripId={tripId}
            initialWindingFactor={trip.drivingWindingFactor}
            initialAvgSpeedKph={trip.drivingAvgSpeedKph}
          />
        </CardContent>
      </Card>

      {/* ── Danger zone (owner only) ── */}
      {isOwner && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Irreversible actions. Please be certain before proceeding.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DangerZone tripId={tripId} tripName={trip.name} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
