import type { Metadata } from "next";
import { signInRedirect } from "@/lib/sign-in-redirect";
import { cookies } from "next/headers";
import { AppLink } from "@/components/navigation/app-link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { reconcilePendingInvites } from "@/lib/reconcile-invites";
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
import { AppShellRail } from "@/components/shell/app-shell-rail";
import { RailTripProvider } from "@/components/shell/rail-trip";
import { LAST_TRIP_COOKIE, pickLastTrip } from "@/lib/last-trip";
import { OfflineBanner } from "@/components/offline-banner";
import { CommandPaletteMount } from "@/components/command-palette-mount";
import { CommandPaletteTrigger } from "@/components/command-palette-trigger";
import { FeedbackLauncher } from "@/components/feedback/feedback-launcher";
import { DeviceSync } from "@/components/account/device-sync";
import { OnTripPath, OutsideTrip } from "@/components/app-rail";
import { AppTabBar } from "@/components/shell/app-tab-bar";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import { SectionTransition } from "@/components/navigation/section-transition";

export async function generateMetadata(): Promise<Metadata> { return {}; }

/**
 * App shell for all authenticated routes under (app).
 *
 * Keeps the server-side auth gate from the stub layout and adds:
 *   - Phones (<768px): inside a Trip, the sticky top bar (wordmark, search,
 *     Globe, theme toggle, traveller avatar menu) — unchanged. Outside a Trip
 *     (trips-level pages: /trips, /globe, /account, /help, /whats-new,
 *     /admin — spec D4), there is no top bar; a Trips / Globe / You tab bar
 *     (AppTabBar) sits at the bottom instead, and Search, the theme toggle,
 *     Help, What's new, Admin and Sign out move onto the account page
 *     (components/account/phone-extras.tsx). There is NO top bar from md up.
 *   - 768–1279px: the Dock, carrying search and the avatar menu itself;
 *     ≥1280px: the full Sidebar. Both are AppShellRail — one rail for every
 *     signed-in page, mounted here and never unmounted; inside a Trip its
 *     rows come from the URL and its switcher from the trip layout
 *     (RailTripPublisher). ADR 0062, amended 2026-09-29.
 *   - A centered, padded content area
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) return signInRedirect();

  // Read from the DB, not session.user's name/image, so a Display name or
  // Profile photo change (CONTEXT.md "Profile photo and display name") shows
  // immediately — the session's own copy only refreshes on next sign-in.
  const traveller = await db.user.findUnique({
    where: { id: session.user.id },
    select: { ...TRAVELLER_SELECT, email: true },
  });
  if (!traveller) return signInRedirect();

  const { email } = traveller;

  if (email) await reconcilePendingInvites(session.user.id, email);

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
          slug: true,
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
      slug: t.slug ?? t.id,
      statusLine: tripStatusLine({
        startDate: t.startDate,
        endDate: t.endDate,
        today: todayByTripId.get(t.id) ?? today,
      }),
    }));

  // Spec P1: the most recently opened trip, if the viewer still belongs to
  // it, else the first trip in trips-list order — read server-side so the
  // sidebar's "Back to" card is correct on first paint (no client flash).
  const lastTrip = pickLastTrip(trips, (await cookies()).get(LAST_TRIP_COOKIE)?.value);

  const shellUser: ShellUser = { user: traveller, isAdmin, pendingAccessRequests, trips, lastTrip };

  return (
    <ShellUserProvider value={shellUser}>
    <RailTripProvider>
    <NavigationPendingProvider>
    <div className="flex min-h-full flex-col">
      <NavigationProgress />
      <OfflineBanner />
      <CommandPaletteMount />
      <DeviceSync />
      <FeedbackLauncher />
      {/* ── Top bar (phones, inside a Trip only — spec D4: outside a Trip
          the AppTabBar below replaces it; from md up the Dock / Sidebar is
          the only chrome) ── */}
      <OnTripPath>
      <header className="tp-vt-top-bar sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          {/* Wordmark */}
          <AppLink
            href="/trips"
            className="flex items-center gap-1.5"
            aria-label="Teepee — go to your trips"
          >
            <Logo variant="lockup" />
          </AppLink>

          {/*
            Right-hand controls. The whole header is phones-only now; the
            Globe link keeps its own md:hidden from when it wasn't — below md
            there is no rail and the phone tab bar has no Globe.
          */}
          <div className="flex items-center gap-1 sm:gap-2">
            <CommandPaletteTrigger />
            <AppLink
              href="/globe"
              className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground md:hidden"
            >
              Globe
            </AppLink>
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
      </OnTripPath>

      {/* ── Content area ── */}
      {/* md–xl: the Dock sits left of <main>, xl+: the Sidebar — both from
          AppShellRail, on every signed-in page, trip or not, so crossing the
          trip boundary never remounts them (ADR 0062, amended 2026-09-29).
          ADR 0062: non-trip pages cap at the shared wide width, centred right of
          the rail; a trip page (which renders [data-trip-shell]) goes full-bleed
          so its content can sit flush against the rail. */}
      <div className="flex flex-1 flex-col md:flex-row">
        <AppShellRail />
        <main
          data-testid="app-main"
          className="mx-auto w-full min-w-0 max-w-page-wide flex-1 px-4 pt-8 pb-[calc(2rem+var(--tp-tab-bar-h)+env(safe-area-inset-bottom))] sm:px-6 md:pb-8 has-[[data-trip-shell]]:max-w-none has-[[data-trip-shell]]:p-0 has-[[data-trips-shell]]:p-0"
        >
          <SectionTransition>{children}</SectionTransition>
        </main>
        <OutsideTrip>
          <AppTabBar />
        </OutsideTrip>
      </div>
    </div>
    </NavigationPendingProvider>
    </RailTripProvider>
    </ShellUserProvider>
  );
}
