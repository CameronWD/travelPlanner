# Spec — Share links light-only, Sign-in links via Resend, Welcome dialog layering (2026-10-01)

**Status:** built on the branch (plan docs/superpowers/plans/2026-10-01-share-light-email-signin-welcome-layering.md); awaiting merge and deploy.
**Branch:** `feat/share-light-only-and-email-signin-2026-10-01`. Target `main`.
Nothing merges or deploys without Cam's go-ahead. Terminology follows
`CONTEXT.md` (new term this round: **Sign-in link**).

| Part | Contents |
|---|---|
| 1 | Welcome dialog paints above the Travels map card (§C) — a bug fix, first because it is smallest |
| 2 | Share link pages are light-only until the dark pass is done (§A) |
| 3 | Sign-in link beside Google: Auth.js Resend provider, provider-aware gate, panel field, minimal branded email, docs (§B) + ADR 0057 amendment |
| 4 | Landing route ribbon loses its arrows (§D) — added mid-build 2026-10-01 |

**Out of scope:** Apple sign-in; a six-digit code flow; a dev-only
"print the link to the terminal" sender (Cam chose to make the first real
run on production — it is only him using it right now); porting the
design-kit `emails/magic-link` template (Cam will restyle the email later);
any other email (invites still send nothing, ADR 0017); a dark-mode pass on
the share page (follow-up); rate limiting beyond what the gate already gives
(a refused address never triggers a send, so sends are bounded by the
allowlist).

---

## A. Share link pages are light-only

**Why.** The dark rendering of `/share/[token]` does not look right yet. Until
it has had its own pass, every visitor sees the light design regardless of
their saved Teepee theme or OS setting.

**What.**

- `app/share/[token]/page.tsx` and `app/share/[token]/not-found.tsx` mark
  their root the way the Landing does (`app/landing/landing.tsx:37`):
  `data-theme="light"` plus the `light` class, so the light tokens apply and
  the Tailwind `dark:` variant (defined in `app/globals.css:15`) is switched
  off inside the page.
- The share page's route map does **not** read CSS; `components/trip/route-map.tsx`
  picks CARTO tiles, pin and route colours from `useTheme()`. The map gets an
  explicit light override (a prop such as `theme="light"` that wins over the
  hook) and the share page passes it. No other caller changes.
- The share route sets its own viewport `themeColor` to the light value so a
  dark-mode phone does not show a dark address bar over a light page. (The
  root layout keys it on `prefers-color-scheme`, `app/layout.tsx:26-32`.)
- Any dialog or sheet opened from the share page that portals to `<body>`
  carries the same marker (the Landing's sign-in panel shows the pattern at
  `app/landing/sign-in-panel.tsx:90-92`). Audit the share components for
  portals; if none, say so in the task output.
- Untouched: the open-graph image (already a fixed design), the signed-in
  app's dark mode, the share-style-bans and share-motion tests (they must
  still pass).

**Acceptance.**
- With the `.dark` class on `<html>` (saved dark theme), `/share/<token>`
  renders light: background, text, cards, and the map tiles are the Positron
  set, pins the light colours.
- `not-found` under `/share` is light under the same condition.
- A test on the share page asserts the root carries `data-theme="light"` and
  the `light` class (mirror `app/landing/landing.test.tsx:48-54`); a route-map
  test asserts the override prop wins over the hook.
- `docs/open-follow-ups.md` gains "SL-xx · Dark pass on the share page, then
  drop the light lock" with a pointer to the two files.

## B. Sign-in link (email) beside Google — Resend

**Why.** Follow-up LS-01 (`docs/open-follow-ups.md:2485`). Testers should be
able to get in without a Google account. Resend is the provider; Auth.js v5
ships a Resend provider, so there is no SMTP and no new mail library beyond
what `next-auth` already includes.

### B1. Provider and gating

