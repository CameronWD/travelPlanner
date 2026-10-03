/**
 * In-memory fixed-window rate limiter, per process.
 *
 * Deliberately not distributed: a reporting endpoint that leans on this
 * (app/api/client-error/route.ts) needs a cheap, best-effort backstop, not a
 * shared store. Each serverless instance / process keeps its own Map, so the
 * real effective limit across a fleet is `limit * instance count`, not
 * `limit` — see the route's module comment for why that's an accepted
 * trade-off on top of ADR 0059's existing bounds, not an oversight.
 */

type Entry = {
  windowStart: number;
  count: number;
};

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): { allow(key: string): boolean } {
  const { limit, windowMs, now = () => Date.now() } = opts;
  const entries = new Map<string, Entry>();

  return {
    allow(key: string): boolean {
      const current = now();

      // Prune stale entries on every call so the Map cannot grow without
      // bound just from a stream of distinct, one-off keys (IPs).
      for (const [k, entry] of entries) {
        if (current - entry.windowStart >= windowMs) {
          entries.delete(k);
        }
      }

      const entry = entries.get(key);
      if (!entry) {
        entries.set(key, { windowStart: current, count: 1 });
        return true;
      }

      if (entry.count < limit) {
        entry.count += 1;
        return true;
      }

      return false;
    },
  };
}

/**
 * First entry of `x-forwarded-for`, or "unknown" when the header is absent.
 * Trusts the header as-is — there is no reverse proxy config to validate it
 * against here, and for a best-effort per-instance limiter that's fine: a
 * spoofed value only lets a caller dodge their own limit, not anyone else's.
 */
export function clientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (!forwardedFor) return "unknown";
  const [first] = forwardedFor.split(",");
  return first.trim() || "unknown";
}
