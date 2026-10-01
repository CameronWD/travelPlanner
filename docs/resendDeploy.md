# Resend (Sign-in links) — deploy steps

Moved out of `docs/DEPLOY.md` §3b on 2026-10-01 (spec 2026-10-01 §F). Read
`docs/DEPLOY.md` for the rest of the deployment; this file is the one place
for turning the Sign-in link on.

The email field on the Landing appears only when both env vars below are set
(`lib/auth.ts`, spec 2026-10-01 §B1). Until then Google is the only door and
nothing else changes, so this can be done after the deploy.

1. Create an account at resend.com.
2. **Domains → Add domain:** `teepee.camxanhq.com` (a subdomain, so Teepee's
   mail reputation stays off the root domain). Resend shows DNS records
   (SPF/MX on `send.teepee…`, a DKIM TXT, optionally DMARC); add them where
   the domain's DNS lives. They sit on their own sub-labels and do not
   collide with the record that points the host at Vercel. Wait for
   "Verified".
3. **API Keys → Create:** sending access only; copy it once.
4. Vercel → Project → Settings → Environment Variables (Production):
   | Name | Value |
   |---|---|
   | `AUTH_RESEND_KEY` | the API key |
   | `AUTH_RESEND_FROM` | `Teepee <signin@teepee.camxanhq.com>` |

   A beta / Preview environment needs the same two vars (tick Preview, or
   add them to that environment) if the email field should appear there too;
   without them that site simply shows Google only.
5. Redeploy (env changes need a new deployment). The Sign in panel now shows
   the email field. Test with an allowlisted address: the mail should arrive
   from `signin@teepee.camxanhq.com` with subject "Sign in to Teepee".

The sent copy is identical for an address that is and is not on the list; a
refused address gets no email and shows up as an Access request in Admin
(without a push notification — typed addresses never push).
When Teepee moves to its own domain: verify that domain, change
`AUTH_RESEND_FROM`, redeploy — no code changes.