- `lib/auth.ts` registers `Resend` from `next-auth/providers/resend` **only
  when both** `AUTH_RESEND_KEY` and `AUTH_RESEND_FROM` are set — the same
  shape as Google's `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` gate. Missing either
  → no provider, no field, nothing else changes. So the branch can merge and
  deploy before the domain is verified; the field appears when the two env
  vars land in Vercel.
- `from` is `AUTH_RESEND_FROM`, expected to be `Teepee <signin@teepee.camxanhq.com>`
  for now. The sending domain is **teepee.camxanhq.com** (verified at Resend
  by its DNS records; they sit on Resend's own sub-labels so they do not
  collide with the record pointing the host at Vercel). When Teepee gets its
  own domain, verify that one and change the env var; no code moves.
- Token lifetime: Auth.js default (24 h), single use. Stored in the existing
  `VerificationToken` table via `PrismaAdapter`.
- `callbackUrl` flows through exactly as the Google button's does today, so
  a share-page "Sign in" still lands the Traveller on that Trip.

### B2. The door stays one door (ADR 0057 amendment)

- `callbacks.signIn` in `lib/auth.ts:80-138` currently refuses anything
  without `profile.email_verified === true` (line 102). That check becomes
  **Google-only**. For the `resend` provider the proof of address ownership
  is the link itself (it is only ever delivered to that address), so the
  callback skips the profile check and goes straight to the allowlist /
  pending-Trip-Invite predicates, unchanged.
- Order matters and is the point of doing it in the callback: Auth.js runs
  `signIn` for the email provider **before** it mints a token or sends mail.
  A refused address therefore gets **no token and no email**, and — exactly
  as a refused Google sign-in today — is recorded as an **Access request**
  (`recordAccessRequest`) so Cam sees it in Admin and can accept it.
