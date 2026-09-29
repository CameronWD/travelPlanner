# Landing and Sign in: the way in under the hero, a collage of sample cards (2026-09-29)

Follows `2026-09-29-landing-kit.md` (merged, 95aefff9). Where the two differ, **this file wins**.
Everything in that spec not mentioned here is unchanged (light mode forced, honest controls,
Badge-not-Chip inside decoration, `data-slot` trees per breakpoint, no auth changes).

Glossary: **Landing** (updated today), **Access request**, **Sign in**, **Wishlist**.
No Feedback note is attached (inbox had 0 open).

## 0. Decisions (grilling, 2026-09-29)

| # | Question | Decision |
|---|---|---|
| C1 | Cam's "one little orange square" | The `/signin` desktop right panel (one coral card on an empty sun panel). Both `/` and `/signin` get the collage. |
| C2 | "Sign up" / "Login" wording | **"Sign in"** (primary) and **"Request access"** (secondary). No "Sign up"/"Log in" — the glossary avoids "signup", and a refused Google sign-in already records an **Access request** (`lib/auth.ts` `recordAccessRequest`), so "Request access" is honest. Both open the same panel; only heading + line differ. |
| C3 | What clicking does | Opens a **Sign in panel**: `components/ui/dialog.tsx` (bottom sheet below `sm`, centred dialog from `sm`). The header "Sign in" opens it too (not a link to `/signin`). `/signin` stays a page with inline controls (Auth.js `pages.signIn`/`pages.error` target, deep links). |
| C4 | Collage | Desktop right panel widens to `lg:grid-cols-[1fr_0.8fr]`; nine cards (below); the four cards leave the left column. Cards may bleed off panel edges — part of the effect — except the coral countdown, which is always fully in view. |
| C5 | Phone layout | Header → hero → the two buttons side by side → "Teepee is invite-only · Privacy · Terms" line → cards filling the rest of the screen to the bottom edge, bleeding off bottom/sides. Page does not scroll (card area clipped). Six cards. The in-flow "Come on in" sheet is removed. |
| C6 | Desktop left column | Logo + header "Sign in" at top; hero, body, buttons and the invite/legal line vertically centred. No cards on the left. |
| C7 | Entrance timing | Text and buttons render immediately, no motion. Cards start ~300ms after load and arrive at deliberately **uneven** delays over ~1.5s, each on `--ease-bounce`. Nothing loops; reduced motion = everything at rest at once. |

## 1. Detail

### 1.1 The Sign in panel (`app/landing/sign-in-panel.tsx`, client component)

- `SignInPanel` exports a trigger pair and the dialog. State: `mode: "sign-in" | "request" | null`.
- `LandingActions` renders **Sign in** (`Button` default/primary, size `lg` on desktop, block-ish
  `flex-1` on phone) and **Request access** (`Button variant="secondary"`), side by side, then the
  muted line: `Teepee is invite-only · ` + Privacy + ` · ` + Terms links (`text-xs`/`13px`,
  `text-muted-foreground`).
- `HeaderSignIn` renders the header's `Button variant="secondary" size="sm"` "Sign in" that opens the
  panel in `sign-in` mode.
