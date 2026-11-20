import "server-only";
import { db } from "@/lib/db";

const CACHE_MS = 30_000;

let cached: { recording: boolean; at: number } | null = null;

export async function readUsageRecording(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.recording;
  const row = await db.usageSwitch.findUnique({ where: { id: "usage" }, select: { recording: true } });
  const recording = row?.recording ?? true;
  cached = { recording, at: Date.now() };
  return recording;
}

export function primeUsageRecording(on: boolean): void {
  cached = { recording: on, at: Date.now() };
}
