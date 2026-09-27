"use client";

import { Search } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { AccountMenuContent } from "@/components/shell/account-menu";
import { useShellUser } from "@/components/shell/shell-user";

/**
 * The Dock's search (768–1279px): there is no room for a field, so an icon
 * button opens the existing full-screen command palette — the same
 * `teepee:open-palette` event CommandPaletteTrigger dispatches.
 */
export function DockSearchButton() {
  return (
    <button
      type="button"
      aria-label="Search"
      onClick={() => window.dispatchEvent(new Event("teepee:open-palette"))}
      className="mb-1.5 grid size-11 place-items-center rounded-md border-2 border-border bg-card text-foreground hover:shadow-hard-1"
    >
      <Search className="size-5" aria-hidden="true" />
    </button>
  );
}

/**
 * The Traveller's avatar at the foot of the Dock, opening the account menu
 * (controller ruling R1). There is no top bar from 768px up, so at Dock
 * widths this is the only way to Help, What's new, Admin, the theme and
 * Sign out. Renders nothing outside ShellUserProvider.
 */
export function DockAccountMenu() {
  const shell = useShellUser();
  if (!shell) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Open traveller menu"
      >
        <TravellerAvatar traveller={shell.user} size={36} />
      </DropdownMenuTrigger>
      <AccountMenuContent {...shell} showTheme side="right" align="end" />
    </DropdownMenu>
  );
}
