import "server-only";
import { db } from "@/lib/db";
import { RETENTION_DAYS } from "./lists";

// receivedAt is the server's clock; occurredAt comes from the device, and a wrong clock there would delete fresh records.
export async function purgeOldUsage(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const { count } = await db.usageRecord.deleteMany({ where: { receivedAt: { lt: cutoff } } });
  return count;
}
