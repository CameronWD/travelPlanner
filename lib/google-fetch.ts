import "server-only";

export const GOOGLE_TIMEOUT_MS = 5_000;

export type FetchResult = { ok: true; body: unknown } | { ok: false; reason: "http" | "timeout" | "network" | "parse" };

export function serverKey(): string | null {
  return process.env.GOOGLE_MAPS_SERVER_KEY?.trim() || null;
}

export function hasServerKey(): boolean {
  return serverKey() !== null;
}

export async function fetchJson(url: string, init: RequestInit = {}): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return { ok: false, reason: "http" };
    try {
      return { ok: true, body: await res.json() };
    } catch {
      return { ok: false, reason: controller.signal.aborted ? "timeout" : "parse" };
    }
  } catch {
    return { ok: false, reason: controller.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
