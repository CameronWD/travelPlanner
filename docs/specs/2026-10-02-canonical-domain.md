# Spec — teepeeapp.com is the canonical host; teepee.camxanhq.com redirects (2026-10-02)

**Status:** docs written on the branch (pipeline waived by Cam); awaiting Cam's clicks and the §F verification.
**Branch:** `docs/canonical-domain-2026-10-02`. Target `main`.
Terminology follows `CONTEXT.md`. No glossary term changes: the **Site** of a
Feedback note (`main` / `beta`) is read from Vercel's deployment variables,
not the hostname, so a new hostname changes nothing there.

**The problem.** Teepee lives at `teepee.camxanhq.com`, a subdomain of Cam's
personal domain. Cam has bought `teepeeapp.com`. The product should answer on
its own domain, and every URL already in the wild — share links, calendar
feed subscriptions, bookmarks, the sign-in link in someone's inbox — must
keep working.

**The decision.** `https://teepeeapp.com` becomes the canonical host. The old
host stays attached to the Vercel project forever and answers every request
with a **301** to the same path on the new host. The beta branch gets
`beta.teepeeapp.com`. The redirect lives in Vercel's domain settings, not in
code. Nothing in the app changes: it already derives its own origin from the
request (`trustHost: true`) or from `APP_URL` (`lib/site-url.ts`).

| Part | Contents |
|---|---|
| A | The hosts and what each one does |
| B | Where the redirect lives, and why not in code |
| C | The operator runbook (new section in `docs/DEPLOY.md`) |
| D | Env and the mail sender (`docs/resendDeploy.md`, `.env.example`) |
| E | ADR 0066 |
| F | Verification once Cam says it is live |

**Out of scope (decided):** any application code; renaming the old host in
test fixtures (`lib/auth-sign-in-link.test.ts`, `lib/sign-in-email.test.ts`,
`app/landing/sign-in-controls.test.tsx` — they are fixtures, they pass, they
stay); a sunset date for the old host (there is none: it is never removed);
proxying either host through Cloudflare; redirecting the project's default
`*.vercel.app` production alias; a `www`-canonical layout; a mail subdomain;
Preview-environment env vars (unchanged from `docs/resendDeploy.md`).

---

## A. The hosts

