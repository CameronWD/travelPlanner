# Teepee · Playground handoff

This is the redesign packaged for `CameronWD/travelPlanner` (Next.js 16, React 19, Tailwind v4, Radix/shadcn, lucide-react).
Everything in `handoff/` mirrors the repo's paths, so it can be copied over the repo and reviewed as a diff.

## What's here

```
handoff/
  app/globals.css        ← replaces the repo file. Same token names, new values and extras
  app/layout.tsx         ← Space Grotesk → Bricolage Grotesque; theme colours; icons
  app/manifest.ts        ← new name, colours and icon set
  components/ui/*.tsx    ← restyled existing components + new ones (below)
  public/                ← favicon.svg (adapts to dark tabs), PNGs, maskable PWA icons, push badge
  emails/*.html          ← 4 send-ready transactional emails
  tokens.json            ← W3C design-tokens export (Figma Tokens / Style Dictionary)
```

Live references in the design system project:
`specs/index.html` (every component and state), `specs/motion.html`, `specs/notifications.html`,
`ui_kits/teepee-mobile|tablet|desktop/index.html` (all screens), `guidelines/*.card.html` (foundations).

## Install order

1. **Tokens.** Replace `app/globals.css`. Token *names* are unchanged (`--background`, `--primary`, `--border`, …, HSL channels), so every existing utility keeps working and re-skins.
   - `shadow-soft` and `shadow-soft-lg` now map to hard offset shadows, so existing call sites get the new look automatically.
