"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * A DropdownMenuItem that signs the current user out and redirects to /signin.
 */
export function SignOutMenuItem() {
  return (
    <DropdownMenuItem
      className="text-destructive focus:text-destructive"
      onSelect={() => signOut({ callbackUrl: "/signin" })}
    >
      <LogOut className="size-4" aria-hidden="true" />
      Sign out
    </DropdownMenuItem>
  );
}
