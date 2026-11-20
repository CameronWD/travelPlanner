"use client";

import { createRoot } from "react-dom/client";
import { authClient } from "@/lib/auth/client";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { forgetOfflineSaves } from "@/lib/offline-status";
import { forgetUsage } from "@/lib/usage/client";

async function clearOfflineCache() {
  forgetOfflineSaves();
  forgetUsage();
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  try {
    // Not `ready`: it never settles when no worker is registered.
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage({ type: "CLEAR_CACHE" });
  } catch {
    // The SW may not be registered; sign-out must still finish.
  }
}

// Rendered in its own root: the avatar menu unmounts its content when it closes,
// which would take a dialog rendered inside it down too.
function confirmOfflineSignOut(): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const finish = (answer: boolean) => {
      resolve(answer);
      queueMicrotask(() => {
        root.unmount();
        host.remove();
      });
    };
    root.render(
      <ConfirmDialog
        open
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
        onConfirm={() => finish(true)}
        title="Sign out while offline?"
        description="You’re offline. Signing out removes the saved copy of your trips from this phone."
        confirmLabel="Sign out"
        destructive
      />,
    );
  });
}

async function signOutNow(): Promise<void> {
  if (navigator.onLine) {
    try {
      const result = await authClient.signOut();
      if (!result?.error) {
        await clearOfflineCache();
        window.location.assign("/");
        return;
      }
    } catch {
      // A phone with one bar reports onLine but cannot reach the server.
    }
  }
  if (!(await confirmOfflineSignOut())) return;
  await clearOfflineCache();
  await authClient.signOut().catch(() => {});
  window.location.assign("/");
}

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
