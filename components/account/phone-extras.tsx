"use client";

import Link from "next/link";
import { SearchField } from "@/components/shell/search-field";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutMenuItem } from "@/components/ui/sign-out-button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { Card, CardTitle } from "@/components/ui/card";

const ROW = "flex min-h-11 items-center justify-between whitespace-nowrap shrink-0 rounded-md px-2 text-sm font-semibold text-foreground hover:bg-muted/50";

/**
 * Phones only: what the removed top bar used to carry on trips-level pages
 * (spec D4) — search, the theme toggle, Help, What's new, Admin and Sign out.
 * SignOutMenuItem is a Radix menu item and only works inside a menu, so Sign
 * out gets its own single-item DropdownMenu here rather than a plain button.
 */
export function PhoneExtras({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card role="region" aria-label="Phone shortcuts" className="p-[18px] md:hidden">
      <CardTitle>Find and settings</CardTitle>
      <div className="mt-3.5 flex flex-col gap-2">
        <SearchField tripId={null} />
        <div className={ROW}>
          <span className="whitespace-nowrap shrink-0">Theme</span>
          <ThemeToggle />
        </div>
        <Link href="/help" className={ROW}>
          How to use Teepee
        </Link>
        <Link href="/whats-new" className={ROW}>
          What&apos;s new
        </Link>
        {isAdmin ? (
          <Link href="/admin" className={ROW}>
            Admin
          </Link>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger className={ROW + " w-full text-left"}>Sign out</DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
