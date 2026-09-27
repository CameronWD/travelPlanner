"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SignOutMenuItem } from "@/components/ui/sign-out-button";
import { useTheme } from "@/components/ui/theme-provider";
import { travellerName } from "@/lib/traveller";
import type { ShellUser } from "@/components/shell/shell-user";

/** Theme flip as a menu row — the Dock has no room for its own toggle. */
function ThemeMenuItem() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        // Keep the menu open so the flip is visible where it was asked for.
        e.preventDefault();
        toggleTheme();
      }}
    >
      {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
      {isDark ? "Switch to light theme" : "Switch to dark theme"}
    </DropdownMenuItem>
  );
}

export interface AccountMenuContentProps extends Pick<ShellUser, "user" | "isAdmin" | "pendingAccessRequests"> {
  /** An "Account" row — off where an Account link already sits beside the avatar (the sidebar footer). */
  showAccount?: boolean;
  /** A theme row — on where no ThemeToggle sits beside the avatar (the Dock). */
  showTheme?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * The Traveller's avatar menu: one list for every place an avatar opens it
 * (the phone header, the Dock at 768–1279px, the sidebar footer at ≥1280px),
 * so Help, What's new, Admin (with its pending Access request badge — often
 * the operator's only signal a request is waiting, ADR 0048) and Sign out
 * can never drift apart between them.
 */
export function AccountMenuContent({
  user,
  isAdmin,
  pendingAccessRequests,
  showAccount = true,
  showTheme = false,
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
            {pendingAccessRequests > 0 && (
              <Badge
                variant="destructive"
                aria-label={`${pendingAccessRequests} pending access ${pendingAccessRequests === 1 ? "request" : "requests"}`}
              >
                {pendingAccessRequests > 9 ? "9+" : pendingAccessRequests}
              </Badge>
            )}
          </Link>
        </DropdownMenuItem>
      )}

      {showTheme && <ThemeMenuItem />}

      <DropdownMenuSeparator />

      <SignOutMenuItem />
    </DropdownMenuContent>
  );
}
