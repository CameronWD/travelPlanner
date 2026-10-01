# Landing and Sign in follow the Playground kit (2026-09-29)

> **Superseded in part (2026-10-01):** there is no `/signin` page — the Sign in page folded into the Landing at `/`, and `pages.signIn`/`pages.error` point at `/` (ADR 0057 amendment 2026-10-01; `docs/specs/2026-10-01-landing-shuffle-help-offline.md` §E). Mentions of `/signin` below are historical.

**Source of truth for pixels, copy and layout:** `design_handoff/playground-2/reference/ui_kits/`
— `teepee-desktop/DLanding.jsx` (desktop Landing), `teepee-mobile/Landing.jsx` (phone Landing),
`shared/admin.jsx` `SignIn` (lines 106–117, the Sign in screen), and the kit's tokens under
`reference/tokens/`. This spec records the decisions from the grilling session on 2026-09-29 and
where the app deliberately departs from the kit. Where this file and the kit differ, **this file
wins**. `design_handoff/playground/` has no landing design and is not a source.

Glossary: **Landing** (added today), **Home**, **Wishlist**, **Trip**, **Stop**.

No Feedback note is attached to this work.

---

## 0. Decisions (from the interview)

| # | Question | Decision |
|---|---|---|
| D1 | Which surfaces? | **All three:** `/` desktop Landing from `DLanding.jsx`; `/` phone Landing from `Landing.jsx`; `/signin` from the kit's `SignIn` screen (today `/signin` reuses the Landing, so "Start a trip" loops back to itself). |
| D2 | The kit's "free for up to 6 people" chip. | **Dropped.** The product has no cap or pricing. |
| D3 | Cam remembers the sample cards floating; the kit has no landing animation and its motion tokens say "quick, springy, never floaty". | **Springy staggered entrance, no perpetual motion.** On load the sample cards rise in one after another (~500ms total), each overshooting its tilt slightly and settling on `--ease-bounce`; the "Come on in" card pops in last. Desktop hover lifts a card a few px and straightens it ~1°. All motion off under `prefers-reduced-motion`. |
| D4 | The kit's sign-in card has an email field, Continue, Apple and Google, "No passwords. We'll email you a link." The app is Google-only, invite-only, no email provider. | **Honest card with an "on the way" line.** Kit styling (title, padding, shadow, dotted "or" divider) with only working controls: Google; in development, the dotted divider and dev logins. The invite line stays. One muted line under the controls: **"Email and Apple sign-in are on the way."** No disabled placeholders. |
| D5 | Kit header has "How it works" (ghost) and "Sign in". "How it works" has no destination. | **"Sign in" only**, linking to `/signin`. No "How it works". |
| D6 | Phones: kit has a separate mobile Landing with a small card set and a bottom sign-in sheet; today's page hides the cards. | **Follow the mobile kit.** Logo 26, hero 50px, the short body line, the small card set (coral countdown, lilac "Zz Machiya Gion ✓" + "Kyoto · 4 nights", sun "→ Shinkansen · 11:12", teal "let's go") with the same entrance, and the sign-in **sheet** as the page's last block (in flow, not pinned), holding the same honest contents as the desktop card. Sized to fill one phone screen. |
| D7 | Kit `SignIn` copy: "One trip, everyone on it. Stops, days, money and the maybe-list." | **Adopt the screen; "the maybe-list" becomes "the Wishlist"** (glossary term; "ideas"/"shortlist" are avoid-words). |
| D8 | Remaining desktop details. | **Match the kit:** right panel **sun yellow** (`--accent-money`), not teal; sample cards at kit sizes and pixel offsets ("26" at 76px, "Japan in Autumn" at 30px, "Come on in" at 30px); the teal "Jess forked 'Slow Kyoto'" card at every desktop width; lilac card back to kit copy ("Kyoto · 4 nights" / "Zz Machiya near Gion" / "paid ✓"); real `Avatar` components; decorative chips use `Badge` (a span) rather than the app's `Chip`, which renders a `<button>` and would put focusable controls inside an `aria-hidden` block — the kit's Chip is static here. Hero body says **"sleeps"** (kit), to rhyme with "26 sleeps to go". **Privacy/Terms links kept** under the card, small and muted (not in the kit). **Light mode stays forced** (26 Sep spec I1). Between lg and 1280px the desktop card box scales down (0.66 / 0.82) so the kit's pixel layout fits the narrower column (final review, 2026-09-29). |

## 1. Detail

### 1.1 Desktop Landing (`/`, from `lg`)

`app/landing/landing.tsx` (rewrite in place; keep the file).

