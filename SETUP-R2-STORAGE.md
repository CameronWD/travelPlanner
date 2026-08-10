# Fix the broken cover photos — set up Cloudflare R2 storage

**Goal:** make images (trip cover photos, marker/journal photos, file attachments) actually load on the live app.

**Time:** ~10 minutes of clicking. Nothing here touches code — it's all account setup.

---

## Why the photos are broken (30-second version)

Uploaded files (covers, attachments) have to live *somewhere*. Right now the live app is
configured with `STORAGE_DRIVER=local`, which means "write files to the server's own disk."
On Vercel that disk is **throwaway** — it vanishes after each request — so every image the
app tries to load 404s and you see the alt text / broken-image icon instead.

The fix: point the app at real object storage. We're using **Cloudflare R2** (it's what the
project was built for — see `docs/DEPLOY.md`). R2 has a generous free tier that this app will
never come close to exceeding.

Once R2 is set up, I'll upload the images that already exist (they're sitting on your laptop
from when I seeded the demo) straight into your new bucket, so the current trips light up
immediately — **no re-seeding, no changed links.**

---

## The 5 values you're going to collect

Keep a scratch note open. By the end you'll have filled in all five:

| # | Value | Looks like | Where you get it |
|---|-------|-----------|------------------|
| 1 | `STORAGE_DRIVER` | `r2` | it's literally the word `r2` |
| 2 | `CLOUDFLARE_ACCOUNT_ID` | 32 hex chars, e.g. `a1b2c3…` | R2 overview page (Part A2) |
| 3 | `R2_BUCKET_NAME` | the name you choose, e.g. `travel-planner` | you pick it (Part A1) |
| 4 | `R2_ACCESS_KEY_ID` | ~32 chars | R2 API token (Part A3) |
| 5 | `R2_SECRET_ACCESS_KEY` | long secret string | R2 API token (Part A3) — **shown once** |

---

## Part A — Cloudflare R2 (create the bucket + a key)

### A1. Create the bucket

- [ ] Go to **https://dash.cloudflare.com** and sign in (create a free account if you don't have one).
- [ ] In the left sidebar click **R2** (may show as **"R2 Object Storage"**).
- [ ] **First time only:** it'll ask you to enable R2 by adding a **payment method**. Add a card.
      This does **not** charge you — the free tier is 10 GB storage + plenty of operations/month,
      and this app uses a tiny fraction of that. It's just Cloudflare's anti-abuse gate.
- [ ] Click **Create bucket**.
- [ ] **Bucket name:** type something simple and lowercase, e.g. `travel-planner`.
      → **Write this down as value #3 (`R2_BUCKET_NAME`).**
- [ ] **Location:** leave it on **Automatic** (default).
- [ ] ⚠️ **Do NOT pick the "EU" or any special jurisdiction** if it offers one — the app talks to
      the standard R2 endpoint, and an EU-jurisdiction bucket uses a different URL that won't match.
      Standard/default is what you want.
- [ ] Click **Create bucket**. Done — you now have an empty bucket.

### A2. Grab your Account ID

- [ ] Go back to the **R2 overview page** (click **R2** in the sidebar).
- [ ] On the right-hand side you'll see **Account ID** with a copy button. Copy it.
      → **That's value #2 (`CLOUDFLARE_ACCOUNT_ID`).** It's a 32-character string of letters/numbers.
      *(If you can't find it: it's also in the browser URL after `dash.cloudflare.com/` — the long
      hex string.)*

### A3. Create an R2 API token (this is the key the app logs in with)

- [ ] Still in **R2**, look for **"Manage R2 API Tokens"** (usually a link on the top-right of the
      R2 overview page, or under an **"API"** / **"⚙ Settings"** area).
