import Link from "next/link";
import { formatDateRange, formatNights, nightsBetween } from "@/lib/dates";
import type { TravellerLike } from "@/lib/traveller";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { NotificationBell, type RecentActivity } from "@/components/trip/notification-bell";

/**
 * "4 Dec 2026 – 8 Jan 2027 · 35 nights · 11 stops · AUD" — the only place on
 * the desktop Home that shows dates or currency (spec §2). A date-less trip
 * drops the dates and nights; a Trip with no Stops drops the stop count.
 */
export function homeMetaLine({
  startDate,
  endDate,
  stopCount,
  currency,
}: {
  startDate: string | null;
  endDate: string | null;
  stopCount: number;
  currency: string;
}): string | null {
  const parts: string[] = [];
  if (startDate && endDate) {
    parts.push(formatDateRange(startDate, endDate));
    parts.push(formatNights(nightsBetween(startDate, endDate)));
  }
  if (stopCount > 0) parts.push(`${stopCount} ${stopCount === 1 ? "stop" : "stops"}`);
  if (currency) parts.push(currency);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export interface HomeHeaderProps {
  /** The signed-in Traveller's first name, from their display name (spec J). */
  firstName: string;
  tripName: string;
  metaLine: string | null;
  unreadCount: number;
  recent: RecentActivity[];
  members: TravellerLike[];
  tripId: string;
  isOwner: boolean;
}

const MAX_AVATARS = 5;

/**
 * Desktop Home header (spec §2, amended by beta-feedback §C): greeting, the
 * page's single h1 at lg+ (the trip layout's own header is lg:hidden on Home,
 * ruling R2), the meta line; then bell, people stack and the one primary
 * button.
 */
export function HomeHeader({
  firstName,
  tripName,
  metaLine,
  unreadCount,
  recent,
  members,
  tripId,
  isOwner,
}: HomeHeaderProps) {
  const base = `/trips/${tripId}`;
  const shown = members.slice(0, MAX_AVATARS);
  const extra = members.length - shown.length;
  const peopleLabel = `Trip members (${members.length})${isOwner ? ", invite people" : ""}`;

  return (
    <header className="flex items-end gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[15px] font-medium text-muted-foreground">Hey {firstName}</p>
        <h1 className="break-words font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground">
          {tripName}
        </h1>
        {metaLine ? <p className="text-[15px] font-semibold text-foreground">{metaLine}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <NotificationBell tripId={tripId} unreadCount={unreadCount} recent={recent} />

        {members.length > 0 ? (
          <Link
            href={`${base}/settings#travellers`}
            aria-label={peopleLabel}
            className="inline-flex min-h-11 items-center rounded-full px-1 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex -space-x-2.5">
              {shown.map((m) => (
                <TravellerAvatar key={m.id} traveller={m} size={40} className="border-2 border-border" />
              ))}
              {extra > 0 ? (
                <span className="relative grid size-10 place-items-center rounded-full border-2 border-border bg-card text-xs font-extrabold text-foreground">
                  +{extra}
                </span>
              ) : null}
            </span>
          </Link>
        ) : null}

        <Link
          href={`${base}/plan?add=stop`}
          className="inline-flex h-11 items-center whitespace-nowrap rounded-full border-2 border-border bg-primary px-5 text-sm font-extrabold text-primary-foreground shadow-[4px_4px_0_var(--color-coral)] transition-transform hover:-translate-x-px hover:-translate-y-px focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
        >
          + Add a stop
        </Link>
      </div>
    </header>
  );
}
