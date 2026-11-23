import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/admin-notify";
import { reportError } from "@/lib/error-sink";

const NOTICE_KEY = "booking-import-key";
const QUIET_PERIOD_MS = 24 * 60 * 60 * 1000;

// notifyAdmins runs before the upsert so a failed push never starts the quiet period.
export async function notifyBookingImportKeyRejected(now: Date = new Date()): Promise<void> {
  try {
    const existing = await db.operatorNotice.findUnique({ where: { key: NOTICE_KEY } });
    if (existing && now.getTime() - existing.lastSentAt.getTime() < QUIET_PERIOD_MS) return;

    await notifyAdmins(
      "Booking import is failing",
      "Anthropic rejected the API key. Replace ANTHROPIC_API_KEY in Vercel and redeploy.",
      "/admin",
    );

    await db.operatorNotice.upsert({
      where: { key: NOTICE_KEY },
      create: { key: NOTICE_KEY, lastSentAt: now },
      update: { lastSentAt: now },
    });
  } catch (err) {
    await reportError(err, {
      route: "lib/booking-import/key-notice.ts#notifyBookingImportKeyRejected",
      source: "server",
    });
  }
}
