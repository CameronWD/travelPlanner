"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { adminQueueLabel, adminQueueTotal } from "@/lib/admin-queue";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SignOutMenuItem } from "@/components/ui/sign-out-button";
import { travellerName } from "@/lib/traveller";
import type { ShellUser } from "@/components/shell/shell-user";

export interface AccountMenuContentProps extends Pick<ShellUser, "user" | "isAdmin" | "adminQueue"> {
  /** An "Account" row — off where an Account link already sits beside the avatar (the sidebar footer). */
  showAccount?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * The Traveller's avatar menu: one list for every place an avatar opens it
 * (the phone header, the Dock at 768–1279px, the sidebar footer at ≥1280px),
 * so Help, What's new, Admin (with its Admin queue badge — CONTEXT.md; with
 * the avatar dot, often the operator's only signal something is waiting) and
 * Sign out can never drift apart between them.
 */
export function AccountMenuContent({
  user,
  isAdmin,
  adminQueue,
  showAccount = true,
  align = "end",
  side,
}: AccountMenuContentProps) {
  return (
    <DropdownMenuContent align={align} side={side} className="min-w-0 sm:min-w-52">
      <DropdownMenuLabel className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{travellerName(user)}</span>
        {user.email ? <span className="text-xs text-muted-foreground">{user.email}</span> : null}
      </DropdownMenuLabel>

      <DropdownMenuSeparator />

      <DropdownMenuItem asChild>
        <Link href="/help">How to use Teepee</Link>
      </DropdownMenuItem>

      <DropdownMenuItem asChild>
        <Link href="/whats-new">What&apos;s new</Link>
      </DropdownMenuItem>

      {showAccount && (
        <DropdownMenuItem asChild>
          <Link href="/account">Account</Link>
        </DropdownMenuItem>
      )}

      {isAdmin && (
        <DropdownMenuItem asChild>
          <Link href="/admin" className="flex items-center justify-between gap-2">
            <span>Admin</span>
            {adminQueueTotal(adminQueue) > 0 && (
              <Badge variant="destructive" aria-label={adminQueueLabel(adminQueue)}>
                {adminQueueTotal(adminQueue) > 9 ? "9+" : adminQueueTotal(adminQueue)}
              </Badge>
            )}
          </Link>
        </DropdownMenuItem>
      )}

      <DropdownMenuSeparator />

      <SignOutMenuItem />
    </DropdownMenuContent>
  );
}
