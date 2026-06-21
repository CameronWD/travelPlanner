"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * Best-effort purge of the service-worker runtime cache so the next user on a
 * shared device can't read this user's cached private pages while offline.
 * Never blocks sign-out.
 */
async function clearOfflineCache() {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "CLEAR_CACHE" });
  } catch {
    // Ignore — the SW may not be registered; sign-out must still proceed.
  }
}

/**
 * A DropdownMenuItem that signs the current user out and redirects to /signin.
 */
export function SignOutMenuItem() {
  return (
    <DropdownMenuItem
      className="text-destructive focus:text-destructive"
      onSelect={async () => {
        await clearOfflineCache();
        await signOut({ callbackUrl: "/signin" });
      }}
    >
      <LogOut className="size-4" aria-hidden="true" />
      Sign out
    </DropdownMenuItem>
  );
}
