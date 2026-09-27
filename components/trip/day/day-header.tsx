import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TravellerLike } from "@/lib/traveller";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { NotificationBell, type RecentActivity } from "@/components/trip/notification-bell";
import { TripSwitcherFromContext } from "@/components/shell/trip-switcher";

const MAX_AVATARS = 5;
const ARROW =
  "pressable inline-grid size-11 shrink-0 place-items-center rounded-[12px] border-2 border-border bg-card text-foreground shadow-hard-1 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";
const ARROW_OFF = "inline-grid size-11 shrink-0 place-items-center rounded-[12px] border-2 border-border bg-card text-foreground opacity-40";

/** 44px prev/next day arrow — a real link (works without JS); 40% and inert at the trip's ends. */
function Arrow({ href, label, dir }: { href: string | null; label: string | null; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const icon = <Icon className="size-5" strokeWidth={2.5} aria-hidden="true" />;
  if (!href) {
    return (
      <span aria-label={dir === "prev" ? "Previous day" : "Next day"} aria-disabled="true" role="link" className={ARROW_OFF}>
        {icon}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label ?? undefined} className={ARROW}>
      {icon}
    </Link>
  );
}

export interface DayHeaderProps {
  tripId: string;
  /** Only for the 1024–1279px switcher pill's fallback (see below). */
  tripName?: string;
  eyebrow: string;
  heading: string;
  subLine: string;
  subLineCompact: string;
  dayTitle: string | null;
  prevHref: string | null;
  nextHref: string | null;
  prevLabel: string | null;
  nextLabel: string | null;
  unreadCount: number;
  recent: RecentActivity[];
  members: TravellerLike[];
  addButton: React.ReactNode;
}

/**
 * The Day view's header (DAY_VIEW §2 "Header row", §3.2): the date is the
 * page's h1, flanked by the prev/next arrows; bell, avatar stack and
 * "+ Add to this day" on the right from lg. Below lg a top bar carries the
 * switcher pill and bell, and the block is centred between the arrows with
 * no right cluster.
 */
export function DayHeader({
  tripId,
  tripName,
  eyebrow,
  heading,
  subLine,
  subLineCompact,
  dayTitle,
  prevHref,
  nextHref,
  prevLabel,
  nextLabel,
  unreadCount,
  recent,
  members,
  addButton,
}: DayHeaderProps) {
  const shown = members.slice(0, MAX_AVATARS);
  const extra = members.length - shown.length;
  return (
    <div className="flex flex-col gap-1">
      {/* The trip layout's header is hidden on this route at every width
          (TripHeaderFrame), so below lg this row is the page's top bar:
          switcher pill + bell (DAY_VIEW §3.1). From lg the bell moves to the
          right cluster, and from xl the sidebar's switcher card takes over. */}
      {tripName ? (
        <div data-slot="day-trip-switcher" className="mb-3 flex items-center gap-3 lg:mb-1 xl:hidden">
          <div className="min-w-0 flex-1 lg:flex-none [&>*]:w-full lg:[&>*]:w-auto">
            <TripSwitcherFromContext tripId={tripId} fallbackName={tripName} variant="pill" />
          </div>
          <div className="lg:hidden">
            <NotificationBell tripId={tripId} unreadCount={unreadCount} recent={recent} />
          </div>
        </div>
      ) : null}
      <header className="flex items-end gap-4">
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3.5 md:justify-start">
          <Arrow href={prevHref} label={prevLabel} dir="prev" />
          <div className="flex min-w-0 flex-col items-center text-center md:items-start md:text-left">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground md:text-[11px]">{eyebrow}</p>
            {dayTitle ? <p className="text-sm font-bold text-muted-foreground">{dayTitle}</p> : null}
            <h1 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] text-foreground md:text-[40px]">{heading}</h1>
            {subLine ? <p className="mt-1 hidden text-[15px] font-semibold text-foreground md:block">{subLine}</p> : null}
            {subLineCompact ? <p className="mt-1 text-[13px] font-semibold text-foreground md:hidden">{subLineCompact}</p> : null}
          </div>
          <Arrow href={nextHref} label={nextLabel} dir="next" />
        </div>
        <div className="hidden shrink-0 items-center gap-2.5 lg:flex">
          <NotificationBell tripId={tripId} unreadCount={unreadCount} recent={recent} />
          {members.length > 0 ? (
            <Link
              href={`/trips/${tripId}/settings#travellers`}
              aria-label={`Trip members (${members.length})`}
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
          {addButton}
        </div>
      </header>
    </div>
  );
}