2. **Fonts.** Replace `app/layout.tsx`. It swaps in `Bricolage_Grotesque` (OFL, Google Fonts, so there's no licence cost). Plus Jakarta stays.
3. **Icons and PWA.**
   - Copy `public/` in.
   - Replace `app/manifest.ts`.
   - Delete `app/icon.*` and `app/apple-icon.*`: the static files replace them.
4. **Components.** Copy `components/ui/*` in. The restyled files keep their exports and props. Then run `npm test`, because tests that assert on class names (e.g. `button.test.tsx`) may need updating.
5. **Mobile tab bar.** Swap `components/trip/mobile-tab-bar.tsx` for `components/ui/tab-bar.tsx`. `--tp-tab-bar-h` is updated to 4.75rem to match.
6. **Emails.** Port `emails/*.html` to React Email components, or send them as they are. Subject = push title; preheader = push body.

## Token changes (light · dark)

| Token | Was | Now | Role |
|---|---|---|---|
| `--background` | warm off-white | `#FFFBF3` · `#211F1B` | paper |
| `--foreground` | brown-ink | `#1D1D1B` · `#EDE6D8` | ink / bone |
| `--card` | white | `#FFFFFF` · `#2C2924` | card |
| `--muted` | beige | `#EFE9DF` · `#37342E` | canvas |
| `--muted-foreground` | | `#6B6660` · `#A59D8F` | 5.5:1+ |
| `--border` | soft beige | **ink** `#1D1D1B` · `#5A554C` | the 2px outline |
| `--border-soft` | *new* | `#C9C4BA` · `#4A463F` | dashed / dividers |
| `--input` | = border | ink · `#827B6E` | controls, ≥ 3:1 in dark |
| `--ring` | coral | ink · bone | focus ring |
| `--primary` | coral | **ink** · bone | primary button = ink with coral shadow |
| `--accent` | teal | coral | |
| `--success` / `--warning` | green / amber | teal / sun | |
| `--destructive` | red | `#B8391D` · `#E8866C` | |
| `--coral --sun --teal --lilac` | *new* | fills | one colour per idea: trip · money · route · beds |
| `--coral-text …` | *new* | `#B8391D` `#80600F` `#1C706E` `#6D43B8` | accent as text on neutral surfaces |
| `--on-accent`, `--on-accent-muted` | *new* | dark ink in both themes | text on accent fills |
| `--radius` | 1rem | 1.25rem | sm 10 · md 14 · lg 20 · xl 24 · 2xl 28 |

New utilities:
- **Shadows:** `shadow-hard-1…5`, `shadow-cta`, `shadow-pressed`.
- **Colours:** `bg-coral`, `text-coral-text`, etc.
- **Easing:** `ease-pop`, `ease-bounce`, `ease-exit`.
- **`island`:** re-scopes text, borders and inner surfaces on an accent fill.
- **`pressable`:** hover-lift and press physics.
- **Animations:** the `tp-*` utilities.

## Components

S = Server Component; C = `"use client"`. The `"use client"` directive is already at the top of each C file.

| Design system | Repo file | Status | |
|---|---|---|---|
| Button | `ui/button.tsx` | restyled. Same API, + `accent`, `dashed`; default shape is pill | C |
| Card (+ tone, sticker, interactive) | `ui/card.tsx` | restyled, + `tone` `shadow` `radius` `dashed` `interactive` `sticker` | S |
| Chip (static) | `ui/badge.tsx` | restyled, + `coral/sun/teal/lilac/ink`, `caps` | S |
| Chip (clickable) | `ui/chip.tsx` | **new** | C |
| Badge (count) | `ui/count-badge.tsx` | **new** | S |
| Input | `ui/input.tsx` | restyled, + `inputSize` | S |
| Segmented | `ui/segmented.tsx` | restyled, + `tone` | C |
| Sheet (mobile) / dialog (desktop) | `ui/dialog.tsx` | restyled. Same exports | C |
| EmptyState | `ui/empty-state.tsx` | restyled, + `glyph`, `tone` | S |
| Skeleton | `ui/skeleton.tsx` | restyled | S |
| ProgressBar | `ui/progress-bar.tsx` | **new** | S |
| StatCard | `ui/stat-card.tsx` | **new** | S |
| ListRow | `ui/list-row.tsx` | **new** (`as={Link}` to navigate) | S |
| Stepper | `ui/stepper.tsx` | **new** | C |
| Toggle | `ui/switch.tsx` | **new** | C |
| Checkbox | `ui/checkbox.tsx` | **new** (native input) | C |
| TabBar | `ui/tab-bar.tsx` | **new**, replaces `trip/mobile-tab-bar.tsx` | C |
| Dock | `ui/dock.tsx` | **new** (md+) | C |
| Logo | `ui/logo.tsx` | **new** | S |
| Icon | `ui/icon.tsx` | **new**: lucide defaults + TentIcon | S |
| OfflineBanner | `ui/offline-banner.tsx` | **new** | C |

Restyle by hand. These components weren't rewritten, and the class changes are small:
- **`avatar.tsx`:** `border-2 border-border`, fill `bg-{tone}`, 800-weight initials.
- **`toast.tsx`:** `rounded-md border-2 border-border shadow-hard-2 bg-teal island`. Enter with `tp-toast-in`, exit with `tp-toast-out`.
- **`sheet.tsx`:** same classes as `dialog.tsx`.
- **`select.tsx`, `textarea.tsx`, `money-input.tsx`:** `border-2 border-input rounded-md bg-card`, plus the Input focus lift.
- **`tabs.tsx`:** use the Segmented look.
- **`popover.tsx`, `dropdown-menu.tsx`:** `border-2 border-border rounded-md shadow-hard-3 bg-card`.

**Server/Client rule.** S components never define event handlers. Passing `onClick` to one (`Card`, `ListRow as="button"`) makes the *caller* a Client Component. Keep list and detail pages as Server Components, and push interactivity down to C leaves (Chip, Stepper, Switch, Segmented).

## Screens → routes

Checked against the repo's `app/` tree (2026-09-23).

| Design screen (ui_kits) | Route in repo | Notes |
|---|---|---|
| Landing | `app/page.tsx`, `app/signin/page.tsx` | S |
| Onboarding (3 steps) | `app/(app)/trips/new` | C form → existing create action |
| Trips | `app/(app)/trips/page.tsx` | S |
| Home | `app/(app)/trips/[tripId]/page.tsx` | S. Adaptive home (ADR 0010) |
| Plan + Stop detail | `…/[tripId]/plan` | S list. Stop detail = mobile page, tablet/desktop aside |
| Days | `…/[tripId]/calendar` + `…/day/[date]` | month grid + day view |
| Money | `…/[tripId]/budget` | shared pot · "Still to pay" list |
| Wishlist | `…/[tripId]/wishlist` | votes = C Chip |
| People + Invite | `…/[tripId]/settings` (invite section) | Invite = FormDialog |
| You | `app/(app)/account` | notification matrix |
| Search (⌘K) | global Dialog `bare` | new |
| Public link | `app/share/[token]/page.tsx` | S, no auth, costs hidden |
| States | `loading.tsx` / `error.tsx` per route | Skeleton, ErrorPanel, OfflineBanner |

**Also designed (in `ui_kits/shared/onthego|together|admin|planedit.jsx`):**
- **Today:** `…/today`, the travel-day view, offline-first.
- **Summary:** `…/summary`, with flags and the route map.
- **Globe:** `/globe`, where "want to go" pins can be added to a trip's wishlist.
- **Checklists:** `…/checklists`, pre-trip and packing, with templates.
- **Files:** `…/files`, with an offline status on each file.
- **Journal:** `…/journal`.
- **Activity:** `…/activity`.
- **Compare:** `…/compare`, which diffs the real plan against a fork.
- **Print:** `…/print`, plus the calendar feed.
- **Trip settings:** `…/settings`, covering the cover image, hard end date, home base and round trip, currency, exchange-rate overrides, travellers, share, feed, duplicate and delete.
- **Account:** `/account`.
- **Help:** `/help`.
- **What's new:** `/whats-new`.
- **Sign in:** `/signin`.
- **Feedback panel:** built on the existing in-product feedback notes feature.
- **Plan editor details:**
  - Home base at the start and end of the plan.
  - Chapter bands.
  - Dated stops, and rough stops you can drag to reorder.
  - Missing connections.
  - Setting dates for all stops.
  - A projected-end warning with "Make it fit", and next steps.
- **Transport form:** time zones, +1 day arrivals, drive estimates.
- **Cost fields:** cost, then "paid", which asks what you paid (ADR 0037), with the exchange-rate snapshot.

Mobile gets a **More** screen for everything beyond the four tabs. Desktop and tablet get **Today** and **More** in the dock. Discreet mode is intentionally not redesigned.

**Money is a shared pot.** There's no per-person splitting, matching SPEC.md. Money shows "Still to pay" instead of balances.

## Layout

- Breakpoints: Tailwind `md` (768) and `lg` (1024).
- **Below `md`:** TabBar, bottom-sheet dialogs, 18px gutter.
- **`md` and up:** Dock, centred dialogs, content up to 720px wide. Plan splits with the stop panel in landscape.
- **`lg` and up:** page title with its primary button, a 340px aside, 32px gutter.

## Motion

- **Timings:** 120ms for press and hover, 180ms for tabs and toggles, 320ms for sheets, toasts and lists, 200ms for exits.
- **Only transform and opacity animate.**
- **Reduced motion** drops everything to near-zero (in `globals.css`).
- **`motion` (framer) components:** read `useReducedMotion()` and use `ease: [0.2, 0.8, 0.2, 1]`.

## Accessibility (done in the tokens and components)

- Contrast: body text ≥ 4.5:1 in both themes, controls ≥ 3:1. Use `*-text` tokens for accent-coloured text.
- A 3px focus ring appears on keyboard focus only.
- Touch targets are ≥ 44px; clickable chips are ≥ 28px with 8px spacing.
- `aria-current` is set on nav, `role=switch/progressbar` where relevant, and icon-only buttons are labelled.

## Known gaps

- **Wordmark:** it's live text in Bricolage. Outline it to paths for the SVG lockups once the font is final.
- **Not type-checked:** these files haven't been compiled against the repo. Run `tsc`, `lint` and `test` after copying.
- **Push:** notification copy and batching rules are specified in `specs/notifications.html`; the server-side batching isn't built.
