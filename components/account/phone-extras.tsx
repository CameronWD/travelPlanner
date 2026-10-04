"use client";

import Link from "next/link";
import { SearchField } from "@/components/shell/search-field";
import { SignOutButton } from "@/components/ui/sign-out-button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const ROW = "flex min-h-11 items-center justify-between whitespace-nowrap shrink-0 rounded-md px-2 text-sm font-semibold text-foreground hover:bg-muted/50";

/**
 * Phones only: what the removed top bar used to carry on trips-level pages
 * (spec D4) — search, Help, What's new, Admin and Sign out (the theme toggle
 * is parked with dark mode, spec 2026-10-04 §F). Sign out is a plain button
 * (not the avatar menu's SignOutMenuItem, which only works inside a Radix
 * menu — a one-item menu here would also need its own collision padding
 * against the fixed tab bar for no benefit).
 */
export function PhoneExtras({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card role="region" aria-label="Phone shortcuts" className="p-[18px] md:hidden">
      <CardTitle>Find and settings</CardTitle>
      <div className="mt-3.5 flex flex-col gap-2">
        <SearchField tripId={null} />
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
        <SignOutButton className={cn(ROW, "w-full text-left")} />
      </div>
    </Card>
  );
}