- The email is lowercased before every predicate and before the token is
  stored (ADR 0057's "every new code path that writes an email must lowercase
  it explicitly").
- Google gets `allowDangerousEmailAccountLinking: true` so a link-first
  Traveller can later use the Google button and land in the same account.
  Safe here because the gate already refuses any Google sign-in whose email
  is not verified. Google-first-then-link needs nothing.
- ADR 0057 gets a dated amendment (2026-10-01, this spec §B2) recording: the
  provider-aware verified-email check, that the email provider is admitted by
  the same two predicates, the refuse-before-send ordering, and the linking
  flag with its justification. "Nothing about *who* may sign in changes;
  *how* gains a second method behind the same door."

### B3. The Landing's Sign in panel

- `app/landing/sign-in-controls.tsx` is the one place (LK-02): under the
  Google button, an email field with a "Send me a link" button. It renders
  only when the provider is configured (same server-side env check pattern
  as `googleConfigured`). The "or" divider used for dev logins separates
  Google from the field when both show.
- The field appears in **both** panel modes ("Come on in" and "Want to test
  it?"); each mode keeps its own surrounding copy.
- On submit → `signIn("resend", { email, callbackUrl, redirect: false })`,
  then the controls swap to a neutral sent state, **identical for every
  address**: "If that address is on the list, a link is on its way. Check
  your inbox." plus a small "Use a different address" link back. The panel
  never says whether an address is on the list (same rule as denied mode).
- The closing line becomes "Apple sign-in is on the way." (drops Email).
- Keyboard/focus/contrast follow the existing panel; the field is a real
  `<input type="email" required autocomplete="email">` inside a `<form>`.
- Denied-mode is unaffected: a refused link never completes a sign-in, so
  `?error=AccessDenied` is not reached from the email path (the sent state
  already covered it). If Auth.js returns an error for a *configuration*
  failure (bad key), show the panel's existing generic error line, not the
  neutral copy.

### B4. The email

- A minimal branded message via `sendVerificationRequest` on the provider:
  subject **"Sign in to Teepee"**; one line ("Here's your sign-in link for
  Teepee."); one "Sign in" button; the raw URL beneath it for clients that
  strip buttons; footer: "This link works once and expires in 24 hours. If
  you didn't ask for it, you can ignore this email." HTML + plain-text
  parts, no images, no design-kit template port (Cam will restyle later).
- Lives in one file (`lib/sign-in-email.ts` or similar) with a pure
  `renderSignInEmail({ url })` returning `{ subject, html, text }` that is
  unit-tested; the send call is thin.
- Sent through Resend's HTTP API with `AUTH_RESEND_KEY` (the provider's
  default transport) — no SMTP, no `nodemailer`.

### B5. Docs and env

- `.env.example`: add `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM` (commented, with
  a one-line note), and the missing `ALLOWED_EMAILS`.
- `docs/DEPLOY.md`: a "Sign-in links (Resend)" section — create the Resend
  account, add the domain `teepee.camxanhq.com`, add its DNS records, create
  an API key, set the two Vercel env vars; note that until then the field
  does not appear. Replace any "no email provider" wording.
- `app/privacy/page.tsx`: the line about taking name, email and avatar from
  Google gains the email-link path (we store the address you type and send
  one email to it; the link token expires in a day).
- `docs/open-follow-ups.md`: LS-01 → done (pointer to this spec), LK-02
  updated to Apple-only, new SL-xx items (share dark pass; branded email
  restyle; Apple).
- `CONTEXT.md`: **Sign-in link** term (already added), Landing entry updated.

**Acceptance.**
- Unit: provider list contains `resend` iff both env vars set; `signIn`
  callback with `account.provider === "resend"` and an allowlisted email →
  `true` without touching `profile`; non-allowlisted → `false` and
  `recordAccessRequest` called; Google path unchanged (verified-email check
  still enforced); email lowercased before predicates.
- Unit: `renderSignInEmail` output contains the URL in both parts, subject
  "Sign in to Teepee", the 24-hour line.
- Component: with the provider configured, the panel shows the field in both
  modes; submit swaps to the neutral sent state regardless of the (mocked)
  result; "Use a different address" returns to the field; closing line reads
  "Apple sign-in is on the way." With it unconfigured, no field, and the
  closing line still mentions Apple only.
- Manual (Cam, on production after env vars are set): request a link for an
  allowlisted address → email arrives from `signin@teepee.camxanhq.com`,
  link signs in and lands on `callbackUrl`; a second click on the same link
  fails cleanly; an address not on the list gets no email and shows up as an
  Access request in Admin; a link-first account then signs in with Google and
  is the same Traveller.
- `npm test`, typecheck, lint, build green.

## C. Welcome dialog paints above the Travels map card

**Why.** Cam saw the "© OpenStreetMap · CARTO" line and the "Globe →" tag
sitting on top of the Welcome dialog's scrim on `/trips`.

**Cause (verified in code).** The dialog overlay and content are `z-50`
(`components/ui/dialog.tsx:49,125`). Leaflet itself is contained by
`.leaflet-container { isolation: isolate }` (`app/globals.css:28-30`), but
the Travels card's **own** overlays — the trip-count chip, the "Globe →" tag
and the attribution line — carry `z-[500]` so they sit above Leaflet's panes
(`components/trips/travels-map-card.tsx:94,134,153,160,165`), and the card
wrapper has no stacking context, so those 500s leak into the root context and
beat the dialog's 50. The scrim darkens correctly; those three elements are
painted on top of it. `components/plan/plan-mini-map.tsx:41,47` has the same
pattern (latent: shows behind any dialog on the Plan page).

**Fix.** Give each map card wrapper its own stacking context (`isolate`, with
the existing `relative`) so its internal z-indexes stay inside the card and
the card sits at page level below `z-50`. Two files: `travels-map-card.tsx`
(both the mobile `<Link>` and the desktop `<section>` share `card`) and
`plan-mini-map.tsx`. Extend the explanatory comment in `globals.css` to say
that any overlay a card draws *above* Leaflet must live inside an isolated
wrapper.

**Acceptance.**
- Tests assert the Travels card wrapper (mobile and desktop) and the Plan
  mini-map wrapper carry `isolate`.
- Manually: a fresh account's Welcome on `/trips` sits above everything on
  the Travels card; the Plan page's "Open map" dialog sits above the mini-map
  button.

## D. The Landing's route ribbon loses its arrows (added mid-build, 2026-10-01)

**Why.** Cam: the ribbon under the card fan is a ticker that moves left,
but every stop ends in a right-pointing arrow, so the arrows say "onward"
while the motion says "backward". Reversing the motion was considered and
rejected (content entering from the left fights the reading direction and
reads as a rewind). The arrows go; the coral dot before each stop already
separates and orders them, so the ribbon still reads as a route.

**What.** `app/landing/sample-cards.tsx` `Ribbon`: remove the `ArrowRight`
after each stop name (the dot and the name stay; spacing unchanged). The
two `ArrowRight` uses on the sample cards themselves (the card CTA arrows)
are untouched. This is a deliberate departure from the handoff
(`design_handoff/landing-shuffle-handoff/LANDING.md` §2.3 "ArrowRight 12px")
— the handoff is reference, this spec wins.

**Acceptance.**
- No `svg.lucide-arrow-right` inside any `[data-ribbon-half]`, phone or
  desktop; the card arrows still exist.
- The existing "two ribbon halves have identical text" test still passes.
- `app/landing/sample-cards.test.tsx`'s arrow-count assertion is replaced
  by one that says what is true now.

## E. The desktop route ribbon spans the sun panel (added 2026-10-01, second round)

**Why.** Cam: on desktop the ribbon under the card fan is not full width. It
is anchored inside the fan's fixed 600×630 stage (`CollageCards`,
`app/landing/sample-cards.tsx`), which is scaled per breakpoint, so on a
wide screen it stops short of the sun panel's edges. The handoff meant it to
be "the only piece that runs off the panel". Decision: it spans the **sun
panel** (the right column), not the whole viewport.

**What.**
- `CollageCards` renders a panel-filling wrapper (`absolute inset-0`) that
  carries the breakpoint scale ladder as one CSS variable `--fan-scale`
  (`.9`, `.95` from 1152, `1` from 1280, `1.1` from 1536, `1.3` from 1920,
  `1.75` from 2560 — the existing values). The stage keeps its testid,
  size and centring and scales with `scale-(--fan-scale)` instead of the
  per-breakpoint `scale-*` classes.
- The `stops` piece moves out of the stage to be the wrapper's last child:
  `absolute -inset-x-10 top-[calc(50%+259px*var(--fan-scale))]` — bleeding
  past both panel edges at every width, and vertically where it was (the
  stage's `top-[574px]` is 259px below the stage centre, which is the panel
  centre). It stays the ninth shuffle piece (`pieceRef("stops")`, fade-only,
  last in DOM order so the entrance stagger is unchanged).
- The ribbon's own typography no longer scales with the fan (15px band at
  every width). Accepted: a full-bleed band reads better at a fixed size.
- Phone ribbon untouched.

**Acceptance.**
- At 1440 and 2560 wide the band's left and right edges are outside the sun
  panel; the fan still scales as before (ladder values unchanged).
- Tests: the stage no longer contains a `stops` piece; the wrapper's last
  piece is `stops` with the new classes; the wrapper carries the
  `--fan-scale` ladder; shuffle still animates nine pieces; the "two ribbon
  halves have identical text" and arrow-free tests still pass.

## F. The Resend setup doc stands alone (added 2026-10-01, second round)

**Why.** Cam asked for the Resend deployment steps as their own doc named
`resendDeploy.md`.

**What.** Move `docs/DEPLOY.md` §3b verbatim into `docs/resendDeploy.md`
(title "Resend (Sign-in links) — deploy steps"), leave a one-line §3b in
DEPLOY.md pointing at it, and update every cross-reference to "§3b"
(`.env.example`, `lib/auth.ts` comment, `docs/DEPLOY.md` env table and §6,
`docs/open-follow-ups.md` LS-01 and SL-03) to `docs/resendDeploy.md`.

**Acceptance.** `grep -rn '§3b' .env.example lib docs app` finds only the
pointer line in DEPLOY.md; the new file carries every step and the
Preview-environment note.
