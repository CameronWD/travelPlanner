import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/admin-notify";
import { reportError } from "@/lib/error-sink";

const NOTICE_KEY = "storage-ceiling";
const QUIET_PERIOD_MS = 24 * 60 * 60 * 1000;

/**
 * Pushes "Teepee storage is at its 8 GB ceiling" to Admin Devices (spec
 * 2026-10-02 §B) when the global quota (lib/storage-quota.ts) is hit, at
 * most once per 24 h — tracked in the OperatorNotice row keyed
 * "storage-ceiling" rather than once per refused upload. Never throws: the
 * whole body is wrapped so a caller can `await` this without risking its
 * own request.
 *
 * `notifyAdmins` runs BEFORE the `lastSentAt` upsert, not after: if the
 * push itself throws (it shouldn't — it has its own never-throws contract —
 * but this function must not assume that), the quiet period must NOT have
 * started, or a lost push gets suppressed for 24 h with nobody ever told.
 * Recording "sent" only once the send has actually resolved is what makes
 * that failure mode impossible rather than merely unlikely.
 */
export async function notifyStorageCeiling(now: Date = new Date()): Promise<void> {
  try {
    const existing = await db.operatorNotice.findUnique({ where: { key: NOTICE_KEY } });
    if (existing && now.getTime() - existing.lastSentAt.getTime() < QUIET_PERIOD_MS) return;

    await notifyAdmins(
      "Teepee storage is at its 8 GB ceiling",
      "Every upload now fails until files are deleted. Cloudflare R2 free tier is 10 GB.",
      "/admin",
    );

    await db.operatorNotice.upsert({
      where: { key: NOTICE_KEY },
      create: { key: NOTICE_KEY, lastSentAt: now },
      update: { lastSentAt: now },
    });
  } catch (err) {
    await reportError(err, {
      route: "lib/storage-ceiling-notice.ts#notifyStorageCeiling",
      source: "server",
    });
  }
}