- [ ] Click **Create API token** (or **Create Account API token**).
- [ ] **Name:** anything, e.g. `travel-planner-app`.
- [ ] **Permissions:** choose **Object Read & Write** (NOT "Read only", and you don't need "Admin").
- [ ] **Specify bucket(s):** you can scope it to just the `travel-planner` bucket you made (safer),
      or leave it as all buckets — either is fine.
- [ ] **TTL / expiry:** leave as **Forever** (or the longest option). A token that expires will
      silently break images later.
- [ ] Click **Create API Token**.
- [ ] The result screen shows several things. You need exactly two of them:
  - [ ] **Access Key ID** → **value #4 (`R2_ACCESS_KEY_ID`)**
  - [ ] **Secret Access Key** → **value #5 (`R2_SECRET_ACCESS_KEY`)** — ⚠️ **this is shown ONCE.**
        Copy it now. If you lose it you just make a new token, no big deal.
  - *(Ignore the "S3 API" endpoint URL, the `jurisdiction` endpoints, and the `Token value` —
    the app builds the endpoint itself from your Account ID.)*

✅ **End of Part A** — you should now have all 5 values written down.

---

## Part B — Put the credentials in the two places that need them

The same 5 values go in **two** spots: Vercel (so the live app can use R2) and one local file
(so I can upload your existing images into the bucket).

### B1. Add them to Vercel (the live app)

- [ ] Go to **https://vercel.com** → your **travel-planner** project.
- [ ] **Settings** → **Environment Variables**.
- [ ] Add each of the 5 below. For each one, set the **Environment** to **Production**
      (ticking Preview + Development too is harmless and convenient):

  ```
  STORAGE_DRIVER          = r2
  CLOUDFLARE_ACCOUNT_ID   = <value #2>
  R2_BUCKET_NAME          = <value #3>
  R2_ACCESS_KEY_ID        = <value #4>
  R2_SECRET_ACCESS_KEY    = <value #5>
  ```

  > If `STORAGE_DRIVER` already exists there set to `local` or empty, **edit it** to `r2` rather
  > than adding a duplicate.

- [ ] Click **Save**.
- [ ] **Don't redeploy yet** — do that in Part C, *after* the images are uploaded, so everything
      lights up at once. (Redeploying early just means one extra redeploy; not harmful, just tidier.)

### B2. Add them to the local file (so I can upload the existing images)

Open **`.env.production.local`** in the project root. Near the bottom there's a commented-out R2
block. Replace/fill it so it reads exactly like this (real values, no `#` in front, keep the quotes):

```dotenv
STORAGE_DRIVER="r2"
CLOUDFLARE_ACCOUNT_ID="<value #2>"
R2_BUCKET_NAME="<value #3>"
R2_ACCESS_KEY_ID="<value #4>"
R2_SECRET_ACCESS_KEY="<value #5>"
```

> `.env.production.local` is git-ignored, so these secrets won't get committed. Don't paste them
> into chat or the guide — just save them in this file.

- [ ] Saved `.env.production.local` with the 5 real values.

---

## Part C — Tell me, then redeploy

- [ ] Come back and say **"R2 is set up"** (or "storage done").

Then **I'll**:
1. Run a one-off upload that pushes the ~19 image/file blobs already in your local `.uploads/`
   folder into your new R2 bucket, under the exact keys the database already points at. This
   covers the demo trip covers, the globe marker photos, and your older attachments.
2. Confirm the uploads succeeded and tell you it's your move.

Then **you**:
- [ ] In Vercel → **Deployments** → open the latest → **⋯ menu → Redeploy** (build cache on/off
      doesn't matter). This makes the live app pick up the new `STORAGE_DRIVER=r2` env vars.
- [ ] When the redeploy finishes, **hard-refresh** the site (Cmd-Shift-R) and open your trips.

✅ Cover photos and attachments should now load.

---

## Troubleshooting (if images still don't show after the redeploy)

- **Still broken alt text everywhere** → the redeploy probably didn't happen or didn't pick up the
  env vars. Confirm the 5 vars are on the **Production** environment in Vercel, then redeploy again.
- **Some load, some don't** → those specific files may not have been in `.uploads/` when I uploaded
  (e.g. attachments created on a different machine). Tell me which trip and I'll check.
- **Everything 403 / access denied in my upload step** → the API token is Read-only or scoped to the
  wrong bucket. Make a new **Object Read & Write** token (Part A3) and update both places (B1 + B2).
- **`Storage misconfigured: ... is required`** in logs → one of the 5 vars is missing or misspelled.
- **Wrong-endpoint / host errors** → the bucket was created with an EU/special jurisdiction. Easiest
  fix: make a new standard bucket (Part A1) and point the vars at it.

---

## FAQ

- **Will this cost money?** Effectively no. R2's free tier dwarfs this app's usage. The card is just
  required to switch R2 on.
- **Do I have to re-seed / will my trips change?** No. I'm uploading the *existing* files to R2 under
  their existing keys — trip IDs, links, and data all stay exactly as they are.
- **What about photos I upload in the future?** Those now work too — the live app writes new uploads
  straight to R2 once `STORAGE_DRIVER=r2` is live.
- **Is `local` storage ever fine?** Yes — for local dev on your own machine (`.uploads/`). It's only
  broken on Vercel because Vercel has no persistent disk.
