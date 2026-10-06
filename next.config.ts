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
  // Spec 2026-10-06 §I: whole-app React Compiler (babel-plugin-react-compiler).
  // A component the compiler breaks opts out with "use no memo".
  reactCompiler: true,
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
    // ADR 0063: a dynamic page seen in the last 30s is served from the client
    // router cache, so stepping back is instant. Every mutation revalidates or
    // refreshes, so the Traveller's own edits are never stale.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The Sign in page was folded into the Landing (spec 2026-09-29 one-landing).
  // Old bookmarks and Auth.js redirects cached in a browser still arrive here;
  // the query string (?error=AccessDenied) is passed through.
  async redirects() {
    return [{ source: "/signin", destination: "/", permanent: true }];
  },
};

export default nextConfig;
