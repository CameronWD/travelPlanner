# Stack: Next.js + Postgres (Prisma) + Auth.js, server-rendered, deployed to free tiers

We build a single Next.js (App Router, TypeScript) application that serves both UI and API
(route handlers / server actions), backed by Postgres via Prisma, with Auth.js (Google
provider) for sign-in and an S3-compatible bucket for Attachments. Sync between the two
travellers is achieved with server-rendered reads plus refetch-on-focus/short polling
(not a realtime socket) — adequate for two people and far simpler. Offline is **read-only
caching** via a service worker (PWA), not offline-first editing with merge.

We considered an all-in-one BaaS (e.g. Supabase) — it would hand us auth, realtime,
storage and Postgres for less code, but it couples the data model to one vendor's
row-level-security and realtime model and is harder to run fully locally in this build
environment. We kept the pieces swappable and free-tier friendly (Vercel + Neon + R2/Blob)
so the user can stand it up later with minimal lock-in. This is the technology lock-in
decision for the project; recorded so the Supabase question isn't reopened by default.
