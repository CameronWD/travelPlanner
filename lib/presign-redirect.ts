/**
 * Cache-Control on a 302 to a presigned storage URL (spec 2026-10-06 §H).
 * The presign lasts 300s; letting the browser reuse the redirect for 240s
 * means a reused redirect always has at least 60s left, and repeat views
 * skip the round trip to the function. Private: the URL is per-member.
 *
 * Accepted trade-off (spec 2026-10-06 §H): while the cached redirect lives,
 * the browser follows it without asking the server, so a member removed from
 * the Trip — or another account signed in on the same browser — can reuse it
 * for up to 4 minutes, still within the presign's own 300s. Access is
 * re-checked on the first request after that.
 */
export const PRESIGNED_REDIRECT_CACHE_CONTROL = "private, max-age=240";
