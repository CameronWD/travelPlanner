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
  lib/                   ← hues.ts (new), categories.ts, chapter-colours.ts, map-palette.ts (new), map-pins.ts, og-card.tsx (new)
  app/global-error.tsx, app/(app)/error.tsx, */not-found.tsx, opengraph-image.tsx, (app)/admin/page.tsx
  components/trip/notification-bell.tsx, components/legal/legal-page.tsx
  public/brand/          ← outlined wordmark + lockup SVGs (light, on-dark)
  docs/notifications.md  ← copy rules for step 7, as plain text
  reference/             ← the design itself: ui_kits, specs, guidelines, tokens, components, Gap Specs
```

**Design reference ships in `reference/`.** Open it through a static server (`npx serve reference`), because the kits load JSX over fetch:
- `reference/ui_kits/teepee-mobile|tablet|desktop/index.html` has every screen. The source is in `reference/ui_kits/shared/*.jsx`: onthego (Today, Summary, Globe), together (Checklists, Files, Journal, Activity, Compare, Print), admin (Trip settings, Account, Help, What's new, Sign in, Feedback, More) and planedit (Plan editor, TransportForm, CostFields).
- `reference/specs/index.html` (components + states), `specs/motion.html`, `specs/notifications.html` (also in `docs/notifications.md`).
- `reference/guidelines/*.card.html`: the foundations.
- `reference/Gap Specs.dc.html`: the hue ramp, map palette, ErrorPanel, skeleton archetypes, OG, wordmark, admin, legal, not-founds, trip help, bell and FAB.

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
| Logo | `ui/logo.tsx` + `ui/logo-paths.ts` | **new**. Wordmark is outlined paths (no font dependency) | S |
| Icon | `ui/icon.tsx` | **new**: lucide defaults + TentIcon | S |
| OfflineBanner | `ui/offline-banner.tsx` | **new** | C |
| ErrorPanel, InlineError | `ui/error-panel.tsx` | **new** | S |
| List/Detail/Calendar/Map/FormSkeleton | `ui/skeletons.tsx` | **new** | S |

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

## Categorical colour (categories + chapters)

One ramp with 8 hues plus stone: `--hue-{sky,sun,leaf,lilac,pink,teal,coral,indigo,stone}` and `--hue-*-text`, in light and dark (`globals.css`, `lib/hues.ts`). The four brand accents appear in it at their exact values.

**Categories** (`lib/categories.ts`):
- Each category gets a `hue` and an `icon`, and `categoryClasses(value)` returns `{ chip, dot, text, soft, fill }`.
- `color` is kept, deprecated, so the ~200 call sites still compile. Migrate each `${color}-…` string to `categoryClasses()`, then delete `color`.
- Mapping: Sightseeing sky, Food sun, Activity leaf, Nightlife lilac, Shopping pink, Getting around indigo, Other stone.

**Chapters** (`lib/chapter-colours.ts`):
- Stored values are unchanged, so no migration is needed.
- `chipClass`, `dotClass` and the new `railClass` now use the ramp. `swatch` plus the new `swatchDark` are for Leaflet.
- Labels are renamed Sun, Leaf, Lilac, Pink, Coral. Update `chapter-colours.test.ts` if it asserts labels.

**Rules:**
- Fills always get ink text (`text-on-accent`) and `border-2 border-border`.
- Hue as text on paper uses `text-hue-*-text` (≥ 4.8:1).
- Category pills carry their icon. Chapter chips are white with a hue dot, so the two never read as each other.

## Maps

`lib/map-palette.ts` is the only lib file with hex (each value comments its token):
- `hueHex(hue, dark)` and `mapInk(dark)` for colours.
- `routeStyles(dark)` returns casing, line, flight, rough, missing, past and return styles.

`lib/map-pins.ts`:
- `pinHex(category, dark?)` keeps its old signature.
- New `pinHtml({ variant, fill, label, glyph, selected, dark })` builds the sticker pins for `L.divIcon`.
- Pin variants are stop, category, now, home, wish and cluster (sizes in `pinSize`).

Tiles stay on `cartoTiles(isDark)`. Pass the same `isDark` flag into the pins and polylines, then call `setStyle` / `setIcon` on theme change, the same way `setUrl` already works.

**Hex is allowed in exactly three places:** `lib/map-palette.ts`, `app/global-error.tsx` and `app/**/opengraph-image.tsx` + `lib/og-card.tsx`. Everything else uses tokens.

## Errors, loading, OG

- **`ui/error-panel.tsx`** (S) has `kind` error | offline | not-found | forbidden, plus `actions`, `digest` and `layout` page | card. `InlineError` covers errors inside forms and cards. `error.tsx` passes `<Button onClick={reset}>`. We show the digest, never the message.
- **`app/global-error.tsx`** is the sanctioned exception: inline styles and hex, with dark mode via `prefers-color-scheme`. It uses an outlined wordmark (no web font) and a plain `<a href="/trips">` so it doesn't need the router.
- **`ui/skeletons.tsx`** (S) has five archetypes. Map each `loading.tsx` like this:
  - **List:** trips, plan, wishlist, checklists, files, journal, activity, admin.
  - **Detail:** trip home, stop, summary, today, account, trip settings, compare.
  - **Calendar:** calendar, day/[date].
  - **Map:** globe. Route, wishlist and day maps use `MapSkeleton` inside their `*-map-loader.tsx` `loading:` fallback.
  - **Form:** trips/new.
  - Budget: Detail, as its stat cards plus the Still-to-pay list.
- **OG:** dynamic `app/share/[token]/opengraph-image.tsx` shows the name, dates, nights, first five stops in chapter hues, and the phase. It never shows costs, beds or times. An invalid or revoked token gets the generic card, not an error, because unfurlers cache errors. The generic card is `app/opengraph-image.tsx`. Add `app/fonts/BricolageGrotesque-ExtraBold.ttf` and `PlusJakartaSans-Bold.ttf` (OFL). Confirm the Stop → Chapter relation name in the OG query.

## Screens with no kit screen → where they're designed

All of these are in `reference/Gap Specs.dc.html` §B9.

| Route / component | Handoff file | Notes |
|---|---|---|
| `/admin` | `app/(app)/admin/page.tsx` | Operator console, restyle only. Ink sections, count badges. Panel row classes are in the file header |
| `/privacy`, `/terms` | `components/legal/legal-page.tsx` | Wrap the existing copy in `LegalPage` + `LegalSection`. Body is 15px at full foreground |
| `(app)/not-found`, `trips/[tripId]/not-found`, `share/[token]/not-found` | same paths | ErrorPanel `not-found` |
| `trips/[tripId]/help`, `/help` | no new file | Page header already matches. `help-legend.tsx` picks up the new CategoryPill/ChapterChip automatically. Accordion rows = ListRow look |
| Notification bell | `components/trip/notification-bell.tsx` | Restyle only, same props |
| Feedback FAB | edit `feedback-launcher.tsx` L516 | Class string is in Gap Specs §B9. It stays keyed to `--tp-tab-bar-h`, so 4.75rem is automatic. Update the test string |

## Known gaps

- **Not type-checked:** these files haven't been compiled against the repo. Run `tsc`, `lint` and `test` after copying.
- **Push:** notification copy and batching rules are specified in `docs/notifications.md`; the server-side batching isn't built.
- **Hue ramp CVD:** lilac/indigo and sky/teal are the closest pairs (ΔE_ok ≈ 0.10–0.11). Chapters always show their name, so this is acceptable, but don't use chapter colour alone as a map legend.