- Dialog contents (`DialogContent` with its own close button and, below `sm`, the existing sheet
  handle/animation the component already provides):
  - **sign-in:** `DialogTitle` "Come on in"; `DialogDescription` "Teepee is invite-only — sign in
    with the Google account you were invited with."
  - **request:** `DialogTitle` "Ask to join"; `DialogDescription` "Teepee is invite-only. Sign in
    with Google and we'll pass your name to the admin — there's nothing else to fill in."
  - Then `SignInControls` (unchanged: Google, dev logins in development, "Email and Apple sign-in
    are on the way.").
- Server-side env reads: `SignInControls` reads `process.env` — it must stay a Server Component.
  Pass it **as a prop/children** (`controls={<SignInControls/>}`) from the server `Landing` into
  the client panel; do not import it into the client file.
- The landing root stays light: the dialog portals to `<body>`, outside `data-theme="light"`, so
  `DialogContent` gets `data-theme="light"` + `light` class itself.

### 1.2 Desktop Landing (`/`, from `lg`) — `app/landing/landing.tsx`

- Frame `lg:grid lg:min-h-dvh lg:grid-cols-[1fr_0.8fr]`.
- Left `section`: `flex flex-col px-12 py-8`; header row (Logo 30 + `HeaderSignIn`); then a
  `flex-1 flex flex-col justify-center` block: h1 (unchanged 88px), body (unchanged), `mt-7`
  `LandingActions`. No "Start a trip". No sample cards.
- Right `section`: `relative overflow-hidden border-l-2 border-border bg-sun`, holding
  `<CollageCards/>` (aria-hidden). No card, no legal nav (moved to the invite line).

### 1.3 The collage (`app/landing/sample-cards.tsx`, `CollageCards`)

Absolute-positioned inside a box anchored to the panel's centre, designed at a 560×720 canvas and
scaled (`scale` steps like today's: `.72` at `lg`, `.86` from 1152px, `1` from 1280px,
`1.1` from 1536px) with `origin-center`. Cards may overflow the panel; the panel clips.
Nine pieces, rest tilt and entrance delay (ms):

| # | Piece | Content | Tilt | Delay |
|---|---|---|---|---|
| 1 | Coral countdown (fully in view, near centre) | Badge caps "Planning"; "Japan in Autumn" 30px; "26" 76px + "sleeps / to go" | −5° | 300 |
| 2 | Lilac stay | "Kyoto · 4 nights" / "Zz Machiya near Gion" / teal Badge "paid ✓" | 3° | 520 |
| 3 | Sun chip | "→ Shinkansen · Odawara 11:12", shadow-hard-2 | −7° | 610 |
| 4 | Teal fork | Avatars JM (sun) + AL (lilac); "Jess forked" / "“Slow Kyoto”" | 6° | 880 |
| 5 | Day's plan (card, white) | label "Tue 14 Oct"; three rows: "09:00 Fushimi Inari", "12:30 Nishiki lunch", "19:00 Pontochō" | −3° | 740 |
| 6 | Weather (card, white or teal-soft) | "Kyoto" / "21° ☀" / "light jacket tonight" | 5° | 1050 |
| 7 | Money (card, coral-soft or white) | "Ramen at Ichiran" / "¥2,400" / "Jess owes you ¥1,200" | −4° | 1180 |
| 8 | Wishlist (lilac) | label "Wishlist"; "Naoshima art island"; "♡ 2" | 4° | 960 |
| 9 | Stops strip (white pill/card) | "Tokyo → Hakone → Kyoto → Osaka" with dots | −2° | 1370 |

Delays are deliberately irregular (not a fixed step). Placement: scattered, overlapping, several
pieces partly off the panel's edges (e.g. stops strip off the top, money off the bottom, weather
off the right). Keep all text in these cards free of "stay"/"hotel". All decoration: one
`aria-hidden="true"` wrapper, no focusable elements (Badge, not Chip).

### 1.4 Phone Landing (`/`, below `lg`)

- Root `flex h-dvh flex-col overflow-hidden` (no page scroll).
- Header (Logo 26 + `HeaderSignIn`), hero h1 50px + short body (unchanged), `mt-5`
  `LandingActions` (two buttons `flex-1` side by side, invite/legal line under).
- `PhoneSampleCards` becomes a `relative flex-1 min-h-0 overflow-hidden -mx-6` area (clipped),
  six pieces: the current four (coral fully in view top-left, sun chip fully in view) plus the
  **day's plan** and **money** cards, placed so they sit low and bleed off the bottom/sides. Same
  uneven entrance (e.g. 300, 520, 610, 800, 960, 1120).
- The in-flow "Come on in" sheet section is removed.