| Host | Role | DNS (Cloudflare, **DNS-only**, grey cloud) | Vercel |
|---|---|---|---|
| `teepeeapp.com` | **Canonical.** Serves production. | `A @ → 76.76.21.21` | Production domain, primary |
| `www.teepeeapp.com` | Redirects to the apex. Nobody will share it; someone will type it. | `CNAME www → cname.vercel-dns.com` | Redirects to `teepeeapp.com` (Vercel's default for the non-primary) |
| `beta.teepeeapp.com` | Serves the `beta` branch's latest deploy. Replaces the branch's Vercel preview URL for testers. | `CNAME beta → cname.vercel-dns.com` | Assigned to Git branch `beta` |
| `teepee.camxanhq.com` | **Never removed.** 301 to `https://teepeeapp.com/<same path and query>`. | unchanged (`CNAME → cname.vercel-dns.com`, already DNS-only) | Stays attached; "Redirect to" `teepeeapp.com`, status **301** |

Use the record values Vercel's Domains page shows at the time; the ones above
are Vercel's usual ones. DNS-only matters: Vercel issues the certificate, so
Cloudflare's proxy must stay off, as it already is for the old host.

The Feedback **site** on `beta.teepeeapp.com` still records `beta`: the host
is assigned to the branch, so `VERCEL_ENV=preview` and
`VERCEL_GIT_COMMIT_REF=beta` are unchanged (ADR 0040, 2026-09-26 amendment).

## B. Where the redirect lives

Vercel's domain-level redirect, configured on `teepee.camxanhq.com` in the
project's Domains settings: redirect to `teepeeapp.com`, status 301, path and
query preserved. Rejected:

- `next.config.ts` `redirects()` with a `has: [{ type: "host" }]` match. It
  is visible in the repo, but `permanent: true` emits a 308 (a 301 needs the
  `statusCode` form), and it only works while the old domain is attached to
  the project anyway, so it buys nothing over the dashboard setting.
- A Cloudflare redirect rule. Means proxying the old host through
  Cloudflare and moving TLS off Vercel. More moving parts for the same
  result.

The repo therefore cannot show the redirect. `docs/DEPLOY.md` (part C) and
ADR 0066 (part E) record it, and part F's curl check proves it.

## C. The operator runbook — `docs/DEPLOY.md`

A new section, **§4e. Domains — teepeeapp.com is canonical**, after §4d. It
is the human work in the order that does not break sign-in. Steps 1 and 2
are safe to do any time before the switch; step 4 is the switch.

1. **Google OAuth (Cloud Console → Credentials → the Web client).** Add
   authorised redirect URIs
   `https://teepeeapp.com/api/auth/callback/google` and
   `https://beta.teepeeapp.com/api/auth/callback/google`. Keep the old one
   for now. On the consent screen, add `teepeeapp.com` to **Authorised
   domains** (a published app requires the redirect URIs' domains to be
   listed there). Google accepts extras at any time; nothing changes until
   a request arrives from the new host.
2. **Resend → Domains → Add domain `teepeeapp.com`.** Add the records Resend
   shows to Cloudflare (SPF/MX on `send.teepeeapp.com`, DKIM TXT,
   optionally DMARC). Wait for Verified. Resend keeps the return-path on its
   own `send.` sub-label, which is why no visible mail subdomain is needed.
3. **Cloudflare DNS for `teepeeapp.com`:** the three records in part A,
   all DNS-only.
4. **Vercel → Project → Settings → Domains.** Add `teepeeapp.com` (primary),
   `www.teepeeapp.com` (redirect to the apex, Vercel's default), and
   `beta.teepeeapp.com` with Git branch `beta`. Then edit
   `teepee.camxanhq.com`: **Redirect to** `teepeeapp.com`, status **301**.
   Do not remove it, now or later.
5. **Env.** Vercel Production: `APP_URL=https://teepeeapp.com`,
   `AUTH_RESEND_FROM=Teepee <signin@teepeeapp.com>`. GitHub → Settings →
   Secrets and variables → Actions → Variables: `APP_URL=https://teepeeapp.com`.
   **Redeploy production** — `APP_URL` is read at module scope for
   `metadataBase` and by the approval email.
6. **Verify** (part F).

The section also states, so nobody files them as bugs later:

- **Why the GitHub variable is not optional.** The Digest cron's curl does
  not follow redirects, and would drop the bearer token across hosts if it
  did. Left pointing at the old host it gets a 301, the job only *warns* on
  non-2xx, and Digests silently stop.
- **What a new origin costs.** Everyone signs in again once (cookies are
  per host). A PWA installed from the old host opens out of scope after the
  301; reinstall from the new host, where the Install nudge shows again
  because its dismissal is stored per origin. Push subscriptions on the old
  origin keep working through the old service worker until that browser
  forgets it; re-enabling on the new host creates a fresh subscription and
  stale rows are pruned on the next 404/410. A Feedback note queued offline
  on the old origin and never flushed is stranded.
- **Why the old host is never removed.** Share links and calendar feed
  subscriptions already handed out point at it; a calendar client that gets
  NXDOMAIN stops syncing silently.

Also in `docs/DEPLOY.md`: the §4 env table's `AUTH_RESEND_FROM` row and §5's
`APP_URL` text name the real values (`Teepee <signin@teepeeapp.com>`,
`https://teepeeapp.com`) instead of the placeholder. `<your-vercel-domain>`
placeholders elsewhere in `docs/DEPLOY.md` and `README.md` are generic
first-deploy instructions and stay.

## D. Env and the mail sender

- `docs/resendDeploy.md`: step 2 adds `teepeeapp.com` (not a subdomain — the
  product now owns a root domain, and Resend's `send.` return-path keeps the
  reputation argument covered); step 4's `AUTH_RESEND_FROM` is
  `Teepee <signin@teepeeapp.com>`; step 5's expected sender likewise. The
  closing "When Teepee moves to its own domain" paragraph is replaced by one
  line: the old `teepee.camxanhq.com` domain can be removed from Resend once
  nothing sends from it.
- `.env.example`: the commented `AUTH_RESEND_FROM` example becomes
  `Teepee <signin@teepeeapp.com>`.
- No change to `lib/mail.ts`, `lib/auth.ts`, `lib/site-url.ts` or any test.

## E. ADR 0066 — teepeeapp.com is the canonical host; the old host redirects permanently

Short, in the house format (`docs/adr/0063…` is the model). Status: Accepted
2026-10-02. Decision: the four hosts of part A and the 301. Why: the product
should own its domain; the three trade-offs and the losing side of each
(dashboard redirect over code, apex over www, root sender over a mail
subdomain); the redirect is invisible from the repo by construction, which
is why this ADR and `docs/DEPLOY.md` §4e exist; the old host is never
removed because URLs in the wild depend on it. Consequences: the new-origin
costs listed in part C, in one paragraph.

## F. Verification once Cam says it is live

Grommet runs, from this machine:

```
curl -sI 'https://teepee.camxanhq.com/trips/x?y=1'   # 301, Location: https://teepeeapp.com/trips/x?y=1
curl -sI https://www.teepeeapp.com/                  # 3xx → https://teepeeapp.com/
curl -sI https://teepeeapp.com/                      # 200, server: Vercel, strict-transport-security present
curl -sI https://beta.teepeeapp.com/                 # 200
curl -s  https://teepeeapp.com/ | grep -o 'og:image[^>]*'   # absolute URL on teepeeapp.com
```

Cam checks, in a browser and on the dashboards:

- Google sign-in on `teepeeapp.com` and on `beta.teepeeapp.com`.
- A Sign-in link email arrives from `signin@teepeeapp.com` and its callback
  URL is on `teepeeapp.com`.
- Trip Settings → Sharing → Copy gives a `teepeeapp.com` URL; an *old*
  `teepee.camxanhq.com` share link still opens.
- GitHub → Actions → Digest cron → Run workflow → the step logs HTTP 200.
- One Feedback note written on `beta.teepeeapp.com` shows the **Beta** chip.
