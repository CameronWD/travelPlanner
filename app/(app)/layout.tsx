import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { acceptPendingInvitesForUser } from "@/lib/invites";
import { acceptPendingGlobeInvitesForUser } from "@/lib/globe-invites";
import { isAdminEmail } from "@/lib/admin";
import { listAccessRequests } from "@/server/actions/access-requests";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutMenuItem } from "@/components/ui/sign-out-button";
import { OfflineBanner } from "@/components/offline-banner";
import { CommandPaletteMount } from "@/components/command-palette-mount";
import { CommandPaletteTrigger } from "@/components/command-palette-trigger";
import { FeedbackLauncher } from "@/components/feedback/feedback-launcher";
import { DeviceSync } from "@/components/account/device-sync";
import { AppRail } from "@/components/app-rail";

export async function generateMetadata(): Promise<Metadata> { return {}; }

/**
 * Derive initials from a display name (up to 2 chars).
 */
function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/**
 * App shell for all authenticated routes under (app).
 *
 * Keeps the server-side auth gate from the stub layout and adds:
 *   - A sticky top bar with the wordmark + theme toggle + traveller avatar dropdown
 *   - The md+ rail (AppRail) outside a Trip
 *   - A centered, padded content area
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const { name, email, image } = session.user;

  // An Invite becomes membership when the matching person is signed in. The
  // Auth.js signIn event only fires on a fresh login, so an already-logged-in
  // partner would never join — reconcile on every app-load too. Idempotent and
  // best-effort (see ADR 0017).
  if (email) {
    await acceptPendingInvitesForUser(session.user.id, email);
    await acceptPendingGlobeInvitesForUser(session.user.id, email);
  }

  const isAdmin = isAdminEmail(email);
  // The badge is load-bearing, not decorative: notifyAdmins' push only
  // reaches the operator if they have a Device registered (ADR 0048), so
  // this count is often the ONLY way an Admin learns an Access request is
  // waiting. Failure here must never hide the /admin link itself — only the
  // count on it — so a DB hiccup degrades to "no badge", not "no route".
  let pendingAccessRequests = 0;
  if (isAdmin) {
    try {
      pendingAccessRequests = (await listAccessRequests()).length;
    } catch (err) {
      console.error("[AppLayout] failed to load the pending Access request count:", err);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <OfflineBanner />
      <CommandPaletteMount />
      <DeviceSync />
      <FeedbackLauncher />
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          {/* Wordmark */}
          <Link
            href="/trips"
            className="flex items-center gap-1.5"
            aria-label="Teepee — go to your trips"
          >
            <Logo variant="lockup" />
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <CommandPaletteTrigger />
            <ThemeToggle />

            {/* Traveller avatar dropdown. A real 44px box around the 36px
                avatar — tap-target's ::before poked 4px past a 360px screen. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Open traveller menu"
              >
                <Avatar className="size-9">
                  {image ? (
                    <AvatarImage src={image} alt={name ?? "Traveller"} />
                  ) : null}
                  <AvatarFallback>{initials(name)}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="min-w-0 sm:min-w-52">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {name ?? "Traveller"}
                  </span>
                  {email ? (
                    <span className="text-xs text-muted-foreground">
                      {email}
                    </span>
                  ) : null}
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                  <Link href="/help">How to use Teepee</Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/whats-new">What&apos;s new</Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/account">Account</Link>
                </DropdownMenuItem>

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

                <DropdownMenuSeparator />

                <SignOutMenuItem />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Content area ── */}
      {/* md+: the rail sits left of <main> on every non-trip page (AppRail renders
          nothing inside a Trip, whose layout mounts TripNav's rail instead).
          ADR 0062: non-trip pages cap at the shared wide width, centred right of
          the rail; a trip page (which renders [data-trip-shell]) goes full-bleed
          so its rail sits on the viewport's left edge. */}
      <div className="flex flex-1 flex-col md:flex-row">
        <AppRail />
        <main
          data-testid="app-main"
          className="mx-auto w-full min-w-0 max-w-page-wide flex-1 px-4 py-8 sm:px-6 has-[[data-trip-shell]]:max-w-none has-[[data-trip-shell]]:p-0"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
