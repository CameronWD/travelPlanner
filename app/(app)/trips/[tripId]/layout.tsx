import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { formatDateRange } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TripNav } from "@/components/trip/trip-nav";

function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  // Guard: 404 for non-members; returns user + membership for the rest
  await requireTripAccess(tripId);

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
          user: {
            select: { id: true, name: true, image: true },
          },
        },
      },
    },
  });

  if (!trip) {
    notFound();
  }

  const dateRange = formatDateRange(trip.startDate, trip.endDate);

  return (
    <div className="flex flex-col gap-0">
      {/* ── Trip header ── */}
      <div className="pb-4 pt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground">
              {trip.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{dateRange}</span>
              <Badge variant="outline" className="font-mono text-xs">
                {trip.homeCurrency}
              </Badge>
            </div>
          </div>

          {/* Member avatars */}
          {trip.members.length > 0 && (
            <div className="flex -space-x-2" aria-label="Trip members">
              {trip.members.slice(0, 6).map(({ user }) => (
                <Avatar
                  key={user.id}
                  className="size-8 ring-2 ring-background"
                  title={user.name ?? undefined}
                >
                  {user.image ? (
                    <AvatarImage src={user.image} alt={user.name ?? "Member"} />
                  ) : null}
                  <AvatarFallback className="text-xs">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {trip.members.length > 6 && (
                <div className="flex size-8 items-center justify-center rounded-full bg-muted ring-2 ring-background text-xs font-medium text-muted-foreground">
                  +{trip.members.length - 6}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Trip nav ── */}
      <TripNav tripId={tripId} />

      {/* ── Page content ── */}
      <div className="py-6">{children}</div>
    </div>
  );
}
