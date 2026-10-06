/**
 * Cache-Control on a 302 to a presigned storage URL (spec 2026-10-06 §H).
 * The presign lasts 300s; letting the browser reuse the redirect for 240s
 * means a reused redirect always has at least 60s left, and repeat views
 * skip the round trip to the function. Private: the URL is per-member.
 */
export const PRESIGNED_REDIRECT_CACHE_CONTROL = "private, max-age=240";