### 1.5 Sign in (`/signin`) — `app/signin/sign-in-screen.tsx`

- Left column unchanged (inline controls, access-denied copy).
- Grid becomes `lg:grid-cols-[1fr_0.8fr]`; the right panel renders `<CollageCards/>` instead of the
  single coral card, same clipping. Phone unchanged (panel hidden below `lg`).

### 1.6 Motion (`app/globals.css`)

- `.tp-card-in` / `.tp-card-pop-in` delay becomes
  `animation-delay: var(--tp-delay, calc(var(--tp-i) * 80ms));` so a card can set an explicit
  delay. `entrance(tilt, i, delayMs?)` sets `--tp-delay: <n>ms` when given.
- Keep the reduced-motion rule zeroing delays, the hover lift and the backwards fill.
- Update `app/globals.landing-motion.test.ts` for the new delay expression.

## 2. Out of scope

Auth / invite gate / access-denied logic; real email or Apple sign-in; dark mode on these pages;
a separate request-access form.

## 3. Tests

- `app/landing/landing.test.tsx`: h1; header "Sign in" is a **button** (no `/signin` link needed);
  both trees contain "Sign in" and "Request access" buttons; invite/legal line with Privacy and
  Terms links; no "Start a trip", no "Sign up"/"Log in"; desktop collage renders nine pieces,
  phone six (query by `data-testid`), wrappers `aria-hidden`, pieces carry `tp-card-in` and
  `--tp-tilt`; delays are not all equal-stepped; no "stay"/"hotel".
- `app/landing/sign-in-panel.test.tsx`: clicking "Sign in" opens a dialog titled "Come on in" with
  the invite line and the passed controls; "Request access" opens "Ask to join"; close button
  closes it; dialog content carries `data-theme="light"`.
- `app/signin/sign-in-screen.test.tsx`: right panel renders the collage (nine pieces); existing
  assertions hold.
- `app/globals.landing-motion.test.ts`: the `--tp-delay` fallback expression; reduced-motion rule.

## 4. Verification

`npm test`, `npm run lint`, `npx tsc --noEmit`; screenshots of `/` at 1024, 1280, 1440, 1920 wide,
390×844 and 360×640, and `/signin` at 1280 — coral countdown fully visible everywhere, no page
scroll on phone, panel opens in both modes.

## 5. Amendments (build, 2026-09-29)

- **Phone set is 8 pieces, not 6.** Weather and Wishlist were added to the four
  originally called out in §1.4 (coral countdown, sun chip, day's plan, money)
  plus lilac. Controller ruling: §0's C5 intent — cards filling the rest of the
  screen to the bottom edge — outranks the six-card count written into §1.4's
  bullet; on a tall phone, six pieces left a gap short of the bottom edge, so
  two more were added to reach it.
- **Lower phone pieces use height-relative positions.** `PhoneSampleCards`
  places lilac, weather, wishlist, day's plan, the "let's go" chip and money
  with `top-[N%]` (money also uses a `calc(100% - Npx)` offset from the
  bottom), so the spread stretches with the clipped area's own height instead
  of stranding a gap on a screen taller than the shortest one it was tuned
  against. The coral countdown and the train chip stay pixel-anchored near
  the top (small, fixed offsets), always whole and readable regardless of
  screen height.
- **Collage scale steps**, after screenshot tuning, are (verified against
  `app/landing/sample-cards.tsx`'s `CollageCards`): `.9` at the base (`lg`),
  `.95` from 1152px, `1` from 1280px, `1.1` from 1536px, `1.3` from 1920px,
  and `1.75` from 2560px.
- **The invite line sits outside the Legal nav.** "Teepee is invite-only" is
  its own sibling `span` in the same visual row as the nav (`LandingActions`,
  `app/landing/sign-in-panel.tsx`), not inside `<nav aria-label="Legal">` —
  the nav holds only the Privacy and Terms links (final-review fix wave,
  2026-09-29).
