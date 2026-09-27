import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { acceptPendingInvitesForUser } from "@/lib/invites";
import { acceptPendingGlobeInvitesForUser } from "@/lib/globe-invites";
import { isAdminEmail } from "@/lib/admin";
import { listAccessRequests } from "@/server/actions/access-requests";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { REAL_PLAN } from "@/lib/plan-scope";
import { compareForTripList } from "@/lib/trip-phase";
import { todayISO } from "@/lib/dates";
import { tripTodayISO } from "@/lib/trip-today";
import { tripStatusLine } from "@/lib/trip-status-line";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AccountMenuContent } from "@/components/shell/account-menu";
import { ShellUserProvider, type ShellUser, type SwitcherTrip } from "@/components/shell/shell-user";
import { Sidebar, SidebarTripPlaceholder } from "@/components/shell/sidebar";
import { OfflineBanner } from "@/components/offline-banner";
import { CommandPaletteMount } from "@/components/command-palette-mount";
import { CommandPaletteTrigger } from "@/components/command-palette-trigger";
import { FeedbackLauncher } from "@/components/feedback/feedback-launcher";
import { DeviceSync } from "@/components/account/device-sync";
import { AppRail, OutsideTrip } from "@/components/app-rail";

export async function generateMetadata(): Promise<Metadata> { return {}; }

/**
 * App shell for all authenticated routes under (app).
 *
 * Keeps the server-side auth gate from the stub layout and adds:
 *   - Phones (<768px): a sticky top bar with the wordmark, search, Globe,
 *     theme toggle and traveller avatar menu. There is NO top bar from md up.
 *   - 768–1279px: the Dock (AppRail outside a Trip; TripNav inside one),
 *     carrying search and the avatar menu itself.
 *   - ≥1280px: the full Sidebar (outside a Trip here; the trip layout mounts
 *     its own, which knows the Trip).
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

  // Read from the DB, not session.user's name/image, so a Display name or
  // Profile photo change (CONTEXT.md "Profile photo and display name") shows
  // immediately — the session's own copy only refreshes on next sign-in.
  const traveller = await db.user.findUnique({
    where: { id: session.user.id },
    select: { ...TRAVELLER_SELECT, email: true },
  });
  if (!traveller) {
    redirect("/signin");
  }

  const { email } = traveller;

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

  // Trip switcher (sidebar ≥1280px; a compact pill in the trip header at
  // 768–1279px, docs/specs/2026-09-27-desktop-home.md §1 / beta-feedback §A):
  // every trip the Traveller is a member of, ordered like the trips list
  // itself (lib/trip-phase.ts compareForTripList — soonest/active first).
  // Loaded once here, not per trip, so switching trips never re-queries it.
  const memberships = await db.tripMember.findMany({
    where: { userId: session.user.id },
    include: {
      trip: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          stops: {
            where: { ...REAL_PLAN, arriveDate: { not: null } },
            orderBy: { sortOrder: "asc" },
            select: { id: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
          },
        },
      },
    },
    orderBy: { trip: { createdAt: "desc" } },
  });
  const memberTrips = memberships.map((m) => m.trip);
  const today = todayISO();
  // Canonical plan order for the "current timezone" pick — same approach as
  // the trips list (app/(app)/trips/page.tsx), so the two orderings agree.
  const todayByTripId = new Map(
    memberTrips.map((t) => [t.id, tripTodayISO(t.stops)]),
  );
  const trips: SwitcherTrip[] = [...memberTrips]
    .sort((a, b) => compareForTripList(a, b, today, todayByTripId))
    .map((t) => ({
      id: t.id,
      name: t.name,
      statusLine: tripStatusLine({
        startDate: t.startDate,
        endDate: t.endDate,
        today: todayByTripId.get(t.id) ?? today,
      }),
    }));

  const shellUser: ShellUser = { user: traveller, isAdmin, pendingAccessRequests, trips };

  return (
    <ShellUserProvider value={shellUser}>
    <div className="flex min-h-full flex-col">
      <OfflineBanner />
      <CommandPaletteMount />
      <DeviceSync />
      <FeedbackLauncher />
      {/* ── Top bar (phones only: from md up the Dock / Sidebar is the only chrome) ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          {/* Wordmark */}
          <Link
            href="/trips"
            className="flex items-center gap-1.5"
            aria-label="Teepee — go to your trips"
          >
            <Logo variant="lockup" />
          </Link>

          {/*
            Right-hand controls. The whole header is phones-only now; the
            Globe link keeps its own md:hidden from when it wasn't — below md
            there is no rail and the phone tab bar has no Globe.
          */}
          <div className="flex items-center gap-1 sm:gap-2">
            <CommandPaletteTrigger />
            <Link
              href="/globe"
              className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground md:hidden"
            >
              Globe
            </Link>
            <ThemeToggle />

            {/* Traveller avatar dropdown. A real 44px box around the 36px
                avatar — tap-target's ::before poked 4px past a 360px screen. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Open traveller menu"
              >
                <TravellerAvatar traveller={traveller} size={36} />
              </DropdownMenuTrigger>

              <AccountMenuContent {...shellUser} />
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Content area ── */}
      {/* md–xl: the Dock sits left of <main> on every non-trip page, xl+: the
          Sidebar (AppRail and OutsideTrip render nothing inside a Trip, whose
          layout mounts TripNav's Dock and its own Sidebar instead).
          ADR 0062: non-trip pages cap at the shared wide width, centred right of
          the rail; a trip page (which renders [data-trip-shell]) goes full-bleed
          so its rail sits on the viewport's left edge. A boundary above the trip
          layout that supplies its own rail ([data-rail-shell], see
          TripBoundaryRailShell) goes full-bleed the same way. */}
      <div className="flex flex-1 flex-col md:flex-row">
        <AppRail />
        <OutsideTrip>
          <Sidebar {...shellUser} trip={null} switcher={<SidebarTripPlaceholder trip={null} />} />
        </OutsideTrip>
        <main
          data-testid="app-main"
          className="mx-auto w-full min-w-0 max-w-page-wide flex-1 px-4 py-8 sm:px-6 has-[[data-trip-shell]]:max-w-none has-[[data-trip-shell]]:p-0 has-[[data-rail-shell]]:max-w-none has-[[data-rail-shell]]:p-0"
        >
          {children}
        </main>
      </div>
    </div>
    </ShellUserProvider>
  );
}
