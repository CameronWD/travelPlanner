# Deploy runbook — Vercel + Neon + Cloudflare R2 (free tier)

Everything here is the human (account/secret/click) work. The code is already wired:
Postgres via `@prisma/adapter-pg`, R2 via the `r2` storage driver, migrations via
`prisma migrate deploy` in the Vercel build, and reminders via a GitHub Actions cron.

## 0. Generate secrets (local shell)

```bash
openssl rand -base64 32      # AUTH_SECRET
openssl rand -hex 32         # CRON_SECRET
npx web-push generate-vapid-keys   # VAPID public/private pair
```

## 1. Neon (Postgres) — free

1. Create a project at https://neon.tech.
2. Copy two connection strings from the dashboard:
   - **Pooled** (has `-pooler` in the host) → use as `DATABASE_URL`.
   - **Direct** (no `-pooler`) → use as `DIRECT_URL`.
   Both should include `?sslmode=require`.

## 2. Cloudflare R2 — free

1. Create a bucket at https://dash.cloudflare.com → R2.
2. Note your **Account ID** (R2 overview page).
3. Create an **R2 API token** (Object Read & Write) → gives an Access Key ID + Secret.
4. You will set: `STORAGE_DRIVER=r2`, `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET_NAME`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

## 3. Google OAuth — free

1. https://console.cloud.google.com → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback/google`
   (you can add the real domain after the first Vercel deploy, then redeploy).
4. Copy the **Client ID** and **Client Secret**.

## 4. Vercel — free (Hobby)

1. Import the GitHub repo at https://vercel.com (framework auto-detects Next.js;
   `vercel.json` already sets the build command).
2. Add **Environment Variables** (Production):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** URL |
   | `DIRECT_URL` | Neon **direct** URL |
   | `AUTH_SECRET` | from step 0 |
   | `AUTH_GOOGLE_ID` | from step 3 |
   | `AUTH_GOOGLE_SECRET` | from step 3 |
   | `ALLOW_DEV_LOGIN` | `false` |
   | `STORAGE_DRIVER` | `r2` |
   | `CLOUDFLARE_ACCOUNT_ID` | from step 2 |
   | `R2_BUCKET_NAME` | from step 2 |
   | `R2_ACCESS_KEY_ID` | from step 2 |
   | `R2_SECRET_ACCESS_KEY` | from step 2 |
   | `VAPID_PUBLIC_KEY` | from step 0 |
   | `VAPID_PRIVATE_KEY` | from step 0 |
   | `VAPID_SUBJECT` | `mailto:you@yourdomain.com` |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | same as `VAPID_PUBLIC_KEY` |
   | `CRON_SECRET` | from step 0 |
   | `NEXT_PUBLIC_APP_NAME` | e.g. `Trip Planner` |

3. Deploy. The build runs `prisma migrate deploy` against `DIRECT_URL`, creating the
   schema on Neon, then `next build`.
4. Add your final Vercel domain to the Google OAuth redirect URI (step 3) if you didn't already, then redeploy.

## 5. GitHub Actions cron (reminder delivery)

In the GitHub repo settings:
- **Secrets and variables → Actions → Secrets:** add `CRON_SECRET` (same value as Vercel).
- **Variables:** add `APP_URL` = `https://<your-vercel-domain>` (no trailing slash).

The `Reminders cron` workflow then pings `/api/cron/reminders` every 5 minutes. Trigger it
once manually (Actions tab → Reminders cron → Run workflow) to confirm it returns 200.

## 6. First sign-in

1. Open the deployed URL, sign in with Google.
2. Create your trip, then invite your partner by email on the trip's Settings page.
3. Your partner signs in with that Google email and is auto-added.

## Enabling AI later (optional, paid)

Add `ANTHROPIC_API_KEY` (and optionally `AI_MODEL=claude-haiku-4-5` for lower cost) in
Vercel env and redeploy. No code change.