- **Frame:** `lg:grid lg:grid-cols-[1fr_440px] lg:min-h-dvh` as now. Left column padded as the kit
  (48px). The kit's 2px ink border, radius and 8px shadow around the whole thing belong to its
  viewer frame, not the page — do not draw them.
- **Header:** `Logo size={30}` left; right: `Button variant="secondary" size="sm"` **"Sign in"** →
  `/signin`. Nothing else.
- **Hero:** h1 "Plan it with your people." with a coral full stop, 88px, line-height 0.92,
  `mt-16`, max-width 640 (unchanged). Body, `--type-body-l` weight 600, 19px, max-width 480:
  *"Stops, sleeps, trains and money in one place — shared with whoever's coming. Fork the plan when
  you disagree. Count sleeps, not days."*
- **CTA:** one large primary **"Start a trip"** → `/signin`. No chip (D2).
- **Sample cards** in a `relative` box `left:48 right:48 bottom:-30 h:260` (the column gets
  `lg:pb-[300px]` as now so nothing overlaps the fold):

  | Card | Content | Box |
  |---|---|---|
  | Coral | `Chip tone="white" size="s"` uppercase "Planning"; h2 "Japan in Autumn" 30px; "26" at 76px (`--type-display-xl`); "sleeps / to go" 22px | `left:0 bottom:40 w:300`, rotate −5° |
  | Lilac | label "Kyoto · 4 nights"; h4 "Zz Machiya near Gion"; `Chip tone="teal" size="s"` "paid ✓" | `left:330 bottom:90 w:250`, rotate 3° |
  | Sun chip | `Chip tone="sun" size="l"` "→ Shinkansen · Odawara 11:12", `shadow-hard-2` | `left:360 bottom:30`, rotate −7° |
  | Teal | two `Avatar`s 26px (JM on sun, AL on lilac), then "Jess forked" / "“Slow Kyoto”" | `left:620 bottom:70 w:150`, rotate 6°, **visible from `lg`** |

  Kit pixel offsets, not percentages. The tilt is each card's rest state; the entrance animates
  toward it (§1.4).
