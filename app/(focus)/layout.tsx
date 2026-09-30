import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { acceptPendingInvitesForUser } from "@/lib/invites";
import { acceptPendingGlobeInvitesForUser } from "@/lib/globe-invites";

/**
 * Focus shell (spec C6, NEW_TRIP.md §1): signed-in pages with no rail, tab
 * bar or top bar. Shares the root layout with (app), so crossing between
 * them is a client navigation. Theme, motion and toasts come from the root.
 */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const traveller = await db.user.findUnique({ where: { id: session.user.id }, select: { email: true } });
  if (!traveller) redirect("/");

  // Same reconcile as the app shell (ADR 0017): a Traveller who lands here
  // first must already be on the trips they were invited to, or the flow
  // would greet them as on their first trip.
  if (traveller.email) {
    await acceptPendingInvitesForUser(session.user.id, traveller.email);
    await acceptPendingGlobeInvitesForUser(session.user.id, traveller.email);
  }

  return (
    <div data-focus-shell className="min-h-dvh bg-background">
      {children}
    </div>
  );
}
