"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { markAllRead } from "@/server/actions/activity";
import { headline } from "@/lib/activity";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Local shape — mirrors what getRecentActivity returns without importing Prisma
// ---------------------------------------------------------------------------

export interface RecentActivity {
  id: string;
  verb: string;
  entityType: string;
  entityLabel: string;
  changes: unknown;
  createdAt: Date;
  actor: {
    name: string | null;
    image: string | null;
  };
}

interface Props {
  tripId: string;
  unreadCount: number;
  recent: RecentActivity[];
}

/** True while a scroll box has content below its visible window. */
function hasMoreBelow(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight > 1;
}

/** First two initials of a name, for the avatar fallback. */
function initials(name: string | null): string {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function NotificationBell({ tripId, unreadCount, recent }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [moreBelow, setMoreBelow] = useState(false);
  // Measured when the list mounts (the menu opening) and on every scroll.
  const measureList = useCallback((el: HTMLUListElement | null) => {
    if (el) setMoreBelow(hasMoreBelow(el));
  }, []);

  const displayCount = unreadCount > 9 ? "9+" : unreadCount > 0 ? String(unreadCount) : null;

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllRead(tripId);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          className="pressable relative grid size-11 place-items-center rounded-md border-2 border-border bg-card text-foreground shadow-hard-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring data-[state=open]:translate-x-0.5 data-[state=open]:translate-y-0.5 data-[state=open]:shadow-pressed"
        >
          <Bell className="size-5" strokeWidth={2.25} aria-hidden="true" />
          {displayCount !== null && (
            <span
              aria-hidden="true"
              className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full border-2 border-border bg-coral px-1 text-[11px] font-extrabold leading-none text-on-accent motion-safe:tp-pop"
            >
              {displayCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[calc(100vw-1rem)] overflow-hidden rounded-xl border-2 border-border bg-background p-0 shadow-hard-4 sm:w-[22rem]"
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-4">
          <p className="font-display text-xl font-extrabold tracking-[-0.03em]">Notifications</p>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={isPending || unreadCount === 0}
            className="grid h-11 place-items-center rounded-full px-3 text-[13px] font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
          >
            Mark all read
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-1 border-t border-border-soft px-4 py-8 text-center">
            <p className="font-display text-base font-extrabold">All quiet</p>
            <p className="text-[13px] font-medium text-muted-foreground">
              Changes your people make show up here.
            </p>
          </div>
        ) : (
          // LA-010: the list is its own 320px scroll box ("See all activity"
          // sits below it, never over it); the fold lands mid-row, so fade the
          // bottom 1.5rem of the window to read as "more below" rather than a
          // date sliced in half. M-3: only while there is more below — a list
          // that fits, or one scrolled to its end, isn't faded at all.
          <ul
            ref={measureList}
            onScroll={(e) => setMoreBelow(hasMoreBelow(e.currentTarget))}
            data-more-below={moreBelow}
            className="max-h-80 overflow-y-auto pb-3 scroll-pb-3 data-[more-below=true]:[mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]"
          >
            {recent.map((item, i) => {
              // The repo passes only unreadCount, not per-item read state, so the
              // first `unreadCount` rows (most recent first) get the unread treatment.
              const unread = i < unreadCount;
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex gap-3 border-t border-border-soft px-4 py-3",
                    unread && "bg-card",
                  )}
                >
                  <Avatar className="size-8 shrink-0">
                    {item.actor.image ? <AvatarImage src={item.actor.image} alt="" /> : null}
                    <AvatarFallback className="text-[11px]">{initials(item.actor.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px]">
                    <span className={cn("text-foreground", unread ? "font-extrabold" : "font-semibold")}>
                      {item.actor.name ?? "Someone"}{" "}
                      <span className="font-semibold">
                        {headline({
                          verb: item.verb as Parameters<typeof headline>[0]["verb"],
                          entityType: item.entityType as Parameters<typeof headline>[0]["entityType"],
                          entityLabel: item.entityLabel,
                        })}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {relativeTime(new Date(item.createdAt))}
                    </span>
                  </div>
                  {unread ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-border bg-coral"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href={`/trips/${tripId}/activity`}
          className="flex h-12 items-center justify-center border-t-2 border-border text-[13px] font-extrabold text-foreground hover:bg-muted"
        >
          See all activity
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
