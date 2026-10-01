/**
 * The one message for a plan change that failed. When the device is known to
 * be offline the reason is the connection, so say so (ADR 0016, amended
 * 2026-10-01: the banner plus one shared message at the point of failure —
 * still no per-action copy). Otherwise the caller's own wording stands.
 *
 * Read at call time: `navigator.onLine` is whatever it is when the action
 * fails, not when the module loaded.
 */
export const OFFLINE_MESSAGE = "You're offline. Plan changes need a connection.";

export function failureMessage(fallback: string): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return OFFLINE_MESSAGE;
  return fallback;
}
