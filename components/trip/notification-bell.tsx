"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAllRead } from "@/server/actions/activity";
import { headline } from "@/lib/activity";
import { relativeTime } from "@/lib/relative-time";

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

export function NotificationBell({ tripId, unreadCount, recent }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
          className="relative flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="size-4" aria-hidden="true" />
          {displayCount !== null && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 flex min-w-[1rem] items-center justify-center rounded-full bg-primary px-0.5 text-[11px] font-semibold leading-4 text-primary-foreground"
            >
              {displayCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[calc(100vw-1rem)] sm:w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="px-0 py-0 text-sm font-semibold text-foreground">
            Notifications
          </DropdownMenuLabel>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={isPending || unreadCount === 0}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>

        <DropdownMenuSeparator />

        {recent.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            No activity yet.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {recent.map((item) => (
              <li key={item.id} className="flex flex-col gap-0.5 px-2 py-2 text-sm">
                <span className="font-medium text-foreground">
                  {item.actor.name ?? "Someone"}
                </span>
                <span className="text-muted-foreground">
                  {headline({
                    verb: item.verb as Parameters<typeof headline>[0]["verb"],
                    entityType: item.entityType as Parameters<typeof headline>[0]["entityType"],
                    entityLabel: item.entityLabel,
                  })}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  {relativeTime(new Date(item.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5">
          <Link
            href={`/trips/${tripId}/activity`}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            See all activity
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