- **Right panel:** `bg-sun` (the kit's `--accent-money`), full height, card centred: `Card`
  shadow 4, radius xl, `p-7`, width 360. Title h2 **"Come on in"** 30px. Contents per D4, top to
  bottom:
  1. Sub-line: *"Teepee is invite-only — sign in with the Google account you were invited with."*
     (or the access-denied copy, unchanged, when `accessDenied`).
  2. `GoogleSignInButton` (or the existing "no sign-in configured" note).
  3. In development only: a **dotted** "or" divider (kit style, `border-dotted`) and the dev
     You/Partner buttons.
  4. Muted 13px line: **"Email and Apple sign-in are on the way."**
  5. Under the card, outside it: the existing Privacy / Terms nav, `text-xs text-muted-foreground`.
- **Theme:** `data-theme="light"` + `light` class on the root, as now.

### 1.2 Phone Landing (`/`, below `lg`)

Same file, the non-`lg` branch, following `teepee-mobile/Landing.jsx`:

- Page is a `min-h-dvh` flex column, `px-6`, safe-area aware: header, hero, cards, then the sheet
  as the last block (`mt-auto`).
- **Header:** `Logo size={26}`; right: "Sign in" → `/signin` (D5).
- **Hero:** h1 50px, line-height 0.95, `pt-7`. Body: *"Stops, sleeps, trains and money in one place
  — shared with whoever's coming."*, 15px, max-width 300.
- **Cards** in a `relative h-[210px]` box:

  | Card | Content | Box |
  |---|---|---|
  | Coral | chip "Planning"; "Japan in Autumn" (h3 size); "26" at `--type-display-l`; "sleeps to go" | `left:0 bottom:0 w:210`, −4° |
  | Lilac | `Chip tone="white" size="s"` "Zz Machiya Gion ✓"; label "Kyoto · 4 nights" | `right:0 top:96 w:140`, 5° |
  | Sun chip | "→ Shinkansen · 11:12" | `left:120 top:150`, −8° |
  | Teal chip | "let's go" | `right:20 top:170`, 6° |

  Exact offsets from `Landing.jsx`; if the kit's numbers differ from these, the kit's win.
- **Sheet:** `bg-card`, `border-t-2 border-border`, `rounded-t-2xl`, `-mx-6 px-6 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]`. Contents identical to the desktop card's list in §1.1
  (invite line, Google, dev logins in development, the "on the way" line, Privacy/Terms). The kit's
  centred 11px "No passwords…" line is replaced by the "on the way" line at the same size and
  alignment.
- Cards are **not** hidden at any width.

### 1.3 Sign in (`/signin`)

`app/signin/page.tsx` stops rendering `<Landing/>` and renders a new `app/signin/sign-in-screen.tsx`
(Server Component; the buttons stay in `signin-buttons.tsx`). From the kit's `SignIn`:

- Two columns from `lg` (`lg:grid-cols-2`, i.e. `1fr 1fr`), stacked below.
- **Left:** `Logo size={32}`; h1 "Plan it with your people." 64px with the full stop in
  `text-coral` (the kit's `--accent-primary-text`); body 15px: *"One trip, everyone on it. Stops,
  days, money and the Wishlist."*; `Button variant="secondary" size="lg"` **"Continue with Google"**
  (the `GoogleSignInButton` styled to match, or the existing component if its look is the kit
  secondary); line: *"Got an invite? Sign in with the email it was sent to and the trip will be
  waiting."*; in development, the dev logins under a dotted divider; the "on the way" line; the
  Privacy/Terms nav.
- **Right:** `bg-sun` panel with one tilted coral `Card`, shadow 5: `Chip` "19 sleeps", "Japan in
  Autumn" (h2), "12 – 24 Oct · 4 stops". Rotate −3°, same entrance as the Landing cards.
- **Access denied** (`?error=AccessDenied` or however `signin/page.tsx` derives it today): the
  current explanatory copy replaces the "Got an invite?" line; nothing else changes.
- **Theme:** light forced, as the Landing.
- Signed-in visitors still redirect to `/trips` (unchanged).

### 1.4 Motion (D3)

One CSS animation set in `app/globals.css`, next to the existing `tp-*` keyframes, used by both
pages:

- `@keyframes tp-card-in { from { opacity: 0; transform: translateY(24px) rotate(var(--tp-tilt-from)); } to { opacity: 1; transform: translateY(0) rotate(var(--tp-tilt)); } }`
  Each card sets `--tp-tilt` (its rest rotation) and `--tp-tilt-from` (rest ± 4°, overshooting
  away from rest), runs `tp-card-in 420ms var(--ease-bounce) both` with `animation-delay` staggered
  80ms apart in reading order (coral, lilac, sun, teal), and the sign-in card/sheet last at
  +400ms using the existing `tp-zoom-in`-style keyframe (`translateY(16px) scale(.97)` → none).
- Hover (desktop, `@media (hover: hover)`): `transition: transform var(--dur-fast) var(--ease-pop)`;
  `:hover { transform: translateY(-4px) rotate(calc(var(--tp-tilt) * 0.8)); }`.
- `@media (prefers-reduced-motion: reduce)`: no animation, cards render at rest, opacity 1.
- Nothing loops. No JS animation library (ADR 0006 allows Motion for content, but CSS suffices here).

### 1.5 Copy and vocabulary

- "sleeps" is fine on these pages (it is the countdown's own word: "26 sleeps to go").
- "the Wishlist", never "maybe-list", "ideas", "shortlist".
- The lilac card's "Kyoto · 4 nights" / "Zz Machiya near Gion" does not use "stay" or "hotel"; the
  "Where you're staying" label is removed from the card.
- No "free for up to 6 people"; no "How it works"; no "No passwords. We'll email you a link."

## 2. Out of scope

- Magic-link email sign-in and Apple sign-in (the "on the way" line is the only trace).
- A "How it works" section or page.
- Any change to auth, invites, `proxy.ts` redirects or the access-denied logic.
- Dark mode on these pages.

## 3. Tests to change

`app/landing/landing.test.tsx`: keep the h1, `/signin` link, light-mode and access-denied tests; the
"no textbox / no form" test stays valid (D4); the "Where you're staying present" assertion is
**replaced** by "Kyoto · 4 nights" and "Zz Machiya near Gion" present and no "stay"/"hotel"
anywhere; add: header has a "Sign in" link to `/signin`; the panel/sheet has the "on the way" line;
no "free for up to 6", no "How it works"; the four desktop cards and four phone cards render
(both trees are in the DOM, one hidden by breakpoint, so query by `data-slot`); each card carries
the entrance class and a `--tp-tilt` style. `app/signin/page.test.tsx`: the page no longer renders
the Landing; it renders "Continue with Google", "Got an invite?" and "the Wishlist"; access denied
swaps the copy. `app/globals.test.ts` or a sibling: the new keyframes exist and are disabled under
reduced motion.

## 4. Verification

- `npm test`, `npm run lint`, `npx tsc --noEmit`.
- Manual on beta: `/` signed out at 1280×800 (the kit's canvas), 1440×900, 390 and 360 wide; `/signin`
  at the same; the entrance plays once, nothing moves afterwards; with "Reduce motion" on, nothing
  animates; hover lifts a card on desktop.
