# Resend (Sign-in links) — deploy steps

Moved out of `docs/DEPLOY.md` §3b on 2026-10-01 (spec 2026-10-01 §F). Read
`docs/DEPLOY.md` for the rest of the deployment; this file is the one place
for turning the Sign-in link on.

The email field on the Landing appears only when both env vars below are set
(`lib/auth.ts`, spec 2026-10-01 §B1). Until then Google is the only door and
nothing else changes, so this can be done after the deploy.

1. Create an account at resend.com.
2. **Domains → Add domain:** `teepeeapp.com` (the product's own root domain,
   docs/DEPLOY.md §4e — Resend keeps the return-path on its own
   `send.teepeeapp.com` sub-label, so the root's reputation is covered
   without a visible mail subdomain). Resend shows DNS records (SPF/MX on
   `send.teepeeapp.com`, a DKIM TXT, optionally DMARC); add them in
   Cloudflare, DNS-only. They sit on their own sub-labels and do not
   collide with the records that point the hosts at Vercel. Wait for
   "Verified".
3. **API Keys → Create:** sending access only; copy it once.
4. Vercel → Project → Settings → Environment Variables (Production):
   | Name | Value |
   |---|---|
   | `AUTH_RESEND_KEY` | the API key |
   | `AUTH_RESEND_FROM` | `Teepee <signin@teepeeapp.com>` |

   A beta / Preview environment needs the same two vars (tick Preview, or
   add them to that environment) if the email field should appear there too;
   without them that site simply shows Google only.
5. Redeploy (env changes need a new deployment). The Sign in panel now shows
   the email field. Test with an allowlisted address: the mail should arrive
   from `signin@teepeeapp.com` with subject "Sign in to Teepee".

The sent copy is identical for an address that is and is not on the list; a
refused address gets no email and shows up as an Access request in Admin
(without a push notification — typed addresses never push).
The approval email (sent when an Admin approves an Access request) uses the same two vars; without them, approving still works and the admin panel says no email went.
Teepee moved to `teepeeapp.com` on 2026-10-02 (docs/DEPLOY.md §4e, ADR 0066).
The old `teepee.camxanhq.com` domain can be removed from Resend once nothing
sends from it.
