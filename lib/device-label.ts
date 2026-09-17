/**
 * lib/device-label.ts — a coarse, fixed name for a **Device** (CONTEXT.md).
 *
 * Captured ONCE, when a Device is first enabled, purely so a Traveller can tell
 * their phone from their laptop in the Account device list. It is never
 * re-derived and never used for a decision — a user agent is a string a browser
 * chose to send, and the moment anything depends on it we have a bug waiting.
 *
 * The allow-list is closed on purpose: this value is stored forever and
 * rendered directly, so an unrecognised agent gets `null` ("A device") rather
 * than a fragment of somebody's UA string.
 */
export type DeviceLabel =
  | "iPhone"
  | "iPad"
  | "Mac"
  | "Android"
  | "Windows"
  | "Linux";

export function deviceLabelFromUserAgent(
  ua: string | null | undefined,
): DeviceLabel | null {
  if (!ua) return null;

  // Order matters. Android's UA contains "Linux", and an iPad masquerading as
  // a Mac contains "Mac OS X" — so the most specific claim is tested first.
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux|X11/.test(ua)) return "Linux";

  return null;
}
