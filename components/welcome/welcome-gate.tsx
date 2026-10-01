import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { WelcomeDialog } from "./welcome-dialog";

/**
 * Decides, on the server, whether this Traveller still owes a first-sign-in
 * Welcome (spec 2026-10-01 §G) — the same shape as WhatsNewBanner. Returns
 * null once `welcomeSeenAt` is set, and for a row that has gone missing,
 * where saying nothing beats failing the Trips page over a greeting.
 */
export async function WelcomeGate() {
  const user = await requireUser();
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { welcomeSeenAt: true },
  });
  if (!row || row.welcomeSeenAt) return null;
  return <WelcomeDialog />;
}
