import Link from "next/link";
import { tripPath } from "@/lib/trip-path";
import { DAY_TEXT_TRANSITION } from "@/components/trip/day/day-transition";
import { DayArrow } from "@/components/trip/day/day-arrow";
import type { TravellerLike } from "@/lib/traveller";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { NotificationBell, type RecentActivity } from "@/components/trip/notification-bell";
import { ShareTripButton } from "@/components/trip/share-chooser";
import { TripSwitcherFromContext } from "@/components/shell/trip-switcher";
import { ViewTransition } from "@/components/ui/view-transition";

const MAX_AVATARS = 5;

/**
 * The widest label `dayHeading` can produce, rendered invisibly in the same
 * font so the title block's min width (md+) never depends on the day shown —
 * the arrows sit in the same two spots on every day (spec 2026-09-28 D2).
 */
export const WIDEST_HEADING = "Wed 30 Dec 2026";

export interface DayHeaderProps {
  tripId: string;
  /** The Trip's current slug (or id fallback), for building links (ADR 0064). */
  tripSlug: string;
  /** Only for the 1024–1279px switcher pill's fallback (see below). */
  tripName?: string;
  eyebrow: string;
  heading: string;
  subLine: string;
  subLineCompact: string;
  /** The Day title line's content — `DayTitleInline` on the page; a plain string in tests. */
  dayTitle: React.ReactNode;
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
  tripSlug,
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
            <ShareTripButton />
            <NotificationBell tripId={tripId} unreadCount={unreadCount} recent={recent} />
          </div>
        </div>
      ) : null}
      <header data-slot="day-header-row" className="flex items-end gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* lg+: an empty first column balances the right cluster so the date and
            its arrows sit in the true centre (spec 2026-09-29 D2). */}
        <div data-slot="day-header-spacer" aria-hidden="true" className="hidden lg:block" />
        {/* Phone: a 44px | 1fr | 44px grid pins the arrows to the row's edges.
            md+: the arrows sit beside a title block whose min width comes
            from the invisible widest heading below; the block never shrinks
            at md+, and only the ghost and date size it (text lines are w-0 min-w-full).
            Every line in the block has a fixed height, so the optional Day title and
            sub-line can come and go without the arrows moving (spec 2026-09-28 D2). */}
        <div className="grid w-full grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-3.5 md:flex md:w-auto md:min-w-0 md:flex-1 md:justify-start lg:flex-none lg:justify-center">
          <DayArrow href={prevHref} label={prevLabel} dir="prev" />
          <div data-slot="day-title-block" className="flex min-w-0 flex-col items-center text-center md:shrink-0">
            <span data-slot="day-heading-ghost" aria-hidden="true" className="invisible hidden h-0 select-none overflow-hidden whitespace-nowrap font-display text-[40px] font-extrabold tracking-[-0.02em] md:block">
              {WIDEST_HEADING}
            </span>
            <ViewTransition {...DAY_TEXT_TRANSITION}>
              <div data-slot="day-heading-text" className="flex w-full min-w-0 flex-col items-center">
                <p className="h-4 w-0 min-w-full truncate text-[10px] font-extrabold uppercase leading-4 tracking-[0.08em] text-muted-foreground md:text-[11px]">{eyebrow}</p>
                <div data-slot="day-title-line" className="flex h-5 w-0 min-w-full items-center justify-center text-sm font-bold leading-5 text-muted-foreground">{dayTitle}</div>
                <h1 className="font-display md:whitespace-nowrap text-[30px] font-extrabold leading-none tracking-[-0.02em] text-foreground md:text-[40px]">{heading}</h1>
                <p data-slot="day-sub-line" className="mt-1 hidden h-5 w-0 min-w-full truncate text-[15px] font-semibold leading-5 text-foreground md:block">{subLine}</p>
                <p data-slot="day-sub-line" className="mt-1 h-5 w-0 min-w-full truncate text-[13px] font-semibold leading-5 text-foreground md:hidden">{subLineCompact}</p>
              </div>
            </ViewTransition>
          </div>
          <DayArrow href={nextHref} label={nextLabel} dir="next" />
        </div>
        <div className="hidden shrink-0 items-center gap-2.5 lg:flex lg:justify-self-end">
          <ShareTripButton />
          <NotificationBell tripId={tripId} unreadCount={unreadCount} recent={recent} />
          {members.length > 0 ? (
            <Link
              href={tripPath(tripSlug, "/settings#travellers")}
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
