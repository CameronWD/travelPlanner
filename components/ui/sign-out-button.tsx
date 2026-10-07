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
 * The sign-out sequence itself, shared by every control that offers it
 * (the avatar menu's SignOutMenuItem, PhoneExtras' plain SignOutButton):
 * purge the offline cache best-effort, then sign out and land on the Landing.
 */
async function signOutNow(): Promise<void> {
  await clearOfflineCache();
  await signOut({ callbackUrl: "/" });
}

/**
 * A DropdownMenuItem that signs the current user out and redirects to the
 * Landing. Only works inside a Radix DropdownMenu — see SignOutButton for
 * anywhere else.
 */
export function SignOutMenuItem() {
  return (
    <DropdownMenuItem
      className="text-destructive focus:text-destructive"
      onSelect={async () => {
        await signOutNow();
      }}
    >
      <LogOut className="size-4" aria-hidden="true" />
      Sign out
    </DropdownMenuItem>
  );
}

/**
 * A plain sign-out button for anywhere a Radix menu doesn't make sense (e.g.
 * PhoneExtras' account-page rows, spec D4) — same sequence as SignOutMenuItem.
 */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await signOutNow();
      }}
    >
      Sign out
    </button>
  );
}
