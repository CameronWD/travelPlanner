import "server-only";
import { db } from "@/lib/db";
import { formatISODate } from "@/lib/dates";

export async function takeGoogleQuota(sku: string, limit: number): Promise<boolean> {
  const day = formatISODate(new Date());
  try {
    const row = await db.googleUsage.upsert({
      where: { day_sku: { day, sku } },
      create: { day, sku, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return row.count <= limit;
  } catch {
    return false;
  }
}
