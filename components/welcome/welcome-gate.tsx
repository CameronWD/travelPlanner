import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { needsDisplayName } from "@/lib/traveller";
import { WelcomeDialog } from "./welcome-dialog";

/**
 * The first-sign-in Welcome (spec 2026-10-01 §G), decided on the server — the
 * same shape as WhatsNewBanner. Shows while `welcomeSeenAt` is null, but only
 * once the Traveller has a name: a nameless one is being asked by the
 * layout's NameDialog first (spec 2026-10-04 §E), and saving revalidates the
 * layout so this re-runs and the Welcome follows.
 *
 * Returns null for a row that has gone missing, where saying nothing beats
 * failing the Trips page over a greeting.
 */
export async function WelcomeGate() {
  const user = await requireUser();
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { welcomeSeenAt: true, name: true, displayName: true },
  });
  if (!row || row.welcomeSeenAt || needsDisplayName(row)) return null;
  return <WelcomeDialog />;
}
