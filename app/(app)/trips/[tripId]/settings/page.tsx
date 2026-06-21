import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getShareLink } from "@/server/actions/share";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TripDetailsForm } from "@/components/trip/settings/trip-details-form";
import { InvitePanel } from "@/components/trip/settings/invite-panel";
import { SharePanel } from "@/components/trip/settings/share-panel";
import { DangerZone } from "@/components/trip/settings/danger-zone";

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
      homeCurrency: true,
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

  const shareLink = await getShareLink(tripId);

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
              startDate: trip.startDate,
              endDate: trip.endDate,
              homeCurrency: trip.homeCurrency,
            }}
          />
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
