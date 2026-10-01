"use client";

import Link from "next/link";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { SM_HIT } from "@/components/ui/touch-target";
import { AdminQueueDot } from "@/components/shell/admin-queue-dot";
import { AccountMenuContent } from "@/components/shell/account-menu";
import type { ShellUser } from "@/components/shell/shell-user";
import { hasAdminQueue, withAdminQueueName } from "@/lib/admin-queue";
import { travellerName } from "@/lib/traveller";
import { cn } from "@/lib/cn";

/**
 * The sidebar's foot (≥1280px): avatar (opens the account menu — Help,
 * What's new, Admin + badge, Sign out), display name over an "Account" link,
 * and the theme toggle. Account and the theme have their own controls here,
 * so the menu leaves them out.
 */
export function SidebarFooter({
  user,
  isAdmin,
  adminQueue,
}: Pick<ShellUser, "user" | "isAdmin" | "adminQueue">) {
  return (
    <div className="mt-auto flex items-center gap-2 border-t-2 border-border px-1.5 pt-3.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="relative grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={withAdminQueueName("Open traveller menu", isAdmin, adminQueue)}
        >
          <TravellerAvatar traveller={user} size={36} />
          {hasAdminQueue(isAdmin, adminQueue) && <AdminQueueDot />}
        </DropdownMenuTrigger>
        <AccountMenuContent
          user={user}
          isAdmin={isAdmin}
          adminQueue={adminQueue}
          showAccount={false}
          side="top"
          align="start"
        />
      </DropdownMenu>
      {/* The whole name-over-"Account" block is the link, so it clears the 44px floor. */}
      <Link href="/account" className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-md">
        <span className="truncate text-sm font-bold text-foreground">{travellerName(user)}</span>
        <span className="text-xs text-on-accent-muted underline-offset-2 group-hover:underline">Account</span>
      </Link>
      <ThemeToggle
        className={cn("size-9 shrink-0 rounded-[10px] border-2 border-border bg-card text-foreground", SM_HIT)}
      />
    </div>
  );
}
