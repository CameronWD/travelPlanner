import type { NextConfig } from "next";

/**
 * Baseline security headers applied to every response. We intentionally do NOT
 * set a strict Content-Security-Policy here: the theme provider injects a small
 * inline no-flash script, and a CSP without per-request nonces would break it.
 * These headers are the high-value, low-risk subset for a PWA serving private
 * data. HSTS is left to the hosting platform (e.g. Vercel) so local http dev
 * isn't affected.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
