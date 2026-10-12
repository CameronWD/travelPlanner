# teepeeapp.com is the canonical host; teepee.camxanhq.com redirects permanently

## Status

Accepted 2026-10-02 on `docs/canonical-domain-2026-10-02`. The operator steps are
`docs/DEPLOY.md` §4h; the spec is `docs/specs/2026-10-02-canonical-domain.md`.

## Decision

Teepee answers at **`https://teepeeapp.com`**. Four hosts, each with one job:

- `teepeeapp.com` — canonical. Serves production. The apex, not `www`.
- `www.teepeeapp.com` — redirects to the apex. Exists for people who type it.
- `beta.teepeeapp.com` — serves the `beta` branch's latest deploy, in place of the
  branch's Vercel preview URL. The Feedback **site** it records is still `beta`, because
  the site is read from Vercel's branch variables, not from the hostname (ADR 0040,
  2026-09-26 amendment).
- `teepee.camxanhq.com` — the host Teepee lived on until today. It stays attached to the
  Vercel project **indefinitely** and answers every request with a **301** to the same
  path and query on `teepeeapp.com`. It is never removed.

The redirect is Vercel's domain-level redirect, set in the project's Domains settings. It is
not in the repository, by construction: `next.config.ts` carries no host rule for it.

Nothing in the application changes. Auth.js runs with `trustHost: true`, so the sign-in
callback is built from the request host; absolute URLs the server has to mint (the og:image
base, the approval email's link) come from `APP_URL` via `lib/site-url.ts`; share links and
calendar feed URLs are copied from the browser's own origin. The move is two environment
variables, DNS, and dashboards.

> **Amended 2026-10-12.** Sign-in moved from Auth.js to Better Auth (ADR 0071). The
> property this ADR relies on is unchanged: the sign-in callback is still built from the
> request host, so nothing in the repository names the canonical host.

## Why

Teepee was a subdomain of Cam's personal domain, which was fine for two Travellers and
wrong for a product that now has testers, a Landing, a privacy page and a Google OAuth
consent screen with the domain on it. A product should own its host.

The thing that makes a host change hard to reverse is everything already pointing at the
old one: share links in group chats, calendar feed subscriptions in Apple and Google
Calendar, bookmarks, installed PWAs, and the callback URL inside any sign-in email not yet
opened. A calendar client that gets NXDOMAIN does not complain; it stops syncing. So the
old host is not retired on a date, it is kept, and its only job is to point at the door.

## Considered options

- **The redirect in `next.config.ts`**, a `redirects()` rule matching on host. Visible in
  the diff and testable, but `permanent: true` emits a 308 (a 301 needs the `statusCode`
  form), and the rule only fires while the old domain is still attached to the project —
  which the dashboard setting needs too. Same prerequisite, more code. Rejected.
- **A Cloudflare redirect rule.** Means proxying the old host through Cloudflare and taking
  TLS off Vercel for it. More moving parts for the same 301. Rejected.
- **`www` as canonical.** Only useful if the apex should one day point somewhere else, such
  as a marketing site. Nothing planned. The apex is shorter in a share link. Rejected.
- **A mail subdomain** (`signin@mail.teepeeapp.com`), as the old `teepee.camxanhq.com`
  sender was a subdomain to keep reputation off the camxanhq root. Resend keeps the
  return-path on its own `send.` sub-label regardless, and Teepee sends no bulk mail, so the
  root's reputation is already protected. A sign-in link from the bare product domain is
  what a recipient expects. Rejected; the sender is `Teepee <signin@teepeeapp.com>`.

## Consequences

- The redirect cannot be read from the repository. `docs/DEPLOY.md` §4h records it, and
  the verification there (a `curl -I` on the old host expecting a 301 with the path kept)
  is the only proof it is still in place.
- A new origin costs every Traveller once: sign in again (cookies are per host); reinstall
  the PWA (an install from the old host opens out of scope after the 301, and the Install
  nudge shows again because its dismissal is stored per origin); re-enable push on the new
  host (old subscriptions keep delivering through the old service worker until that browser
  forgets it, and stale rows are pruned on the next 404/410). A Feedback note queued
  offline on the old origin and never flushed is stranded.
- The GitHub Actions `APP_URL` variable must move with the host. The Digest cron's curl
  does not follow redirects, and would drop its bearer token across hosts if it did; left
  on the old host it gets a 301, the job only warns on non-2xx, and Digests stop silently.
- `teepee.camxanhq.com` stays in the test fixtures that use it as an example URL. They are
  fixtures, not configuration.
